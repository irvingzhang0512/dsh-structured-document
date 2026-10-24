/**
 * 集成服务(StructuredDocumentService):把文档内核暴露为 cordis 服务
 * `ctx.structuredDocument`,供外部集成方(如 dsh-structured-document-view
 * 视图插件)注入使用。
 *
 * 服务语义:
 * - 按会话提供"当前文件"写入口(setCurrentFile,集成方从 Sidebar/编辑器
 *   推送当前文件变化)与文档/选中变化订阅(subscribe);
 * - 文档快照(getDocumentSnapshot)同步可得(工作区文档在内核内存中);
 * - 本插件自身不做文件选择/切换(需求第 12.1 章边界),本服务就是
 *   current-file.ts 接缝的宿主集成落点。
 */
import type { StructuredDocument } from '../model/types.ts';
import { InMemoryCurrentFileStore } from '../plugin/current-file.ts';
import type { WorkspaceChange, WorkspaceChangeListener, WorkspaceRegistry } from '../state/kernel.ts';
/** 某会话的文档快照(同步读;document 为深拷贝)。 */
export interface DocumentSnapshot {
    document: StructuredDocument;
    selectedNodeId: string | null;
    currentFile: string | null;
    lastEditedNodeId: string | null;
    lastCreatedNodeId: string | null;
    dirty: boolean;
    undoDepth: number;
}
/** 服务可用的日志面。 */
export interface IntegrationLogger {
    warn?(message: string): void;
    info?(message: string): void;
}
/** 服务选项。 */
export interface StructuredDocumentServiceOptions {
    registry: WorkspaceRegistry;
    /** 当前文件存储(写入口由本服务提供)。 */
    store: InMemoryCurrentFileStore;
    /** 把(可能相对的)路径解析为绝对路径(相对会话工作目录)。 */
    resolvePath: (sessionId: string, rawPath: string) => Promise<string>;
    logger?: IntegrationLogger;
}
/** cordis 服务 `ctx.structuredDocument` 的对外形状。 */
export interface StructuredDocumentService {
    /** 服务标识。 */
    readonly id: 'dsh-structured-document';
    /**
     * 设置(或清除)会话的当前文件;触发懒绑定/按需重绑。
     * 清除会在当前会话操作完成后解绑，阻止后续工具写入旧目标。
     */
    setCurrentFile(sessionId: string, filePath: string | null): void;
    /** Set and fully bind a file before returning; used by transactional coordinators. */
    bindCurrentFile(sessionId: string, filePath: string): Promise<boolean>;
    /** Clear and fully unbind the session before returning. */
    unbindCurrentFile(sessionId: string): Promise<void>;
    /** 读取会话当前文件(未设置返回 null)。 */
    getCurrentFile(sessionId: string): string | null;
    /** 选择节点(仅更新状态指针,不修改文档)。 */
    selectNode(sessionId: string, nodeId: string | null): void;
    /** 确保会话绑定当前文件;返回是否已绑定。 */
    ensureBound(sessionId: string): Promise<boolean>;
    /** 订阅会话工作区变化;返回退订函数。 */
    subscribe(sessionId: string, listener: WorkspaceChangeListener): () => void;
    /** 同步读取会话文档快照;未绑定返回 null。 */
    getDocumentSnapshot(sessionId: string): DocumentSnapshot | null;
    /** Undo the latest document transaction in this live host process. */
    undo(sessionId: string): Promise<{
        revision: number;
        saved: boolean;
        sidecarSaved: boolean;
        undoneAction: string;
    }>;
    /** 供受信任界面使用的节点编辑入口；仍走内核事务、版本和文件校验。 */
    updateNode(sessionId: string, args: {
        nodeId: string;
        title: string;
        content: string;
        expectedFile: string;
        expectedRevision: number;
    }): Promise<{
        revision: number;
        saved: boolean;
        sidecarSaved: boolean;
    }>;
}
/** 服务实现。 */
export declare class StructuredDocumentServiceImpl implements StructuredDocumentService {
    readonly id: "dsh-structured-document";
    private readonly registry;
    private readonly store;
    private readonly resolvePath;
    private readonly logger?;
    constructor(options: StructuredDocumentServiceOptions);
    getDocumentSnapshot(sessionId: string): DocumentSnapshot | null;
    getCurrentFile(sessionId: string): string | null;
    undo(sessionId: string): Promise<{
        revision: number;
        saved: boolean;
        sidecarSaved: boolean;
        undoneAction: string;
    }>;
    updateNode(sessionId: string, args: {
        nodeId: string;
        title: string;
        content: string;
        expectedFile: string;
        expectedRevision: number;
    }): Promise<{
        revision: number;
        saved: boolean;
        sidecarSaved: boolean;
    }>;
    selectNode(sessionId: string, nodeId: string | null): void;
    setCurrentFile(sessionId: string, filePath: string | null): void;
    bindCurrentFile(sessionId: string, filePath: string): Promise<boolean>;
    unbindCurrentFile(sessionId: string): Promise<void>;
    ensureBound(sessionId: string): Promise<boolean>;
    subscribe(sessionId: string, listener: WorkspaceChangeListener): () => void;
    /** 确保工作区绑定 filePath:未绑定则懒绑定;已绑定且路径变化则重绑。 */
    private syncBound;
}
/** 导出类型(供 apply 的 service 形状引用)。 */
export type { WorkspaceChange, WorkspaceChangeListener };
