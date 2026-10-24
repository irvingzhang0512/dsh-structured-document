import { InMemoryCurrentFileStore } from "../plugin/current-file.js";
/** 服务实现。 */
export class StructuredDocumentServiceImpl {
    id = 'dsh-structured-document';
    registry;
    store;
    resolvePath;
    logger;
    constructor(options) {
        this.registry = options.registry;
        this.store = options.store;
        this.resolvePath = options.resolvePath;
        this.logger = options.logger;
        // 自包含:若内核尚未注入任何当前文件提供者(例如无 config.currentFile
        // 且无外部 attach),本服务直接把 store 作为提供者,保证 setCurrentFile
        // 之后的懒绑定/重绑语义成立。
        if (!this.registry.hasCurrentFileProvider) {
            this.registry.attachCurrentFileProvider(this.store);
        }
    }
    getDocumentSnapshot(sessionId) {
        const workspace = this.registry.get(sessionId);
        if (!workspace.bound)
            return null;
        return {
            document: structuredClone(workspace.document),
            selectedNodeId: workspace.state.selectedNodeId,
            currentFile: workspace.state.currentFilePath,
            lastEditedNodeId: workspace.state.lastEditedNodeId,
            lastCreatedNodeId: workspace.state.lastCreatedNodeId,
            dirty: workspace.state.dirty,
            undoDepth: workspace.undoDepth,
        };
    }
    getCurrentFile(sessionId) {
        return this.store.getCurrentFile(sessionId);
    }
    async undo(sessionId) {
        return this.registry.withSessionLock(sessionId, async () => {
            const workspace = await this.registry.requireBound(sessionId);
            const filePath = workspace.state.currentFilePath;
            if (filePath === null)
                throw new Error('没有可撤销的整理目标。');
            return this.registry.withFileLock(filePath, async () => {
                await workspace.refreshIfExternalChanged();
                const committed = await workspace.undo();
                return { revision: committed.revision, saved: committed.saved, sidecarSaved: committed.sidecarSaved, undoneAction: committed.result.undoneAction };
            });
        });
    }
    async updateNode(sessionId, args) {
        return this.registry.withSessionLock(sessionId, async () => {
            const workspace = await this.registry.requireBound(sessionId);
            if (workspace.state.currentFilePath !== args.expectedFile)
                throw new Error('编辑目标已切换，请重新打开该节点。');
            if (workspace.document.revision !== args.expectedRevision)
                throw new Error('文档已被更新，请先查看最新内容再保存。');
            const committed = await this.registry.withFileLock(args.expectedFile, () => workspace.updateNode({ nodeId: args.nodeId, title: args.title, content: args.content }));
            return { revision: committed.revision, saved: committed.saved, sidecarSaved: committed.sidecarSaved };
        });
    }
    selectNode(sessionId, nodeId) {
        void this.registry.withSessionLock(sessionId, async () => {
            const workspace = this.registry.get(sessionId);
            if (!workspace.bound)
                return;
            await workspace.selectNode(nodeId);
        });
    }
    setCurrentFile(sessionId, filePath) {
        if (filePath === null || filePath === '') {
            void this.unbindCurrentFile(sessionId);
            return;
        }
        void this.bindCurrentFile(sessionId, filePath);
    }
    async bindCurrentFile(sessionId, filePath) {
        const previous = this.store.getCurrentFile(sessionId);
        this.store.setCurrentFile(sessionId, filePath);
        const bound = await this.registry.withSessionLock(sessionId, () => this.syncBound(sessionId, filePath));
        if (!bound)
            this.store.setCurrentFile(sessionId, previous);
        return bound;
    }
    async unbindCurrentFile(sessionId) {
        await this.registry.withSessionLock(sessionId, async () => {
            this.store.setCurrentFile(sessionId, null);
            this.registry.get(sessionId).unbindFile();
        });
    }
    async ensureBound(sessionId) {
        return this.registry.withSessionLock(sessionId, async () => {
            try {
                await this.registry.requireBound(sessionId);
                return true;
            }
            catch {
                return false;
            }
        });
    }
    subscribe(sessionId, listener) {
        return this.registry.onSessionChanged(sessionId, listener);
    }
    /** 确保工作区绑定 filePath:未绑定则懒绑定;已绑定且路径变化则重绑。 */
    async syncBound(sessionId, filePath) {
        try {
            const workspace = this.registry.get(sessionId);
            if (!workspace.bound) {
                await this.registry.requireBound(sessionId);
                const resolved = await this.resolvePath(sessionId, filePath);
                return this.registry.get(sessionId).state.currentFilePath === resolved;
            }
            const resolved = await this.resolvePath(sessionId, filePath);
            if (workspace.state.currentFilePath !== resolved) {
                await workspace.bindFile(resolved);
            }
            return workspace.state.currentFilePath === resolved;
        }
        catch (error) {
            // 绑定失败(文件不存在/解析失败等):保留当前状态,记日志。
            this.logger?.warn?.(`[structured-document] 绑定当前文件失败(${sessionId}, ${filePath}):${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
}
