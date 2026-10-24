/**
 * 结构化错误:工具层把它转成 `{ success:false, error, message }` envelope。
 *
 * 错误码与 requirements.md 第 25 章保持一致;面向用户的消息一律中文。
 */
export type DocumentErrorCode = 'NO_CURRENT_FILE' | 'FILE_NOT_FOUND' | 'NODE_NOT_FOUND' | 'MULTIPLE_NODES_FOUND' | 'INVALID_ROLE' | 'INVALID_PROPERTY' | 'INVALID_OPERATION' | 'SAVE_FAILED' | 'VALIDATION_FAILED' | 'EXTERNAL_MODIFIED';
/** 候选节点(多候选歧义时返回给 LLM,由它向用户确认,禁止随机选择)。 */
export interface NodeCandidate {
    node_id: string;
    title: string;
    role: string;
    /** 从根到该节点的标题路径(不含根),如 `9月可行性验证 / 验证计划`。 */
    path: string;
}
/** 带错误码的结构化操作错误。 */
export declare class DocumentOperationError extends Error {
    readonly code: DocumentErrorCode;
    /** MULTIPLE_NODES_FOUND 时附带的候选列表。 */
    readonly candidates?: NodeCandidate[];
    constructor(code: DocumentErrorCode, message: string, candidates?: NodeCandidate[]);
}
/** 快捷构造:未找到节点。 */
export declare function nodeNotFound(message: string): DocumentOperationError;
/** 快捷构造:找到多个候选节点。 */
export declare function multipleNodesFound(message: string, candidates: NodeCandidate[]): DocumentOperationError;
/** 快捷构造:操作不合法。 */
export declare function invalidOperation(message: string): DocumentOperationError;
