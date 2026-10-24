/**
 * Document Kernel(文档内核):每个会话一个 SessionWorkspace,负责
 *
 *   绑定当前文件 → 加载/解析 → 操作(工作副本) → 结构校验 → 自动保存
 *   → Revision+1 → 状态更新 → 撤销快照入栈
 *
 * 失败语义(requirements.md 第 26 章“修改失败不留下半完成状态”):
 * - 操作入参非法:操作在变更前抛错,文档不变;
 * - 校验失败:回滚到操作前快照,VALIDATION_FAILED;
 * - 保存失败:回滚到操作前快照,SAVE_FAILED(内存与磁盘保持一致)。
 *
 * 撤销(Undo):每次成功提交前把整份文档深拷贝入栈(文档规模小,代价可忽略),
 * undo 弹出快照恢复,并保证节点 ID 计数器单调不减(ID 永不复用)。
 */
import { basename } from 'node:path';
import { DocumentOperationError } from "../model/errors.js";
import { allocateNodeId, cloneDocument, findNodeById, nodeBreadcrumb, walkNodes } from "../model/document.js";
import { requireProfile } from "../profiles/profiles.js";
import { opAddNode, opChangeRole, opDeleteNode, opMoveNode, opReorderNode, opSetProperty, opUpdateNode, validatePropertiesForRole, } from "../operations/ops.js";
import { validateDocument } from "../model/validation.js";
import { createEmptyDocument, parseMarkdown, serializeMarkdown } from "../storage/markdown-adapter.js";
import { createSidecarV2, hashText, loadSidecar, restoreSidecarV2, saveSidecar } from "../storage/storage.js";
import { DocumentStateTracker } from "./document-state.js";
import { resolveNodeRef } from "./references.js";
/** 单个会话的文档工作区。 */
export class SessionWorkspace {
    sessionId;
    options;
    doc = null;
    profile = null;
    /** 绑定(或最近一次保存)时磁盘文件内容的哈希,用于 sidecar 一致性。 */
    loadedHash = null;
    /** v1 sidecar 已被采纳但尚未通过业务修改迁移；选择操作不得提前覆盖它。 */
    legacySidecarLoaded = false;
    state = new DocumentStateTracker();
    undoStack = [];
    /** 同一宿主进程内，切换文档后仍可撤销各自的最近修改。 */
    undoStacksByFile = new Map();
    changeListeners = new Set();
    completedRequests = new Map();
    constructor(sessionId, options) {
        this.sessionId = sessionId;
        this.options = options;
    }
    /** 订阅工作区变化(bound/unbound/document/selection);返回退订函数。 */
    onChanged(listener) {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }
    emit(change) {
        for (const listener of [...this.changeListeners]) {
            try {
                listener(change);
            }
            catch {
                // 监听器异常不阻断工作区。
            }
        }
    }
    get bound() {
        return this.doc !== null;
    }
    get document() {
        if (this.doc === null) {
            throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先绑定一个结构化文档(当前文件)。');
        }
        return this.doc;
    }
    get currentProfile() {
        if (this.profile === null) {
            throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先绑定一个结构化文档(当前文件)。');
        }
        return this.profile;
    }
    get undoDepth() {
        return this.undoStack.length;
    }
    /** 绑定当前文件(加载 + 解析 + sidecar 采纳)。 */
    async bindFile(rawPath) {
        this.stashUndo();
        const filePath = await this.options.resolvePath(this.sessionId, rawPath);
        let text;
        try {
            text = await this.options.storage.readFile(filePath);
        }
        catch (error) {
            throw new DocumentOperationError('FILE_NOT_FOUND', `无法读取当前文件:${filePath}(${error instanceof Error ? error.message : String(error)})。`);
        }
        const sidecar = await loadSidecar(this.options.storage, filePath);
        const hash = hashText(text);
        this.loadedHash = hash;
        const now = this.now();
        const fileName = basename(filePath);
        if (sidecar !== null && sidecar.content_hash === hash && sidecar.format_version === 1) {
            // 源文件未变化:直接采纳 sidecar 里的 IR(无损、ID 稳定)。
            this.doc = sidecar.document;
            this.profile = requireProfile(this.doc.profile);
            this.state.currentFilePath = filePath;
            this.state.restorePersisted(sidecar.state);
            this.state.dirty = false;
            this.restoreUndo(filePath, hash);
            this.legacySidecarLoaded = true;
            this.emit({ kind: 'bound', filePath, revision: this.doc.revision, selectedNodeId: this.state.selectedNodeId });
            return { filePath, title: this.doc.title, profileId: this.doc.profile, nodeCount: this.countNodes(), source: 'sidecar', revision: this.doc.revision };
        }
        // v2 始终从 Markdown 恢复业务字段；v1 哈希失效时仅沿用旧 Profile 作为回退。
        const fallbackProfileId = sidecar?.format_version === 1 ? sidecar.document.profile : this.options.defaultProfile;
        requireProfile(fallbackProfileId);
        const parsed = parseMarkdown(text, {
            profileId: fallbackProfileId,
            now,
            createdBy: 'import:markdown',
            fileName,
        }, filePath);
        this.doc = sidecar?.format_version === 2 && sidecar.content_hash === hash
            ? restoreSidecarV2(parsed.doc, sidecar)
            : parsed.doc;
        const profileId = parsed.profileId;
        this.profile = requireProfile(profileId);
        this.state.currentFilePath = filePath;
        if (sidecar?.format_version === 2 && sidecar.content_hash === hash) {
            this.state.restorePersisted(sidecar.state);
        }
        else {
            this.state.selectedNodeId = null;
            this.state.lastEditedNodeId = null;
            this.state.lastCreatedNodeId = null;
        }
        this.state.dirty = false;
        this.restoreUndo(filePath, hash);
        this.legacySidecarLoaded = false;
        this.emit({ kind: 'bound', filePath, revision: this.doc.revision, selectedNodeId: this.state.selectedNodeId });
        const source = sidecar === null ? 'fresh' : sidecar.format_version === 2 && sidecar.content_hash === hash ? 'sidecar' : 'reparsed';
        return { filePath, title: this.doc.title, profileId, nodeCount: this.countNodes(), source, revision: this.doc.revision };
    }
    /** 解绑当前文件(丢弃内存状态;磁盘文件不受影响)。 */
    unbindFile() {
        this.stashUndo();
        this.doc = null;
        this.profile = null;
        this.state.currentFilePath = null;
        this.state.selectedNodeId = null;
        this.state.lastEditedNodeId = null;
        this.state.lastCreatedNodeId = null;
        this.state.dirty = false;
        this.undoStack = [];
        this.loadedHash = null;
        this.legacySidecarLoaded = false;
        this.emit({ kind: 'unbound' });
    }
    /**
     * 外部修改检测:当前文件在会话外被改动时(内容哈希与最近一次加载/保存不一致),
     * 以磁盘为准重新解析、重新分配 ID,并清空撤销栈与状态指针。
     * 返回是否发生了重新加载。工具层在每次调用前调用本方法(requireBound 之后)。
     */
    async refreshIfExternalChanged() {
        if (this.doc === null)
            return false;
        const filePath = this.state.currentFilePath;
        if (filePath === null)
            return false;
        let text;
        try {
            text = await this.options.storage.readFile(filePath);
        }
        catch {
            return false; // 文件暂时读不到(被占用/删除):保留内存状态,写路径会如实报错。
        }
        if (hashText(text) === this.loadedHash)
            return false;
        // 以磁盘为准:重新装载(放弃内存未保存修改与撤销历史)。
        await this.bindFile(filePath);
        return true;
    }
    now() {
        return (this.options.now ?? (() => new Date()))();
    }
    stashUndo() {
        const filePath = this.state.currentFilePath;
        if (filePath === null || this.loadedHash === null)
            return;
        this.undoStacksByFile.set(filePath, {
            hash: this.loadedHash,
            entries: this.undoStack.map(entry => ({ ...entry, snapshot: cloneDocument(entry.snapshot) })),
        });
    }
    restoreUndo(filePath, hash) {
        const saved = this.undoStacksByFile.get(filePath);
        if (saved === undefined || saved.hash !== hash) {
            // 外部修改会改变哈希；旧快照不能再安全地应用。
            this.undoStacksByFile.delete(filePath);
            this.undoStack = [];
            return;
        }
        this.undoStack = saved.entries.map(entry => ({ ...entry, snapshot: cloneDocument(entry.snapshot) }));
    }
    countNodes() {
        let count = 0;
        for (const _ of walkNodes(this.document))
            count += 1;
        return count;
    }
    // ─── 读操作 ──────────────────────────────────────────────────────────────
    /** 完整文档视图。 */
    getDocument() {
        return {
            doc: this.document,
            profile: this.currentProfile,
            state: this.state.snapshot(this.document),
        };
    }
    /** 大纲(扁平行,带深度;渲染为树形文本)。 */
    getOutline(maxDepth) {
        const doc = this.document;
        const rows = [];
        const visit = (node, depth) => {
            if (maxDepth !== undefined && depth > maxDepth)
                return;
            rows.push({
                node_id: node.id,
                title: node.title,
                role: node.role,
                depth,
                content_preview: node.content === '' ? undefined : firstLine(node.content),
                child_count: node.children.length,
            });
            for (const child of node.children)
                visit(child, depth + 1);
        };
        visit(doc.root, 0);
        return rows;
    }
    /** 按标题/内容/角色/属性查找节点。 */
    findNodes(filter) {
        const doc = this.document;
        const matches = [];
        const visit = (node) => {
            if (matchesFilter(node, filter)) {
                const path = node.id === doc.root.id ? '' : nodeBreadcrumb(doc, node.id) ?? '';
                matches.push({ node, path });
            }
            for (const child of node.children)
                visit(child);
        };
        visit(doc.root);
        return matches;
    }
    /** 解析节点引用(供工具层使用)。 */
    resolveRef(args, hint) {
        return resolveNodeRef(this.document, this.state, args, hint).node;
    }
    /** 当前节点(可能为 null)。 */
    getSelectedNode() {
        if (this.doc === null)
            return null;
        return this.state.selectedNodeId === null ? null : findNodeById(this.doc, this.state.selectedNodeId) ?? null;
    }
    // ─── 写操作管线 ─────────────────────────────────────────────────────────
    requireChangeTarget(nodeId) {
        if (findNodeById(this.document, nodeId) === undefined) {
            throw new DocumentOperationError('NODE_NOT_FOUND', `未找到节点:${nodeId}。`);
        }
    }
    /**
     * 通用变更管线:快照 → 变更 → 校验 → 保存 → 提交状态与撤销。
     * mutator 直接在工作文档上变更;返回操作结果。
     */
    async commit(action, mutator, pointers) {
        const startedAt = Date.now();
        const before = this.document;
        const snapshot = cloneDocument(before);
        const originalProfile = this.profile;
        const now = this.now();
        let result;
        try {
            result = mutator(before, now);
        }
        catch (error) {
            // 变更前抛错:文档未变,直接透传。
            throw error;
        }
        const violations = validateDocument(before, this.currentProfile);
        if (violations.length > 0) {
            this.doc = snapshot;
            this.profile = originalProfile;
            throw new DocumentOperationError('VALIDATION_FAILED', `结构校验失败:${violations.join(';')}`);
        }
        this.state.dirty = true;
        if (pointers !== undefined)
            pointers(result, this.state);
        let persistence;
        try {
            persistence = await this.persist(action, snapshot);
        }
        catch (error) {
            // 自动保存模式下文档已回滚到磁盘状态,Dirty 复位。
            this.profile = originalProfile;
            if (this.options.autoSave)
                this.state.dirty = false;
            throw error;
        }
        this.pushUndo(action, snapshot, result);
        this.emit({
            kind: 'document', revision: this.document.revision, selectedNodeId: this.state.selectedNodeId, action,
            ...(isMutationSummary(result) ? { summary: result } : {}),
            elapsedMs: Date.now() - startedAt,
        });
        return { result, revision: this.document.revision, ...persistence };
    }
    assertTarget(expectedRevision, expectedFile) {
        if (expectedFile !== undefined && expectedFile !== this.state.currentFilePath) {
            throw new DocumentOperationError('INVALID_OPERATION', `整理目标已变化:请求目标为 ${expectedFile},当前目标为 ${this.state.currentFilePath ?? '无'}。请重新读取上下文。`);
        }
        if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
            throw new DocumentOperationError('EXTERNAL_MODIFIED', `文档版本已变化:请求基于版本 ${expectedRevision},当前为 ${this.document.revision}。请重新读取后再修改。`);
        }
    }
    async idempotentMutation(action, requestId, payload, run) {
        if (requestId === undefined || requestId === '')
            return run();
        const fingerprint = JSON.stringify(payload);
        const previous = this.completedRequests.get(requestId);
        if (previous !== undefined) {
            if (previous.fingerprint !== fingerprint) {
                throw new DocumentOperationError('INVALID_OPERATION', `请求 ID ${requestId} 已被另一组 ${action} 参数使用。`);
            }
            return structuredClone(previous.result);
        }
        const result = await run();
        this.completedRequests.set(requestId, { fingerprint, result: structuredClone(result) });
        if (this.completedRequests.size > 128)
            this.completedRequests.delete(this.completedRequests.keys().next().value);
        return result;
    }
    /** Replace all document content in one validated, undoable transaction. */
    async replaceDocument(args) {
        this.assertTarget(args.expectedRevision, args.expectedFile);
        const profile = requireProfile(args.profileId);
        return this.idempotentMutation('replace_document', args.requestId, args, () => this.commit('replace_document', (doc, now) => {
            const previousIds = new Set([...walkNodes(doc)].map(node => node.id));
            const previousBusiness = new Map([...walkNodes(doc)].map(node => [node.id, JSON.stringify({ title: node.title, content: node.content, role: node.role, properties: node.properties, children: node.children.map(child => child.id) })]));
            const used = new Set(['node_001']);
            const rootInput = args.root;
            const root = {
                id: 'node_001',
                title: args.title,
                content: rootInput?.content ?? '',
                role: rootInput?.role ?? profile.defaultRole,
                properties: validateInputProperties(profile, rootInput?.role ?? profile.defaultRole, rootInput?.properties),
                children: [],
                metadata: { ...doc.root.metadata, updated_at: now.toISOString(), created_by: 'tool:replace_document' },
            };
            const next = {
                ...doc,
                title: args.title,
                profile: profile.id,
                root,
                metadata: { ...doc.metadata, updated_at: now.toISOString() },
            };
            root.children = args.children.map(input => materializeInputNode(next, profile, input, now, used, previousIds, 'tool:replace_document'));
            Object.assign(doc, next);
            this.profile = profile;
            const nextNodes = [...walkNodes(next)];
            const nextIds = new Set(nextNodes.map(node => node.id));
            const added = nextNodes.filter(node => node.id !== 'node_001' && !previousIds.has(node.id)).map(node => node.id);
            const updated = nextNodes.filter(node => previousBusiness.has(node.id) && previousBusiness.get(node.id) !== JSON.stringify({ title: node.title, content: node.content, role: node.role, properties: node.properties, children: node.children.map(child => child.id) })).map(node => node.id);
            const deleted = [...previousIds].filter(id => id !== 'node_001' && !nextIds.has(id));
            return summarizeMutation('replace', added, updated, deleted);
        }, (summary, state) => {
            state.lastEditedNodeId = this.document.root.id;
            state.lastCreatedNodeId = summary.added_node_ids.at(-1) ?? null;
            state.selectedNodeId = this.document.root.id;
            state.dirty = true;
        }));
    }
    /** Create and bind a new file with one complete initial document write. */
    async createDocument(args) {
        const startedAt = Date.now();
        const profile = requireProfile(args.profileId);
        const now = this.now();
        const doc = createEmptyDocument({ profileId: profile.id, now, createdBy: 'tool:create_document', fileName: basename(args.filePath) }, args.filePath);
        doc.title = args.title;
        doc.root.title = args.title;
        doc.root.content = args.root?.content ?? '';
        doc.root.role = args.root?.role ?? profile.defaultRole;
        doc.root.properties = validateInputProperties(profile, doc.root.role, args.root?.properties);
        const used = new Set(['node_001']);
        doc.root.children = args.children.map(input => {
            if (input.id !== undefined)
                throw new DocumentOperationError('INVALID_OPERATION', '新建文档不能指定节点 ID。');
            return materializeInputNode(doc, profile, input, now, used, new Set(), 'tool:create_document');
        });
        const violations = validateDocument(doc, profile);
        if (violations.length > 0)
            throw new DocumentOperationError('VALIDATION_FAILED', `结构校验失败:${violations.join(';')}`);
        const text = serializeMarkdown(doc);
        try {
            if (this.options.storage.createFile !== undefined)
                await this.options.storage.createFile(args.filePath, text);
            else
                await this.options.storage.writeFile(args.filePath, text);
        }
        catch (error) {
            throw new DocumentOperationError('SAVE_FAILED', `创建文档失败:${error instanceof Error ? error.message : String(error)}。`);
        }
        this.doc = doc;
        this.profile = profile;
        this.loadedHash = hashText(text);
        this.state.currentFilePath = args.filePath;
        this.state.selectedNodeId = doc.root.id;
        this.state.lastEditedNodeId = doc.root.id;
        this.state.lastCreatedNodeId = [...walkNodes(doc)].at(-1)?.id ?? null;
        this.state.markSaved();
        this.undoStack = [];
        let sidecarSaved = true;
        await saveSidecar(this.options.storage, args.filePath, createSidecarV2(doc, this.loadedHash, this.state.toPersisted())).catch(() => { sidecarSaved = false; });
        const summary = summarizeMutation('replace', [...walkNodes(doc)].slice(1).map(node => node.id), [], []);
        this.emit({ kind: 'bound', filePath: args.filePath, revision: doc.revision, selectedNodeId: doc.root.id });
        this.emit({ kind: 'document', revision: doc.revision, selectedNodeId: doc.root.id, action: 'create_document', summary, elapsedMs: Date.now() - startedAt });
        return { result: summary, revision: doc.revision, saved: true, markdownUpdated: true, sidecarSaved };
    }
    /** Apply multiple typed operations as one validated, undoable transaction. */
    async applyPatch(args) {
        this.assertTarget(args.expectedRevision, args.expectedFile);
        if (args.operations.length === 0)
            throw new DocumentOperationError('INVALID_OPERATION', '批量修改至少需要一项操作。');
        const profile = this.currentProfile;
        return this.idempotentMutation('apply_document_patch', args.requestId, args, () => this.commit('apply_document_patch', (doc, now) => {
            const added = [];
            const updated = [];
            const deleted = [];
            for (const operation of args.operations) {
                switch (operation.op) {
                    case 'add': {
                        const result = opAddNode(doc, profile, {
                            parentId: operation.parent_id, position: operation.position,
                            title: operation.node.title, content: operation.node.content,
                            role: operation.node.role, properties: operation.node.properties,
                        }, now, 'tool:apply_document_patch');
                        added.push(result.node.id);
                        appendInputChildren(doc, profile, result.node, operation.node.children ?? [], now, added);
                        break;
                    }
                    case 'update':
                        updated.push(opUpdateNode(doc, { nodeId: operation.node_id, title: operation.title, content: operation.content }, now).node.id);
                        break;
                    case 'delete': {
                        const result = opDeleteNode(doc, operation.node_id, now);
                        deleted.push(...collectIds(result.removed));
                        break;
                    }
                    case 'move':
                        opMoveNode(doc, { nodeId: operation.node_id, newParentId: operation.new_parent_id, position: operation.position }, now);
                        updated.push(operation.node_id);
                        break;
                    case 'reorder':
                        opReorderNode(doc, { nodeId: operation.node_id, position: operation.position, direction: operation.direction }, now);
                        updated.push(operation.node_id);
                        break;
                    case 'change_role':
                        updated.push(opChangeRole(doc, profile, { nodeId: operation.node_id, role: operation.role }, now).node.id);
                        break;
                    case 'set_property':
                        updated.push(opSetProperty(doc, profile, { nodeId: operation.node_id, key: operation.key, value: operation.value }, now).node.id);
                        break;
                }
            }
            return summarizeMutation('patch', added, [...new Set(updated)], deleted);
        }, (summary, state) => {
            const deleted = new Set(summary.deleted_node_ids);
            state.clearDanglingAfterDelete(deleted);
            state.lastCreatedNodeId = summary.added_node_ids.at(-1) ?? state.lastCreatedNodeId;
            state.lastEditedNodeId = summary.updated_node_ids.at(-1) ?? summary.added_node_ids.at(-1) ?? null;
            state.selectedNodeId = state.lastEditedNodeId;
            state.dirty = true;
        }));
    }
    /** 保存(自动保存模式或显式保存);失败回滚并抛 SAVE_FAILED。 */
    async persist(action, rollback) {
        if (!this.options.autoSave && action !== 'save_document') {
            return { saved: false, markdownUpdated: false, sidecarSaved: false };
        }
        const doc = this.document;
        const filePath = this.state.currentFilePath;
        if (filePath === null) {
            this.doc = rollback;
            throw new DocumentOperationError('SAVE_FAILED', '保存失败:当前文件路径丢失。');
        }
        try {
            // 先推进版本再写盘:成功后内存、sidecar、磁盘三者一致;失败整体回滚。
            doc.revision += 1;
            const text = serializeMarkdown(doc);
            await this.options.storage.writeFile(filePath, text);
            const contentHash = hashText(text);
            this.loadedHash = contentHash;
            const sidecar = createSidecarV2(doc, contentHash, this.state.toPersisted());
            let sidecarSaved = true;
            try {
                await saveSidecar(this.options.storage, filePath, sidecar);
            }
            catch {
                // Markdown 是事实来源。sidecar 失败不能回滚已经成功写入的业务数据。
                sidecarSaved = false;
            }
            this.state.markSaved();
            this.legacySidecarLoaded = false;
            return { saved: true, markdownUpdated: true, sidecarSaved };
        }
        catch (error) {
            this.doc = rollback;
            throw new DocumentOperationError('SAVE_FAILED', `保存失败(${action}):${error instanceof Error ? error.message : String(error)}。文档已恢复到操作前状态。`);
        }
    }
    pushUndo(action, snapshot, result) {
        const affected = extractAffectedNodeId(result);
        this.undoStack.push({ action, snapshot, affectedNodeId: affected });
        if (this.undoStack.length > this.options.maxUndoSteps) {
            this.undoStack.splice(0, this.undoStack.length - this.options.maxUndoSteps);
        }
    }
    // ─── 具体操作 ────────────────────────────────────────────────────────────
    async addNode(args) {
        const profile = this.currentProfile;
        return this.commit('add_node', (doc, now) => opAddNode(doc, profile, args, now, this.options.createdBy ?? 'tool:add_node'), (result, state) => {
            state.markCreated(result.node.id);
            state.selectedNodeId = result.node.id;
        });
    }
    async updateNode(args) {
        this.requireChangeTarget(args.nodeId);
        return this.commit('update_node', (doc, now) => opUpdateNode(doc, args, now), (result, state) => {
            state.markEdited(result.node.id);
        });
    }
    async deleteNode(nodeId) {
        this.requireChangeTarget(nodeId);
        return this.commit('delete_node', (doc, now) => {
            const outcome = opDeleteNode(doc, nodeId, now);
            const deletedIds = collectIds(outcome.removed);
            return { removed: outcome.removed, parentId: outcome.parentId, index: outcome.index, removedCount: outcome.removedCount, deletedIds };
        }, (result, state) => {
            const cleared = state.clearDanglingAfterDelete(result.deletedIds);
            state.markEdited(null);
            result.clearedPointers = cleared;
        });
    }
    async moveNode(args) {
        this.requireChangeTarget(args.nodeId);
        this.requireChangeTarget(args.newParentId);
        return this.commit('move_node', (doc, now) => opMoveNode(doc, args, now), (result, state) => {
            state.markEdited(result.nodeId);
        });
    }
    async reorderNode(args) {
        this.requireChangeTarget(args.nodeId);
        return this.commit('reorder_node', (doc, now) => opReorderNode(doc, args, now), (result, state) => {
            state.markEdited(result.nodeId);
        });
    }
    async changeRole(args) {
        const profile = this.currentProfile;
        this.requireChangeTarget(args.nodeId);
        return this.commit('change_role', (doc, now) => opChangeRole(doc, profile, args, now), (result, state) => {
            state.markEdited(result.node.id);
        });
    }
    async setProperty(args) {
        const profile = this.currentProfile;
        this.requireChangeTarget(args.nodeId);
        return this.commit('update_property', (doc, now) => opSetProperty(doc, profile, args, now), (result, state) => {
            state.markEdited(result.node.id);
        });
    }
    /** 撤销上一步操作(恢复快照 + 保存 + Revision+1)。 */
    async undo() {
        const startedAt = Date.now();
        if (this.doc === null) {
            throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件,没有可撤销的操作。');
        }
        const entry = this.undoStack[this.undoStack.length - 1];
        if (entry === undefined) {
            throw new DocumentOperationError('INVALID_OPERATION', '没有可撤销的操作。');
        }
        const before = this.document;
        const rollback = cloneDocument(before);
        const currentCounter = before.metadata.node_seq;
        const restored = cloneDocument(entry.snapshot);
        // ID 计数器单调不减:撤销不复用 ID。
        if (restored.metadata.node_seq < currentCounter)
            restored.metadata.node_seq = currentCounter;
        // 版本号单调递增:撤销也是一次成功提交,基于当前版本 +1(而非快照版本 +1)。
        if (restored.revision < before.revision)
            restored.revision = before.revision;
        this.doc = restored;
        const violations = validateDocument(restored, this.currentProfile);
        if (violations.length > 0) {
            this.doc = rollback;
            throw new DocumentOperationError('VALIDATION_FAILED', `撤销后结构校验失败:${violations.join(';')}`);
        }
        const restoredNode = entry.affectedNodeId !== null ? findNodeById(restored, entry.affectedNodeId) : undefined;
        if (restoredNode !== undefined) {
            this.state.lastEditedNodeId = restoredNode.id;
        }
        this.state.dirty = true;
        // 注意:entry 仍在栈顶(peek);保存失败时直接抛错,栈保持原状。
        let persistence;
        try {
            persistence = await this.persist('undo', rollback);
        }
        catch (error) {
            if (this.options.autoSave)
                this.state.dirty = false;
            throw error;
        }
        this.undoStack.pop();
        this.emit({ kind: 'document', revision: this.document.revision, selectedNodeId: this.state.selectedNodeId, action: 'undo', elapsedMs: Date.now() - startedAt });
        return {
            result: { undoneAction: entry.action, restoredNodeId: restoredNode?.id ?? null },
            revision: this.document.revision,
            ...persistence,
        };
    }
    /** 显式保存(save_document 调试工具)。 */
    async saveNow() {
        if (this.doc === null) {
            throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件,无需保存。');
        }
        const wasDirty = this.state.dirty;
        if (!wasDirty) {
            return { result: { wasDirty }, revision: this.document.revision, saved: false, markdownUpdated: false, sidecarSaved: false };
        }
        const before = this.document;
        const rollback = cloneDocument(before);
        const persistence = await this.persist('save_document', rollback);
        return { result: { wasDirty }, revision: this.document.revision, ...persistence };
    }
    /**
     * 选择节点(select_node):只更新状态指针,不改文档、不推进版本;
     * 尽力而为地把状态写回 sidecar,保证跨会话状态恢复。
     */
    async selectNode(nodeId) {
        this.state.selectedNodeId = nodeId;
        const filePath = this.state.currentFilePath;
        if (filePath !== null && this.doc !== null && this.loadedHash !== null && !this.legacySidecarLoaded) {
            const sidecar = createSidecarV2(this.doc, this.loadedHash, this.state.toPersisted());
            await saveSidecar(this.options.storage, filePath, sidecar).catch(() => { });
        }
        this.emit({ kind: 'selection', selectedNodeId: nodeId });
    }
}
function collectIds(root) {
    const ids = new Set();
    const visit = (node) => {
        ids.add(node.id);
        for (const child of node.children)
            visit(child);
    };
    visit(root);
    return ids;
}
function extractAffectedNodeId(result) {
    if (typeof result !== 'object' || result === null)
        return null;
    const candidate = result;
    if (typeof candidate.node?.id === 'string')
        return candidate.node.id;
    if (typeof candidate.nodeId === 'string')
        return candidate.nodeId;
    if (typeof candidate.removed?.id === 'string')
        return candidate.removed.id;
    return null;
}
function firstLine(text) {
    const line = text.split('\n', 1)[0] ?? '';
    return line.length > 80 ? `${line.slice(0, 77)}…` : line;
}
function matchesFilter(node, filter) {
    if (filter.query !== undefined && filter.query !== '') {
        const query = filter.query;
        if (!node.title.includes(query) && !node.content.includes(query))
            return false;
    }
    if (filter.role !== undefined && filter.role !== '' && node.role !== filter.role)
        return false;
    if (filter.propertyKey !== undefined && filter.propertyKey !== '') {
        if (!(filter.propertyKey in node.properties))
            return false;
        if (filter.propertyValue !== undefined && String(node.properties[filter.propertyKey]) !== filter.propertyValue)
            return false;
    }
    if (filter.properties !== undefined) {
        // 多属性 AND 匹配:所有键都必须存在且值相等(字符串比较)。
        for (const [key, value] of Object.entries(filter.properties)) {
            if (!(key in node.properties))
                return false;
            if (String(node.properties[key]) !== String(value))
                return false;
        }
    }
    return true;
}
function summarizeMutation(kind, added, updated, deleted) {
    return { kind, added_node_ids: added, updated_node_ids: updated, deleted_node_ids: deleted, counts: { added: added.length, updated: updated.length, deleted: deleted.length } };
}
function isMutationSummary(value) {
    return typeof value === 'object' && value !== null && (value.kind === 'replace' || value.kind === 'patch');
}
function validateInputProperties(profile, role, properties) {
    return validatePropertiesForRole(profile, role, properties);
}
function materializeInputNode(doc, profile, input, now, used, reusable, createdBy) {
    const role = input.role ?? profile.defaultRole;
    const requested = input.id;
    if (requested !== undefined && (!reusable.has(requested) || used.has(requested))) {
        throw new DocumentOperationError('INVALID_OPERATION', `不能复用节点 ID ${requested}:它不属于当前文档或已重复使用。`);
    }
    const id = requested ?? allocateNodeId(doc);
    used.add(id);
    const node = {
        id, title: input.title, content: input.content ?? '', role,
        properties: validateInputProperties(profile, role, input.properties), children: [],
        metadata: { created_at: now.toISOString(), updated_at: now.toISOString(), created_by: createdBy },
    };
    node.children = (input.children ?? []).map(child => materializeInputNode(doc, profile, child, now, used, reusable, createdBy));
    return node;
}
function appendInputChildren(doc, profile, parent, inputs, now, added) {
    for (const input of inputs) {
        if (input.id !== undefined)
            throw new DocumentOperationError('INVALID_OPERATION', '新增子树不能指定节点 ID。');
        const result = opAddNode(doc, profile, { parentId: parent.id, title: input.title, content: input.content, role: input.role, properties: input.properties }, now, 'tool:apply_document_patch');
        added.push(result.node.id);
        appendInputChildren(doc, profile, result.node, input.children ?? [], now, added);
    }
}
// ─── 会话注册表 ─────────────────────────────────────────────────────────────
/**
 * 会话工作区注册表:按 Agent 会话隔离文档状态(与会话 cwd、当前文件集成点
 * 对齐)。提供可选的 CurrentFileProvider 懒绑定接缝(见 plugin/current-file.ts)。
 */
export class WorkspaceRegistry {
    options;
    workspaces = new Map();
    provider = null;
    fileTails = new Map();
    sessionTails = new Map();
    constructor(options) {
        this.options = options;
    }
    resolvePath(sessionId, rawPath) {
        return this.options.resolvePath(sessionId, rawPath);
    }
    /** Serialize document transactions that address the same normalized file. */
    async withFileLock(filePath, task) {
        const previous = this.fileTails.get(filePath) ?? Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        const tail = previous.then(() => current);
        this.fileTails.set(filePath, tail);
        await previous;
        try {
            return await task();
        }
        finally {
            release();
            if (this.fileTails.get(filePath) === tail)
                this.fileTails.delete(filePath);
        }
    }
    /** Serialize target binding and tool work within one conversation session. */
    async withSessionLock(sessionId, task) {
        const previous = this.sessionTails.get(sessionId) ?? Promise.resolve();
        let release;
        const current = new Promise(resolve => { release = resolve; });
        const tail = previous.then(() => current);
        this.sessionTails.set(sessionId, tail);
        await previous;
        try {
            return await task();
        }
        finally {
            release();
            if (this.sessionTails.get(sessionId) === tail)
                this.sessionTails.delete(sessionId);
        }
    }
    /** 由 StructuredDocumentService 或其他集成方注入“当前文件”来源。 */
    attachCurrentFileProvider(provider) {
        this.provider = provider;
    }
    /** 是否已注入当前文件提供者。 */
    get hasCurrentFileProvider() {
        return this.provider !== null;
    }
    /** 取会话工作区(没有则创建空工作区)。 */
    get(sessionId) {
        let workspace = this.workspaces.get(sessionId);
        if (workspace === undefined) {
            workspace = new SessionWorkspace(sessionId, this.options);
            this.workspaces.set(sessionId, workspace);
        }
        return workspace;
    }
    /** 取已绑定当前文件的工作区;未绑定时尝试经 CurrentFileProvider 懒绑定。 */
    async requireBound(sessionId) {
        const workspace = this.get(sessionId);
        if (workspace.bound)
            return workspace;
        if (this.provider !== null) {
            const provided = await this.provider.getCurrentFile(sessionId);
            if (provided !== null && provided !== '') {
                await workspace.bindFile(provided);
                return workspace;
            }
        }
        throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先打开或指定一个结构化文档(当前文件)。');
    }
    /** 订阅某会话工作区的变化(bound/unbound/document/selection);返回退订函数。 */
    onSessionChanged(sessionId, listener) {
        return this.get(sessionId).onChanged(listener);
    }
    /** 释放会话工作区(会话结束时调用)。 */
    dispose(sessionId) {
        const workspace = this.workspaces.get(sessionId);
        if (workspace !== undefined) {
            workspace.unbindFile();
            this.workspaces.delete(sessionId);
        }
    }
    /** 释放全部(插件卸载时)。 */
    disposeAll() {
        for (const sessionId of [...this.workspaces.keys()])
            this.dispose(sessionId);
    }
}
