import type { DocNode, DocumentNodeInput, DocumentPatchOperation, ProfileDefinition, StructuredDocument } from '../model/types.ts';
import { type AddNodeResult, type ChangeRoleResult, type MoveNodeResult, type ReorderDirection, type SetPropertyResult, type UpdateNodeResult } from '../operations/ops.ts';
import { type DocumentStorage } from '../storage/storage.ts';
import { DocumentStateTracker } from './document-state.ts';
import { type NodeRefArgs } from './references.ts';
/** 内核配置。 */
export interface KernelOptions {
    storage: DocumentStorage;
    /** 默认场景模板(文档首次装载且无 sidecar 记录时使用)。 */
    defaultProfile: string;
    /** 自动保存(需求第 20 章默认开启)。 */
    autoSave: boolean;
    /** 撤销栈深度。 */
    maxUndoSteps: number;
    /** 把(可能相对的)路径解析为绝对路径(相对会话工作目录)。 */
    resolvePath: (sessionId: string, rawPath: string) => Promise<string>;
    /** 时间源(可注入固定时间便于测试)。 */
    now?: () => Date;
    /** 操作来源标记(写入 metadata.created_by)。 */
    createdBy?: string;
}
/** 工作区变化事件(集成层订阅:视图插件 / 状态镜像等)。 */
export type WorkspaceChange = {
    kind: 'bound';
    filePath: string;
    revision: number;
    selectedNodeId: string | null;
} | {
    kind: 'unbound';
} | {
    kind: 'document';
    revision: number;
    selectedNodeId: string | null;
    action?: string;
    summary?: DocumentMutationSummary;
    elapsedMs?: number;
} | {
    kind: 'selection';
    selectedNodeId: string | null;
};
/** 工作区变化监听器。 */
export type WorkspaceChangeListener = (change: WorkspaceChange) => void;
/** 单个会话的文档工作区。 */
export declare class SessionWorkspace {
    readonly sessionId: string;
    private readonly options;
    private doc;
    private profile;
    /** 绑定(或最近一次保存)时磁盘文件内容的哈希,用于 sidecar 一致性。 */
    private loadedHash;
    /** v1 sidecar 已被采纳但尚未通过业务修改迁移；选择操作不得提前覆盖它。 */
    private legacySidecarLoaded;
    readonly state: DocumentStateTracker;
    private undoStack;
    /** 同一宿主进程内，切换文档后仍可撤销各自的最近修改。 */
    private readonly undoStacksByFile;
    private readonly changeListeners;
    private readonly completedRequests;
    constructor(sessionId: string, options: KernelOptions);
    /** 订阅工作区变化(bound/unbound/document/selection);返回退订函数。 */
    onChanged(listener: WorkspaceChangeListener): () => void;
    private emit;
    get bound(): boolean;
    get document(): StructuredDocument;
    get currentProfile(): ProfileDefinition;
    get undoDepth(): number;
    /** 绑定当前文件(加载 + 解析 + sidecar 采纳)。 */
    bindFile(rawPath: string): Promise<BindResult>;
    /** 解绑当前文件(丢弃内存状态;磁盘文件不受影响)。 */
    unbindFile(): void;
    /**
     * 外部修改检测:当前文件在会话外被改动时(内容哈希与最近一次加载/保存不一致),
     * 以磁盘为准重新解析、重新分配 ID,并清空撤销栈与状态指针。
     * 返回是否发生了重新加载。工具层在每次调用前调用本方法(requireBound 之后)。
     */
    refreshIfExternalChanged(): Promise<boolean>;
    private now;
    private stashUndo;
    private restoreUndo;
    private countNodes;
    /** 完整文档视图。 */
    getDocument(): {
        doc: StructuredDocument;
        profile: ProfileDefinition;
        state: ReturnType<DocumentStateTracker['snapshot']>;
    };
    /** 大纲(扁平行,带深度;渲染为树形文本)。 */
    getOutline(maxDepth?: number): OutlineRow[];
    /** 按标题/内容/角色/属性查找节点。 */
    findNodes(filter: FindNodesFilter): Array<{
        node: DocNode;
        path: string;
    }>;
    /** 解析节点引用(供工具层使用)。 */
    resolveRef(args: NodeRefArgs, hint: string): DocNode;
    /** 当前节点(可能为 null)。 */
    getSelectedNode(): DocNode | null;
    private requireChangeTarget;
    /**
     * 通用变更管线:快照 → 变更 → 校验 → 保存 → 提交状态与撤销。
     * mutator 直接在工作文档上变更;返回操作结果。
     */
    private commit;
    private assertTarget;
    private idempotentMutation;
    /** Replace all document content in one validated, undoable transaction. */
    replaceDocument(args: {
        title: string;
        profileId: string;
        root?: Omit<DocumentNodeInput, 'id' | 'children'>;
        children: DocumentNodeInput[];
        expectedRevision?: number;
        expectedFile?: string;
        requestId?: string;
    }): Promise<CommittedResult<DocumentMutationSummary>>;
    /** Create and bind a new file with one complete initial document write. */
    createDocument(args: {
        filePath: string;
        title: string;
        profileId: string;
        root?: Omit<DocumentNodeInput, 'id' | 'children'>;
        children: DocumentNodeInput[];
    }): Promise<CommittedResult<DocumentMutationSummary>>;
    /** Apply multiple typed operations as one validated, undoable transaction. */
    applyPatch(args: {
        operations: DocumentPatchOperation[];
        expectedRevision?: number;
        expectedFile?: string;
        requestId?: string;
    }): Promise<CommittedResult<DocumentMutationSummary>>;
    /** 保存(自动保存模式或显式保存);失败回滚并抛 SAVE_FAILED。 */
    private persist;
    private pushUndo;
    addNode(args: {
        parentId: string;
        position?: number;
        title?: string;
        content?: string;
        role?: string;
        properties?: Record<string, string | number | boolean>;
    }): Promise<CommittedResult<AddNodeResult>>;
    updateNode(args: {
        nodeId: string;
        title?: string;
        content?: string;
    }): Promise<CommittedResult<UpdateNodeResult>>;
    deleteNode(nodeId: string): Promise<CommittedResult<DeleteOutcome>>;
    moveNode(args: {
        nodeId: string;
        newParentId: string;
        position?: number;
    }): Promise<CommittedResult<MoveNodeResult>>;
    reorderNode(args: {
        nodeId: string;
        position?: number;
        direction?: ReorderDirection;
    }): Promise<CommittedResult<MoveNodeResult>>;
    changeRole(args: {
        nodeId: string;
        role: string;
    }): Promise<CommittedResult<ChangeRoleResult>>;
    setProperty(args: {
        nodeId: string;
        key: string;
        value: string | number | boolean | null;
    }): Promise<CommittedResult<SetPropertyResult>>;
    /** 撤销上一步操作(恢复快照 + 保存 + Revision+1)。 */
    undo(): Promise<CommittedResult<{
        undoneAction: string;
        restoredNodeId: string | null;
    }>>;
    /** 显式保存(save_document 调试工具)。 */
    saveNow(): Promise<CommittedResult<{
        wasDirty: boolean;
    }>>;
    /**
     * 选择节点(select_node):只更新状态指针,不改文档、不推进版本;
     * 尽力而为地把状态写回 sidecar,保证跨会话状态恢复。
     */
    selectNode(nodeId: string | null): Promise<void>;
}
/** 删除结果(内核扩展:被删除 ID 集与被清理的指针)。 */
export interface DeleteOutcome {
    removed: DocNode;
    parentId: string;
    index: number;
    removedCount: number;
    deletedIds: Set<string>;
    clearedPointers?: string[];
}
/** find_node 过滤条件。 */
export interface FindNodesFilter {
    query?: string;
    role?: string;
    propertyKey?: string;
    propertyValue?: string;
    /** 多属性 AND 匹配(与 property_key/property_value 可同时使用,之间也是 AND)。 */
    properties?: Record<string, unknown>;
}
/** 大纲行。 */
export interface OutlineRow {
    node_id: string;
    title: string;
    role: string;
    depth: number;
    content_preview?: string;
    child_count: number;
}
/** 绑定结果。 */
export interface BindResult {
    filePath: string;
    title: string;
    profileId: string;
    nodeCount: number;
    source: 'sidecar' | 'fresh' | 'reparsed';
    revision: number;
}
/** 提交结果。 */
export interface CommittedResult<R> {
    result: R;
    revision: number;
    saved: boolean;
    markdownUpdated: boolean;
    sidecarSaved: boolean;
}
export interface DocumentMutationSummary {
    kind: 'replace' | 'patch';
    added_node_ids: string[];
    updated_node_ids: string[];
    deleted_node_ids: string[];
    counts: {
        added: number;
        updated: number;
        deleted: number;
    };
}
/**
 * 会话工作区注册表:按 Agent 会话隔离文档状态(与会话 cwd、当前文件集成点
 * 对齐)。提供可选的 CurrentFileProvider 懒绑定接缝(见 plugin/current-file.ts)。
 */
export declare class WorkspaceRegistry {
    private readonly options;
    private readonly workspaces;
    private provider;
    private readonly fileTails;
    private readonly sessionTails;
    constructor(options: KernelOptions);
    resolvePath(sessionId: string, rawPath: string): Promise<string>;
    /** Serialize document transactions that address the same normalized file. */
    withFileLock<T>(filePath: string, task: () => Promise<T>): Promise<T>;
    /** Serialize target binding and tool work within one conversation session. */
    withSessionLock<T>(sessionId: string, task: () => Promise<T>): Promise<T>;
    /** 由 StructuredDocumentService 或其他集成方注入“当前文件”来源。 */
    attachCurrentFileProvider(provider: CurrentFileProvider): void;
    /** 是否已注入当前文件提供者。 */
    get hasCurrentFileProvider(): boolean;
    /** 取会话工作区(没有则创建空工作区)。 */
    get(sessionId: string): SessionWorkspace;
    /** 取已绑定当前文件的工作区;未绑定时尝试经 CurrentFileProvider 懒绑定。 */
    requireBound(sessionId: string): Promise<SessionWorkspace>;
    /** 订阅某会话工作区的变化(bound/unbound/document/selection);返回退订函数。 */
    onSessionChanged(sessionId: string, listener: WorkspaceChangeListener): () => void;
    /** 释放会话工作区(会话结束时调用)。 */
    dispose(sessionId: string): void;
    /** 释放全部(插件卸载时)。 */
    disposeAll(): void;
}
/** 当前文件提供者(预留接口,需求第 12.1 章)。 */
export interface CurrentFileProvider {
    /** 返回该会话的当前文件路径;没有则返回 null。 */
    getCurrentFile(sessionId: string): string | null | Promise<string | null>;
}
