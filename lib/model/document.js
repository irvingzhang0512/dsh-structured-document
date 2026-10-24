import { invalidOperation } from "./errors.js";
/** 将计数器格式化为 ID。 */
function formatId(seq) {
    return `node_${String(seq).padStart(3, '0')}`;
}
/** 从 ID 中解析计数器数值(非 node_N 形状返回 null)。 */
export function parseNodeId(id) {
    const match = /^node_(\d+)$/.exec(id);
    return match === null ? null : Number.parseInt(match[1], 10);
}
/** 判断一个字符串是否是本插件形状的节点 ID。 */
export function isNodeIdShape(id) {
    return /^node_\d+$/.test(id);
}
/** 分配下一个节点 ID(副作用:推进文档计数器)。 */
export function allocateNodeId(doc) {
    const next = doc.metadata.node_seq + 1;
    doc.metadata.node_seq = next;
    return formatId(next);
}
/** 创建节点对象(不挂到树上)。 */
export function createNode(doc, now, createdBy, fields) {
    return {
        id: allocateNodeId(doc),
        title: fields?.title ?? '',
        content: fields?.content ?? '',
        role: fields?.role ?? '',
        properties: { ...(fields?.properties ?? {}) },
        children: [],
        metadata: {
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            created_by: createdBy,
        },
    };
}
/**
 * 加载已有文档时把计数器推进到现有最大 ID 之后(防止 sidecar 丢失后复用 ID)。
 */
export function syncNodeIdCounter(doc) {
    let max = doc.metadata.node_seq;
    for (const node of walkNodes(doc)) {
        const parsed = parseNodeId(node.id);
        if (parsed !== null && parsed > max)
            max = parsed;
    }
    doc.metadata.node_seq = max;
}
/** 前序遍历全部节点(含根)。 */
export function* walkNodes(doc) {
    yield doc.root;
    for (const node of walkChildren(doc.root))
        yield node;
}
function* walkChildren(node) {
    for (const child of node.children) {
        yield child;
        for (const descendant of walkChildren(child))
            yield descendant;
    }
}
/** 按 ID 查找节点。 */
export function findNodeById(doc, id) {
    for (const node of walkNodes(doc)) {
        if (node.id === id)
            return node;
    }
    return undefined;
}
/** 要求节点存在,否则抛 NODE_NOT_FOUND。 */
export function requireNode(doc, id, hint) {
    if (typeof id !== 'string' || id === '') {
        throw invalidOperation(`${hint}:缺少节点标识。`);
    }
    const node = findNodeById(doc, id);
    if (node === undefined) {
        throw invalidOperation(`${hint}:未找到节点 ${id}。`);
    }
    return node;
}
/** 从根到目标节点的路径(含根与目标)。目标不存在返回 undefined。 */
export function nodePath(doc, id) {
    const path = [];
    let found = false;
    const visit = (node) => {
        path.push(node);
        if (node.id === id) {
            found = true;
            return true;
        }
        for (const child of node.children) {
            if (visit(child))
                return true;
        }
        path.pop();
        return false;
    };
    visit(doc.root);
    return found ? path : undefined;
}
/** 从根到目标的标题路径(不含根),如 `9月可行性验证 / 验证计划`。 */
export function nodeBreadcrumb(doc, id) {
    const path = nodePath(doc, id);
    if (path === undefined)
        return undefined;
    return path.slice(1).map((node) => node.title === '' ? '(无标题)' : node.title).join(' / ');
}
/** 目标是否是祖先节点自身或其子孙(用于防止移动进自己的子树)。 */
export function isSelfOrDescendant(ancestor, targetId) {
    if (ancestor.id === targetId)
        return true;
    for (const child of ancestor.children) {
        if (isSelfOrDescendant(child, targetId))
            return true;
    }
    return false;
}
/** 节点深度(根为 0)。 */
export function nodeDepth(doc, id) {
    const path = nodePath(doc, id);
    return path === undefined ? undefined : path.length - 1;
}
/** 深拷贝文档(撤销与回滚的基元;文档规模小,深拷贝开销可忽略)。 */
export function cloneDocument(doc) {
    return structuredClone(doc);
}
