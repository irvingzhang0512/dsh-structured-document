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
import { basename } from 'node:path'
import type { DocNode, DocumentNodeInput, DocumentPatchOperation, ProfileDefinition, StructuredDocument } from '../model/types.ts'
import { DocumentOperationError } from '../model/errors.ts'
import { allocateNodeId, cloneDocument, findNodeById, nodeBreadcrumb, walkNodes } from '../model/document.ts'
import { requireProfile } from '../profiles/profiles.ts'
import {
  opAddNode, opChangeRole, opDeleteNode, opMoveNode, opReorderNode, opSetProperty, opUpdateNode,
  validatePropertiesForRole,
  type AddNodeResult, type ChangeRoleResult, type MoveNodeResult, type ReorderDirection,
  type SetPropertyResult, type UpdateNodeResult,
} from '../operations/ops.ts'
import { validateDocument } from '../model/validation.ts'
import { createEmptyDocument, parseMarkdown, serializeMarkdown } from '../storage/markdown-adapter.ts'
import { createSidecarV2, hashText, loadSidecar, restoreSidecarV2, saveSidecar, type DocumentStorage } from '../storage/storage.ts'
import { DocumentStateTracker } from './document-state.ts'
import { resolveNodeRef, type NodeRefArgs } from './references.ts'

/** 内核配置。 */
export interface KernelOptions {
  storage: DocumentStorage
  /** 默认场景模板(文档首次装载且无 sidecar 记录时使用)。 */
  defaultProfile: string
  /** 自动保存(需求第 20 章默认开启)。 */
  autoSave: boolean
  /** 撤销栈深度。 */
  maxUndoSteps: number
  /** 把(可能相对的)路径解析为绝对路径(相对会话工作目录)。 */
  resolvePath: (sessionId: string, rawPath: string) => Promise<string>
  /** 时间源(可注入固定时间便于测试)。 */
  now?: () => Date
  /** 操作来源标记(写入 metadata.created_by)。 */
  createdBy?: string
}

/** 工作区变化事件(集成层订阅:视图插件 / 状态镜像等)。 */
export type WorkspaceChange =
  | { kind: 'bound'; filePath: string; revision: number; selectedNodeId: string | null }
  | { kind: 'unbound' }
  | { kind: 'document'; revision: number; selectedNodeId: string | null, action?: string, summary?: DocumentMutationSummary, elapsedMs?: number }
  | { kind: 'selection'; selectedNodeId: string | null }

/** 工作区变化监听器。 */
export type WorkspaceChangeListener = (change: WorkspaceChange) => void

/** 撤销栈条目。 */
interface UndoEntry {
  action: string
  snapshot: StructuredDocument
  affectedNodeId: string | null
}

/** 单个会话的文档工作区。 */
export class SessionWorkspace {
  readonly sessionId: string
  private readonly options: KernelOptions
  private doc: StructuredDocument | null = null
  private profile: ProfileDefinition | null = null
  /** 绑定(或最近一次保存)时磁盘文件内容的哈希,用于 sidecar 一致性。 */
  private loadedHash: string | null = null
  /** v1 sidecar 已被采纳但尚未通过业务修改迁移；选择操作不得提前覆盖它。 */
  private legacySidecarLoaded = false
  readonly state = new DocumentStateTracker()
  private undoStack: UndoEntry[] = []
  private readonly changeListeners = new Set<WorkspaceChangeListener>()
  private readonly completedRequests = new Map<string, { fingerprint: string, result: CommittedResult<DocumentMutationSummary> }>()

  constructor(sessionId: string, options: KernelOptions) {
    this.sessionId = sessionId
    this.options = options
  }

  /** 订阅工作区变化(bound/unbound/document/selection);返回退订函数。 */
  onChanged(listener: WorkspaceChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  private emit(change: WorkspaceChange): void {
    for (const listener of [...this.changeListeners]) {
      try {
        listener(change)
      } catch {
        // 监听器异常不阻断工作区。
      }
    }
  }

  get bound(): boolean {
    return this.doc !== null
  }

  get document(): StructuredDocument {
    if (this.doc === null) {
      throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先绑定一个结构化文档(当前文件)。')
    }
    return this.doc
  }

  get currentProfile(): ProfileDefinition {
    if (this.profile === null) {
      throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先绑定一个结构化文档(当前文件)。')
    }
    return this.profile
  }

  get undoDepth(): number {
    return this.undoStack.length
  }

  /** 绑定当前文件(加载 + 解析 + sidecar 采纳)。 */
  async bindFile(rawPath: string): Promise<BindResult> {
    const filePath = await this.options.resolvePath(this.sessionId, rawPath)
    let text: string
    try {
      text = await this.options.storage.readFile(filePath)
    } catch (error) {
      throw new DocumentOperationError(
        'FILE_NOT_FOUND',
        `无法读取当前文件:${filePath}(${error instanceof Error ? error.message : String(error)})。`,
      )
    }
    const sidecar = await loadSidecar(this.options.storage, filePath)
    const hash = hashText(text)
    this.loadedHash = hash
    const now = this.now()
    const fileName = basename(filePath)

    if (sidecar !== null && sidecar.content_hash === hash && sidecar.format_version === 1) {
      // 源文件未变化:直接采纳 sidecar 里的 IR(无损、ID 稳定)。
      this.doc = sidecar.document
      this.profile = requireProfile(this.doc.profile)
      this.state.currentFilePath = filePath
      this.state.restorePersisted(sidecar.state)
      this.state.dirty = false
      this.undoStack = []
      this.legacySidecarLoaded = true
      this.emit({ kind: 'bound', filePath, revision: this.doc.revision, selectedNodeId: this.state.selectedNodeId })
      return { filePath, title: this.doc.title, profileId: this.doc.profile, nodeCount: this.countNodes(), source: 'sidecar', revision: this.doc.revision }
    }

    // v2 始终从 Markdown 恢复业务字段；v1 哈希失效时仅沿用旧 Profile 作为回退。
    const fallbackProfileId = sidecar?.format_version === 1 ? sidecar.document.profile : this.options.defaultProfile
    requireProfile(fallbackProfileId)
    const parsed = parseMarkdown(text, {
      profileId: fallbackProfileId,
      now,
      createdBy: 'import:markdown',
      fileName,
    }, filePath)
    this.doc = sidecar?.format_version === 2 && sidecar.content_hash === hash
      ? restoreSidecarV2(parsed.doc, sidecar)
      : parsed.doc
    const profileId = parsed.profileId
    this.profile = requireProfile(profileId)
    this.state.currentFilePath = filePath
    if (sidecar?.format_version === 2 && sidecar.content_hash === hash) {
      this.state.restorePersisted(sidecar.state)
    } else {
      this.state.selectedNodeId = null
      this.state.lastEditedNodeId = null
      this.state.lastCreatedNodeId = null
    }
    this.state.dirty = false
    this.undoStack = []
    this.legacySidecarLoaded = false
    this.emit({ kind: 'bound', filePath, revision: this.doc.revision, selectedNodeId: this.state.selectedNodeId })
    const source = sidecar === null ? 'fresh' : sidecar.format_version === 2 && sidecar.content_hash === hash ? 'sidecar' : 'reparsed'
    return { filePath, title: this.doc.title, profileId, nodeCount: this.countNodes(), source, revision: this.doc.revision }
  }

  /** 解绑当前文件(丢弃内存状态;磁盘文件不受影响)。 */
  unbindFile(): void {
    this.doc = null
    this.profile = null
    this.state.currentFilePath = null
    this.state.selectedNodeId = null
    this.state.lastEditedNodeId = null
    this.state.lastCreatedNodeId = null
    this.state.dirty = false
    this.undoStack = []
    this.loadedHash = null
    this.legacySidecarLoaded = false
    this.emit({ kind: 'unbound' })
  }

  /**
   * 外部修改检测:当前文件在会话外被改动时(内容哈希与最近一次加载/保存不一致),
   * 以磁盘为准重新解析、重新分配 ID,并清空撤销栈与状态指针。
   * 返回是否发生了重新加载。工具层在每次调用前调用本方法(requireBound 之后)。
   */
  async refreshIfExternalChanged(): Promise<boolean> {
    if (this.doc === null) return false
    const filePath = this.state.currentFilePath
    if (filePath === null) return false
    let text: string
    try {
      text = await this.options.storage.readFile(filePath)
    } catch {
      return false // 文件暂时读不到(被占用/删除):保留内存状态,写路径会如实报错。
    }
    if (hashText(text) === this.loadedHash) return false
    // 以磁盘为准:重新装载(放弃内存未保存修改与撤销历史)。
    await this.bindFile(filePath)
    return true
  }

  private now(): Date {
    return (this.options.now ?? (() => new Date()))()
  }

  private countNodes(): number {
    let count = 0
    for (const _ of walkNodes(this.document)) count += 1
    return count
  }

  // ─── 读操作 ──────────────────────────────────────────────────────────────

  /** 完整文档视图。 */
  getDocument(): { doc: StructuredDocument, profile: ProfileDefinition, state: ReturnType<DocumentStateTracker['snapshot']> } {
    return {
      doc: this.document,
      profile: this.currentProfile,
      state: this.state.snapshot(this.document),
    }
  }

  /** 大纲(扁平行,带深度;渲染为树形文本)。 */
  getOutline(maxDepth?: number): OutlineRow[] {
    const doc = this.document
    const rows: OutlineRow[] = []
    const visit = (node: DocNode, depth: number): void => {
      if (maxDepth !== undefined && depth > maxDepth) return
      rows.push({
        node_id: node.id,
        title: node.title,
        role: node.role,
        depth,
        content_preview: node.content === '' ? undefined : firstLine(node.content),
        child_count: node.children.length,
      })
      for (const child of node.children) visit(child, depth + 1)
    }
    visit(doc.root, 0)
    return rows
  }

  /** 按标题/内容/角色/属性查找节点。 */
  findNodes(filter: FindNodesFilter): Array<{ node: DocNode, path: string }> {
    const doc = this.document
    const matches: Array<{ node: DocNode, path: string }> = []
    const visit = (node: DocNode): void => {
      if (matchesFilter(node, filter)) {
        const path = node.id === doc.root.id ? '' : nodeBreadcrumb(doc, node.id) ?? ''
        matches.push({ node, path })
      }
      for (const child of node.children) visit(child)
    }
    visit(doc.root)
    return matches
  }

  /** 解析节点引用(供工具层使用)。 */
  resolveRef(args: NodeRefArgs, hint: string): DocNode {
    return resolveNodeRef(this.document, this.state, args, hint).node
  }

  /** 当前节点(可能为 null)。 */
  getSelectedNode(): DocNode | null {
    if (this.doc === null) return null
    return this.state.selectedNodeId === null ? null : findNodeById(this.doc, this.state.selectedNodeId) ?? null
  }

  // ─── 写操作管线 ─────────────────────────────────────────────────────────

  private requireChangeTarget(nodeId: string): void {
    if (findNodeById(this.document, nodeId) === undefined) {
      throw new DocumentOperationError('NODE_NOT_FOUND', `未找到节点:${nodeId}。`)
    }
  }

  /**
   * 通用变更管线:快照 → 变更 → 校验 → 保存 → 提交状态与撤销。
   * mutator 直接在工作文档上变更;返回操作结果。
   */
  private async commit<R>(action: string, mutator: (doc: StructuredDocument, now: Date) => R, pointers?: (result: R, state: DocumentStateTracker) => void): Promise<CommittedResult<R>> {
    const startedAt = Date.now()
    const before = this.document
    const snapshot = cloneDocument(before)
    const originalProfile = this.profile
    const now = this.now()
    let result: R
    try {
      result = mutator(before, now)
    } catch (error) {
      // 变更前抛错:文档未变,直接透传。
      throw error
    }
    const violations = validateDocument(before, this.currentProfile)
    if (violations.length > 0) {
      this.doc = snapshot
      this.profile = originalProfile
      throw new DocumentOperationError('VALIDATION_FAILED', `结构校验失败:${violations.join(';')}`)
    }

    this.state.dirty = true
    if (pointers !== undefined) pointers(result, this.state)

    let persistence: PersistOutcome
    try {
      persistence = await this.persist(action, snapshot)
    } catch (error) {
      // 自动保存模式下文档已回滚到磁盘状态,Dirty 复位。
      this.profile = originalProfile
      if (this.options.autoSave) this.state.dirty = false
      throw error
    }
    this.pushUndo(action, snapshot, result)
    this.emit({
      kind: 'document', revision: this.document.revision, selectedNodeId: this.state.selectedNodeId, action,
      ...(isMutationSummary(result) ? { summary: result } : {}),
      elapsedMs: Date.now() - startedAt,
    })
    return { result, revision: this.document.revision, ...persistence }
  }

  private assertTarget(expectedRevision?: number, expectedFile?: string): void {
    if (expectedFile !== undefined && expectedFile !== this.state.currentFilePath) {
      throw new DocumentOperationError('INVALID_OPERATION', `整理目标已变化:请求目标为 ${expectedFile},当前目标为 ${this.state.currentFilePath ?? '无'}。请重新读取上下文。`)
    }
    if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
      throw new DocumentOperationError('EXTERNAL_MODIFIED', `文档版本已变化:请求基于版本 ${expectedRevision},当前为 ${this.document.revision}。请重新读取后再修改。`)
    }
  }

  private async idempotentMutation(
    action: string,
    requestId: string | undefined,
    payload: unknown,
    run: () => Promise<CommittedResult<DocumentMutationSummary>>,
  ): Promise<CommittedResult<DocumentMutationSummary>> {
    if (requestId === undefined || requestId === '') return run()
    const fingerprint = JSON.stringify(payload)
    const previous = this.completedRequests.get(requestId)
    if (previous !== undefined) {
      if (previous.fingerprint !== fingerprint) {
        throw new DocumentOperationError('INVALID_OPERATION', `请求 ID ${requestId} 已被另一组 ${action} 参数使用。`)
      }
      return structuredClone(previous.result)
    }
    const result = await run()
    this.completedRequests.set(requestId, { fingerprint, result: structuredClone(result) })
    if (this.completedRequests.size > 128) this.completedRequests.delete(this.completedRequests.keys().next().value as string)
    return result
  }

  /** Replace all document content in one validated, undoable transaction. */
  async replaceDocument(args: {
    title: string
    profileId: string
    root?: Omit<DocumentNodeInput, 'id' | 'children'>
    children: DocumentNodeInput[]
    expectedRevision?: number
    expectedFile?: string
    requestId?: string
  }): Promise<CommittedResult<DocumentMutationSummary>> {
    this.assertTarget(args.expectedRevision, args.expectedFile)
    const profile = requireProfile(args.profileId)
    return this.idempotentMutation('replace_document', args.requestId, args, () => this.commit('replace_document', (doc, now) => {
      const previousIds = new Set([...walkNodes(doc)].map(node => node.id))
      const previousBusiness = new Map([...walkNodes(doc)].map(node => [node.id, JSON.stringify({ title: node.title, content: node.content, role: node.role, properties: node.properties, children: node.children.map(child => child.id) })]))
      const used = new Set<string>(['node_001'])
      const rootInput = args.root
      const root: DocNode = {
        id: 'node_001',
        title: args.title,
        content: rootInput?.content ?? '',
        role: rootInput?.role ?? profile.defaultRole,
        properties: validateInputProperties(profile, rootInput?.role ?? profile.defaultRole, rootInput?.properties),
        children: [],
        metadata: { ...doc.root.metadata, updated_at: now.toISOString(), created_by: 'tool:replace_document' },
      }
      const next: StructuredDocument = {
        ...doc,
        title: args.title,
        profile: profile.id,
        root,
        metadata: { ...doc.metadata, updated_at: now.toISOString() },
      }
      root.children = args.children.map(input => materializeInputNode(next, profile, input, now, used, previousIds, 'tool:replace_document'))
      Object.assign(doc, next)
      this.profile = profile
      const nextNodes = [...walkNodes(next)]
      const nextIds = new Set(nextNodes.map(node => node.id))
      const added = nextNodes.filter(node => node.id !== 'node_001' && !previousIds.has(node.id)).map(node => node.id)
      const updated = nextNodes.filter(node => previousBusiness.has(node.id) && previousBusiness.get(node.id) !== JSON.stringify({ title: node.title, content: node.content, role: node.role, properties: node.properties, children: node.children.map(child => child.id) })).map(node => node.id)
      const deleted = [...previousIds].filter(id => id !== 'node_001' && !nextIds.has(id))
      return summarizeMutation('replace', added, updated, deleted)
    }, (summary, state) => {
      state.lastEditedNodeId = this.document.root.id
      state.lastCreatedNodeId = summary.added_node_ids.at(-1) ?? null
      state.selectedNodeId = this.document.root.id
      state.dirty = true
    }))
  }

  /** Create and bind a new file with one complete initial document write. */
  async createDocument(args: {
    filePath: string
    title: string
    profileId: string
    root?: Omit<DocumentNodeInput, 'id' | 'children'>
    children: DocumentNodeInput[]
  }): Promise<CommittedResult<DocumentMutationSummary>> {
    const startedAt = Date.now()
    const profile = requireProfile(args.profileId)
    const now = this.now()
    const doc = createEmptyDocument({ profileId: profile.id, now, createdBy: 'tool:create_document', fileName: basename(args.filePath) }, args.filePath)
    doc.title = args.title
    doc.root.title = args.title
    doc.root.content = args.root?.content ?? ''
    doc.root.role = args.root?.role ?? profile.defaultRole
    doc.root.properties = validateInputProperties(profile, doc.root.role, args.root?.properties)
    const used = new Set<string>(['node_001'])
    doc.root.children = args.children.map(input => {
      if (input.id !== undefined) throw new DocumentOperationError('INVALID_OPERATION', '新建文档不能指定节点 ID。')
      return materializeInputNode(doc, profile, input, now, used, new Set(), 'tool:create_document')
    })
    const violations = validateDocument(doc, profile)
    if (violations.length > 0) throw new DocumentOperationError('VALIDATION_FAILED', `结构校验失败:${violations.join(';')}`)
    const text = serializeMarkdown(doc)
    try {
      if (this.options.storage.createFile !== undefined) await this.options.storage.createFile(args.filePath, text)
      else await this.options.storage.writeFile(args.filePath, text)
    } catch (error) {
      throw new DocumentOperationError('SAVE_FAILED', `创建文档失败:${error instanceof Error ? error.message : String(error)}。`)
    }
    this.doc = doc
    this.profile = profile
    this.loadedHash = hashText(text)
    this.state.currentFilePath = args.filePath
    this.state.selectedNodeId = doc.root.id
    this.state.lastEditedNodeId = doc.root.id
    this.state.lastCreatedNodeId = [...walkNodes(doc)].at(-1)?.id ?? null
    this.state.markSaved()
    this.undoStack = []
    let sidecarSaved = true
    await saveSidecar(this.options.storage, args.filePath, createSidecarV2(doc, this.loadedHash, this.state.toPersisted())).catch(() => { sidecarSaved = false })
    const summary = summarizeMutation('replace', [...walkNodes(doc)].slice(1).map(node => node.id), [], [])
    this.emit({ kind: 'bound', filePath: args.filePath, revision: doc.revision, selectedNodeId: doc.root.id })
    this.emit({ kind: 'document', revision: doc.revision, selectedNodeId: doc.root.id, action: 'create_document', summary, elapsedMs: Date.now() - startedAt })
    return { result: summary, revision: doc.revision, saved: true, markdownUpdated: true, sidecarSaved }
  }

  /** Apply multiple typed operations as one validated, undoable transaction. */
  async applyPatch(args: {
    operations: DocumentPatchOperation[]
    expectedRevision?: number
    expectedFile?: string
    requestId?: string
  }): Promise<CommittedResult<DocumentMutationSummary>> {
    this.assertTarget(args.expectedRevision, args.expectedFile)
    if (args.operations.length === 0) throw new DocumentOperationError('INVALID_OPERATION', '批量修改至少需要一项操作。')
    const profile = this.currentProfile
    return this.idempotentMutation('apply_document_patch', args.requestId, args, () => this.commit('apply_document_patch', (doc, now) => {
      const added: string[] = []
      const updated: string[] = []
      const deleted: string[] = []
      for (const operation of args.operations) {
        switch (operation.op) {
          case 'add': {
            const result = opAddNode(doc, profile, {
              parentId: operation.parent_id, position: operation.position,
              title: operation.node.title, content: operation.node.content,
              role: operation.node.role, properties: operation.node.properties,
            }, now, 'tool:apply_document_patch')
            added.push(result.node.id)
            appendInputChildren(doc, profile, result.node, operation.node.children ?? [], now, added)
            break
          }
          case 'update': updated.push(opUpdateNode(doc, { nodeId: operation.node_id, title: operation.title, content: operation.content }, now).node.id); break
          case 'delete': {
            const result = opDeleteNode(doc, operation.node_id, now)
            deleted.push(...collectIds(result.removed))
            break
          }
          case 'move': opMoveNode(doc, { nodeId: operation.node_id, newParentId: operation.new_parent_id, position: operation.position }, now); updated.push(operation.node_id); break
          case 'reorder': opReorderNode(doc, { nodeId: operation.node_id, position: operation.position, direction: operation.direction }, now); updated.push(operation.node_id); break
          case 'change_role': updated.push(opChangeRole(doc, profile, { nodeId: operation.node_id, role: operation.role }, now).node.id); break
          case 'set_property': updated.push(opSetProperty(doc, profile, { nodeId: operation.node_id, key: operation.key, value: operation.value }, now).node.id); break
        }
      }
      return summarizeMutation('patch', added, [...new Set(updated)], deleted)
    }, (summary, state) => {
      const deleted = new Set(summary.deleted_node_ids)
      state.clearDanglingAfterDelete(deleted)
      state.lastCreatedNodeId = summary.added_node_ids.at(-1) ?? state.lastCreatedNodeId
      state.lastEditedNodeId = summary.updated_node_ids.at(-1) ?? summary.added_node_ids.at(-1) ?? null
      state.selectedNodeId = state.lastEditedNodeId
      state.dirty = true
    }))
  }

  /** 保存(自动保存模式或显式保存);失败回滚并抛 SAVE_FAILED。 */
  private async persist(action: string, rollback: StructuredDocument): Promise<PersistOutcome> {
    if (!this.options.autoSave && action !== 'save_document') {
      return { saved: false, markdownUpdated: false, sidecarSaved: false }
    }
    const doc = this.document
    const filePath = this.state.currentFilePath
    if (filePath === null) {
      this.doc = rollback
      throw new DocumentOperationError('SAVE_FAILED', '保存失败:当前文件路径丢失。')
    }
    try {
      // 先推进版本再写盘:成功后内存、sidecar、磁盘三者一致;失败整体回滚。
      doc.revision += 1
      const text = serializeMarkdown(doc)
      await this.options.storage.writeFile(filePath, text)
      const contentHash = hashText(text)
      this.loadedHash = contentHash
      const sidecar = createSidecarV2(doc, contentHash, this.state.toPersisted())
      let sidecarSaved = true
      try {
        await saveSidecar(this.options.storage, filePath, sidecar)
      } catch {
        // Markdown 是事实来源。sidecar 失败不能回滚已经成功写入的业务数据。
        sidecarSaved = false
      }
      this.state.markSaved()
      this.legacySidecarLoaded = false
      return { saved: true, markdownUpdated: true, sidecarSaved }
    } catch (error) {
      this.doc = rollback
      throw new DocumentOperationError(
        'SAVE_FAILED',
        `保存失败(${action}):${error instanceof Error ? error.message : String(error)}。文档已恢复到操作前状态。`,
      )
    }
  }

  private pushUndo(action: string, snapshot: StructuredDocument, result: unknown): void {
    const affected = extractAffectedNodeId(result)
    this.undoStack.push({ action, snapshot, affectedNodeId: affected })
    if (this.undoStack.length > this.options.maxUndoSteps) {
      this.undoStack.splice(0, this.undoStack.length - this.options.maxUndoSteps)
    }
  }

  // ─── 具体操作 ────────────────────────────────────────────────────────────

  async addNode(args: { parentId: string, position?: number, title?: string, content?: string, role?: string, properties?: Record<string, string | number | boolean> }): Promise<CommittedResult<AddNodeResult>> {
    const profile = this.currentProfile
    return this.commit('add_node', (doc, now) => opAddNode(doc, profile, args, now, this.options.createdBy ?? 'tool:add_node'), (result, state) => {
      state.markCreated(result.node.id)
      state.selectedNodeId = result.node.id
    })
  }

  async updateNode(args: { nodeId: string, title?: string, content?: string }): Promise<CommittedResult<UpdateNodeResult>> {
    this.requireChangeTarget(args.nodeId)
    return this.commit('update_node', (doc, now) => opUpdateNode(doc, args, now), (result, state) => {
      state.markEdited(result.node.id)
    })
  }

  async deleteNode(nodeId: string): Promise<CommittedResult<DeleteOutcome>> {
    this.requireChangeTarget(nodeId)
    return this.commit('delete_node', (doc, now) => {
      const outcome = opDeleteNode(doc, nodeId, now)
      const deletedIds = collectIds(outcome.removed)
      return { removed: outcome.removed, parentId: outcome.parentId, index: outcome.index, removedCount: outcome.removedCount, deletedIds }
    }, (result, state) => {
      const cleared = state.clearDanglingAfterDelete(result.deletedIds)
      state.markEdited(null)
      ;(result as DeleteOutcome).clearedPointers = cleared
    })
  }

  async moveNode(args: { nodeId: string, newParentId: string, position?: number }): Promise<CommittedResult<MoveNodeResult>> {
    this.requireChangeTarget(args.nodeId)
    this.requireChangeTarget(args.newParentId)
    return this.commit('move_node', (doc, now) => opMoveNode(doc, args, now), (result, state) => {
      state.markEdited(result.nodeId)
    })
  }

  async reorderNode(args: { nodeId: string, position?: number, direction?: ReorderDirection }): Promise<CommittedResult<MoveNodeResult>> {
    this.requireChangeTarget(args.nodeId)
    return this.commit('reorder_node', (doc, now) => opReorderNode(doc, args, now), (result, state) => {
      state.markEdited(result.nodeId)
    })
  }

  async changeRole(args: { nodeId: string, role: string }): Promise<CommittedResult<ChangeRoleResult>> {
    const profile = this.currentProfile
    this.requireChangeTarget(args.nodeId)
    return this.commit('change_role', (doc, now) => opChangeRole(doc, profile, args, now), (result, state) => {
      state.markEdited(result.node.id)
    })
  }

  async setProperty(args: { nodeId: string, key: string, value: string | number | boolean | null }): Promise<CommittedResult<SetPropertyResult>> {
    const profile = this.currentProfile
    this.requireChangeTarget(args.nodeId)
    return this.commit('update_property', (doc, now) => opSetProperty(doc, profile, args, now), (result, state) => {
      state.markEdited(result.node.id)
    })
  }

  /** 撤销上一步操作(恢复快照 + 保存 + Revision+1)。 */
  async undo(): Promise<CommittedResult<{ undoneAction: string, restoredNodeId: string | null }>> {
    const startedAt = Date.now()
    if (this.doc === null) {
      throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件,没有可撤销的操作。')
    }
    const entry = this.undoStack[this.undoStack.length - 1]
    if (entry === undefined) {
      throw new DocumentOperationError('INVALID_OPERATION', '没有可撤销的操作。')
    }
    const before = this.document
    const rollback = cloneDocument(before)
    const currentCounter = before.metadata.node_seq

    const restored = cloneDocument(entry.snapshot)
    // ID 计数器单调不减:撤销不复用 ID。
    if (restored.metadata.node_seq < currentCounter) restored.metadata.node_seq = currentCounter
    // 版本号单调递增:撤销也是一次成功提交,基于当前版本 +1(而非快照版本 +1)。
    if (restored.revision < before.revision) restored.revision = before.revision
    this.doc = restored

    const violations = validateDocument(restored, this.currentProfile)
    if (violations.length > 0) {
      this.doc = rollback
      throw new DocumentOperationError('VALIDATION_FAILED', `撤销后结构校验失败:${violations.join(';')}`)
    }

    const restoredNode = entry.affectedNodeId !== null ? findNodeById(restored, entry.affectedNodeId) : undefined
    if (restoredNode !== undefined) {
      this.state.lastEditedNodeId = restoredNode.id
    }
    this.state.dirty = true

    // 注意:entry 仍在栈顶(peek);保存失败时直接抛错,栈保持原状。
    let persistence: PersistOutcome
    try {
      persistence = await this.persist('undo', rollback)
    } catch (error) {
      if (this.options.autoSave) this.state.dirty = false
      throw error
    }
    this.undoStack.pop()
    this.emit({ kind: 'document', revision: this.document.revision, selectedNodeId: this.state.selectedNodeId, action: 'undo', elapsedMs: Date.now() - startedAt })
    return {
      result: { undoneAction: entry.action, restoredNodeId: restoredNode?.id ?? null },
      revision: this.document.revision,
      ...persistence,
    }
  }

  /** 显式保存(save_document 调试工具)。 */
  async saveNow(): Promise<CommittedResult<{ wasDirty: boolean }>> {
    if (this.doc === null) {
      throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件,无需保存。')
    }
    const wasDirty = this.state.dirty
    if (!wasDirty) {
      return { result: { wasDirty }, revision: this.document.revision, saved: false, markdownUpdated: false, sidecarSaved: false }
    }
    const before = this.document
    const rollback = cloneDocument(before)
    const persistence = await this.persist('save_document', rollback)
    return { result: { wasDirty }, revision: this.document.revision, ...persistence }
  }

  /**
   * 选择节点(select_node):只更新状态指针,不改文档、不推进版本;
   * 尽力而为地把状态写回 sidecar,保证跨会话状态恢复。
   */
  async selectNode(nodeId: string | null): Promise<void> {
    this.state.selectedNodeId = nodeId
    const filePath = this.state.currentFilePath
    if (filePath !== null && this.doc !== null && this.loadedHash !== null && !this.legacySidecarLoaded) {
      const sidecar = createSidecarV2(this.doc, this.loadedHash, this.state.toPersisted())
      await saveSidecar(this.options.storage, filePath, sidecar).catch(() => {})
    }
    this.emit({ kind: 'selection', selectedNodeId: nodeId })
  }
}

/** 删除结果(内核扩展:被删除 ID 集与被清理的指针)。 */
export interface DeleteOutcome {
  removed: DocNode
  parentId: string
  index: number
  removedCount: number
  deletedIds: Set<string>
  clearedPointers?: string[]
}

function collectIds(root: DocNode): Set<string> {
  const ids = new Set<string>()
  const visit = (node: DocNode): void => {
    ids.add(node.id)
    for (const child of node.children) visit(child)
  }
  visit(root)
  return ids
}

function extractAffectedNodeId(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const candidate = result as { node?: { id?: unknown }, nodeId?: unknown, removed?: { id?: unknown } }
  if (typeof candidate.node?.id === 'string') return candidate.node.id
  if (typeof candidate.nodeId === 'string') return candidate.nodeId
  if (typeof candidate.removed?.id === 'string') return candidate.removed.id
  return null
}

function firstLine(text: string): string {
  const line = text.split('\n', 1)[0] ?? ''
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}

function matchesFilter(node: DocNode, filter: FindNodesFilter): boolean {
  if (filter.query !== undefined && filter.query !== '') {
    const query = filter.query
    if (!node.title.includes(query) && !node.content.includes(query)) return false
  }
  if (filter.role !== undefined && filter.role !== '' && node.role !== filter.role) return false
  if (filter.propertyKey !== undefined && filter.propertyKey !== '') {
    if (!(filter.propertyKey in node.properties)) return false
    if (filter.propertyValue !== undefined && String(node.properties[filter.propertyKey]) !== filter.propertyValue) return false
  }
  if (filter.properties !== undefined) {
    // 多属性 AND 匹配:所有键都必须存在且值相等(字符串比较)。
    for (const [key, value] of Object.entries(filter.properties)) {
      if (!(key in node.properties)) return false
      if (String(node.properties[key]) !== String(value)) return false
    }
  }
  return true
}

/** find_node 过滤条件。 */
export interface FindNodesFilter {
  query?: string
  role?: string
  propertyKey?: string
  propertyValue?: string
  /** 多属性 AND 匹配(与 property_key/property_value 可同时使用,之间也是 AND)。 */
  properties?: Record<string, unknown>
}

/** 大纲行。 */
export interface OutlineRow {
  node_id: string
  title: string
  role: string
  depth: number
  content_preview?: string
  child_count: number
}

/** 绑定结果。 */
export interface BindResult {
  filePath: string
  title: string
  profileId: string
  nodeCount: number
  source: 'sidecar' | 'fresh' | 'reparsed'
  revision: number
}

/** 提交结果。 */
export interface CommittedResult<R> {
  result: R
  revision: number
  saved: boolean
  markdownUpdated: boolean
  sidecarSaved: boolean
}

export interface DocumentMutationSummary {
  kind: 'replace' | 'patch'
  added_node_ids: string[]
  updated_node_ids: string[]
  deleted_node_ids: string[]
  counts: { added: number, updated: number, deleted: number }
}

function summarizeMutation(kind: 'replace' | 'patch', added: string[], updated: string[], deleted: string[]): DocumentMutationSummary {
  return { kind, added_node_ids: added, updated_node_ids: updated, deleted_node_ids: deleted, counts: { added: added.length, updated: updated.length, deleted: deleted.length } }
}

function isMutationSummary(value: unknown): value is DocumentMutationSummary {
  return typeof value === 'object' && value !== null && ((value as { kind?: unknown }).kind === 'replace' || (value as { kind?: unknown }).kind === 'patch')
}

function validateInputProperties(profile: ProfileDefinition, role: string, properties: DocumentNodeInput['properties']): Record<string, string | number | boolean> {
  return validatePropertiesForRole(profile, role, properties)
}

function materializeInputNode(
  doc: StructuredDocument,
  profile: ProfileDefinition,
  input: DocumentNodeInput,
  now: Date,
  used: Set<string>,
  reusable: Set<string>,
  createdBy: string,
): DocNode {
  const role = input.role ?? profile.defaultRole
  const requested = input.id
  if (requested !== undefined && (!reusable.has(requested) || used.has(requested))) {
    throw new DocumentOperationError('INVALID_OPERATION', `不能复用节点 ID ${requested}:它不属于当前文档或已重复使用。`)
  }
  const id = requested ?? allocateNodeId(doc)
  used.add(id)
  const node: DocNode = {
    id, title: input.title, content: input.content ?? '', role,
    properties: validateInputProperties(profile, role, input.properties), children: [],
    metadata: { created_at: now.toISOString(), updated_at: now.toISOString(), created_by: createdBy },
  }
  node.children = (input.children ?? []).map(child => materializeInputNode(doc, profile, child, now, used, reusable, createdBy))
  return node
}

function appendInputChildren(doc: StructuredDocument, profile: ProfileDefinition, parent: DocNode, inputs: DocumentNodeInput[], now: Date, added: string[]): void {
  for (const input of inputs) {
    if (input.id !== undefined) throw new DocumentOperationError('INVALID_OPERATION', '新增子树不能指定节点 ID。')
    const result = opAddNode(doc, profile, { parentId: parent.id, title: input.title, content: input.content, role: input.role, properties: input.properties }, now, 'tool:apply_document_patch')
    added.push(result.node.id)
    appendInputChildren(doc, profile, result.node, input.children ?? [], now, added)
  }
}

interface PersistOutcome {
  saved: boolean
  markdownUpdated: boolean
  sidecarSaved: boolean
}

// ─── 会话注册表 ─────────────────────────────────────────────────────────────

/**
 * 会话工作区注册表:按 Agent 会话隔离文档状态(与会话 cwd、当前文件集成点
 * 对齐)。提供可选的 CurrentFileProvider 懒绑定接缝(见 plugin/current-file.ts)。
 */
export class WorkspaceRegistry {
  private readonly workspaces = new Map<string, SessionWorkspace>()
  private provider: CurrentFileProvider | null = null
  private readonly fileTails = new Map<string, Promise<void>>()
  private readonly sessionTails = new Map<string, Promise<void>>()

  constructor(private readonly options: KernelOptions) {}

  resolvePath(sessionId: string, rawPath: string): Promise<string> {
    return this.options.resolvePath(sessionId, rawPath)
  }

  /** Serialize document transactions that address the same normalized file. */
  async withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T> {
    const previous = this.fileTails.get(filePath) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    this.fileTails.set(filePath, tail)
    await previous
    try {
      return await task()
    } finally {
      release()
      if (this.fileTails.get(filePath) === tail) this.fileTails.delete(filePath)
    }
  }

  /** Serialize target binding and tool work within one conversation session. */
  async withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.sessionTails.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    this.sessionTails.set(sessionId, tail)
    await previous
    try {
      return await task()
    } finally {
      release()
      if (this.sessionTails.get(sessionId) === tail) this.sessionTails.delete(sessionId)
    }
  }

  /** 由 StructuredDocumentService 或其他集成方注入“当前文件”来源。 */
  attachCurrentFileProvider(provider: CurrentFileProvider): void {
    this.provider = provider
  }

  /** 是否已注入当前文件提供者。 */
  get hasCurrentFileProvider(): boolean {
    return this.provider !== null
  }

  /** 取会话工作区(没有则创建空工作区)。 */
  get(sessionId: string): SessionWorkspace {
    let workspace = this.workspaces.get(sessionId)
    if (workspace === undefined) {
      workspace = new SessionWorkspace(sessionId, this.options)
      this.workspaces.set(sessionId, workspace)
    }
    return workspace
  }

  /** 取已绑定当前文件的工作区;未绑定时尝试经 CurrentFileProvider 懒绑定。 */
  async requireBound(sessionId: string): Promise<SessionWorkspace> {
    const workspace = this.get(sessionId)
    if (workspace.bound) return workspace
    if (this.provider !== null) {
      const provided = await this.provider.getCurrentFile(sessionId)
      if (provided !== null && provided !== '') {
        await workspace.bindFile(provided)
        return workspace
      }
    }
    throw new DocumentOperationError('NO_CURRENT_FILE', '没有当前文件:请先打开或指定一个结构化文档(当前文件)。')
  }

  /** 订阅某会话工作区的变化(bound/unbound/document/selection);返回退订函数。 */
  onSessionChanged(sessionId: string, listener: WorkspaceChangeListener): () => void {
    return this.get(sessionId).onChanged(listener)
  }

  /** 释放会话工作区(会话结束时调用)。 */
  dispose(sessionId: string): void {
    const workspace = this.workspaces.get(sessionId)
    if (workspace !== undefined) {
      workspace.unbindFile()
      this.workspaces.delete(sessionId)
    }
  }

  /** 释放全部(插件卸载时)。 */
  disposeAll(): void {
    for (const sessionId of [...this.workspaces.keys()]) this.dispose(sessionId)
  }
}

/** 当前文件提供者(预留接口,需求第 12.1 章)。 */
export interface CurrentFileProvider {
  /** 返回该会话的当前文件路径;没有则返回 null。 */
  getCurrentFile(sessionId: string): string | null | Promise<string | null>
}
