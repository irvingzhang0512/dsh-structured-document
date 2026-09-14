/**
 * 结构化错误:工具层把它转成 `{ success:false, error, message }` envelope。
 *
 * 错误码与 requirements.md 第 25 章保持一致;面向用户的消息一律中文。
 */
export type DocumentErrorCode =
  | 'NO_CURRENT_FILE'        // 没有当前文件
  | 'FILE_NOT_FOUND'         // 当前文件无法读取(扩展码:文件不存在/不可读)
  | 'NODE_NOT_FOUND'         // 未找到节点
  | 'MULTIPLE_NODES_FOUND'   // 找到多个候选节点
  | 'INVALID_ROLE'           // 角色不合法
  | 'INVALID_PROPERTY'       // 属性不合法
  | 'INVALID_OPERATION'      // 操作不合法
  | 'SAVE_FAILED'            // 保存失败
  | 'VALIDATION_FAILED'      // 结构校验失败
  | 'EXTERNAL_MODIFIED'      // 读取后目标版本被外部修改

/** 候选节点(多候选歧义时返回给 LLM,由它向用户确认,禁止随机选择)。 */
export interface NodeCandidate {
  node_id: string
  title: string
  role: string
  /** 从根到该节点的标题路径(不含根),如 `9月可行性验证 / 验证计划`。 */
  path: string
}

/** 带错误码的结构化操作错误。 */
export class DocumentOperationError extends Error {
  readonly code: DocumentErrorCode
  /** MULTIPLE_NODES_FOUND 时附带的候选列表。 */
  readonly candidates?: NodeCandidate[]

  constructor(code: DocumentErrorCode, message: string, candidates?: NodeCandidate[]) {
    super(message)
    this.name = 'DocumentOperationError'
    this.code = code
    this.candidates = candidates
  }
}

/** 快捷构造:未找到节点。 */
export function nodeNotFound(message: string): DocumentOperationError {
  return new DocumentOperationError('NODE_NOT_FOUND', message)
}

/** 快捷构造:找到多个候选节点。 */
export function multipleNodesFound(message: string, candidates: NodeCandidate[]): DocumentOperationError {
  return new DocumentOperationError('MULTIPLE_NODES_FOUND', message, candidates)
}

/** 快捷构造:操作不合法。 */
export function invalidOperation(message: string): DocumentOperationError {
  return new DocumentOperationError('INVALID_OPERATION', message)
}
