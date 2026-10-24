/** 带错误码的结构化操作错误。 */
export class DocumentOperationError extends Error {
    code;
    /** MULTIPLE_NODES_FOUND 时附带的候选列表。 */
    candidates;
    constructor(code, message, candidates) {
        super(message);
        this.name = 'DocumentOperationError';
        this.code = code;
        this.candidates = candidates;
    }
}
/** 快捷构造:未找到节点。 */
export function nodeNotFound(message) {
    return new DocumentOperationError('NODE_NOT_FOUND', message);
}
/** 快捷构造:找到多个候选节点。 */
export function multipleNodesFound(message, candidates) {
    return new DocumentOperationError('MULTIPLE_NODES_FOUND', message, candidates);
}
/** 快捷构造:操作不合法。 */
export function invalidOperation(message) {
    return new DocumentOperationError('INVALID_OPERATION', message);
}
