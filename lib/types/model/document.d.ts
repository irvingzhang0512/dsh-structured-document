/**
 * 节点 ID 分配:全文档内唯一、稳定、单调递增、不复用。
 *
 * ID 形如 `node_001`(与 requirements.md 第 24 章示例一致);计数器保存在
 * `document.metadata.node_seq`,由存储层持久化,保证跨会话不复用。
 */
import type { DocNode, NodeId, StructuredDocument } from './types.ts';
/** 从 ID 中解析计数器数值(非 node_N 形状返回 null)。 */
export declare function parseNodeId(id: string): number | null;
/** 判断一个字符串是否是本插件形状的节点 ID。 */
export declare function isNodeIdShape(id: string): boolean;
/** 分配下一个节点 ID(副作用:推进文档计数器)。 */
export declare function allocateNodeId(doc: StructuredDocument): NodeId;
/** 创建节点对象(不挂到树上)。 */
export declare function createNode(doc: StructuredDocument, now: Date, createdBy: string, fields?: {
    title?: string;
    content?: string;
    role?: string;
    properties?: Record<string, string | number | boolean>;
}): DocNode;
/**
 * 加载已有文档时把计数器推进到现有最大 ID 之后(防止 sidecar 丢失后复用 ID)。
 */
export declare function syncNodeIdCounter(doc: StructuredDocument): void;
/** 前序遍历全部节点(含根)。 */
export declare function walkNodes(doc: StructuredDocument): Generator<DocNode>;
/** 按 ID 查找节点。 */
export declare function findNodeById(doc: StructuredDocument, id: NodeId): DocNode | undefined;
/** 要求节点存在,否则抛 NODE_NOT_FOUND。 */
export declare function requireNode(doc: StructuredDocument, id: NodeId | null | undefined, hint: string): DocNode;
/** 从根到目标节点的路径(含根与目标)。目标不存在返回 undefined。 */
export declare function nodePath(doc: StructuredDocument, id: NodeId): DocNode[] | undefined;
/** 从根到目标的标题路径(不含根),如 `9月可行性验证 / 验证计划`。 */
export declare function nodeBreadcrumb(doc: StructuredDocument, id: NodeId): string | undefined;
/** 目标是否是祖先节点自身或其子孙(用于防止移动进自己的子树)。 */
export declare function isSelfOrDescendant(ancestor: DocNode, targetId: NodeId): boolean;
/** 节点深度(根为 0)。 */
export declare function nodeDepth(doc: StructuredDocument, id: NodeId): number | undefined;
/** 深拷贝文档(撤销与回滚的基元;文档规模小,深拷贝开销可忽略)。 */
export declare function cloneDocument(doc: StructuredDocument): StructuredDocument;
