/**
 * 文档操作内核(Operation Kernel):对工作副本执行具体的树操作。
 *
 * 设计要点:
 * - 所有操作都作用在“工作副本”上(由内核先深拷贝),操作失败抛
 *   DocumentOperationError,不会留下半完成状态;
 * - 操作通过结构校验后才由内核提交并保存;撤销(Undo)采用文档快照,
 *   因此本模块只负责“向前”的变更,不需要逆向描述;
 * - 本模块不接触文件系统,便于单元测试。
 */
import type { DocNode, NodeProperties, ProfileDefinition, PropertyValue, StructuredDocument } from '../model/types.ts'
import { DocumentOperationError, invalidOperation, nodeNotFound } from '../model/errors.ts'
import { findNodeById, isSelfOrDescendant, requireNode } from '../model/document.ts'
import { checkPropertyForRole, findRole } from '../model/validation.ts'

/** 通用时间源:便于测试注入固定时间。 */
export type NowSource = () => Date

export function defaultNow(): Date {
  return new Date()
}

/** 把 insert 位置规范化为 0..length 的整数下标;不合法抛 INVALID_OPERATION。 */
export function normalizeInsertIndex(position: number | undefined, length: number, hint: string): number {
  if (position === undefined) return length
  if (!Number.isInteger(position)) throw invalidOperation(`${hint}:位置必须是整数。`)
  const index = position < 0 ? length + position + 1 : position
  if (index < 0 || index > length) {
    throw invalidOperation(`${hint}:位置 ${position} 超出范围(0 到 ${length})。`)
  }
  return index
}

/** 把子项位置规范化为 0..length-1 的整数下标;不合法抛 INVALID_OPERATION。 */
export function normalizeChildIndex(position: number, length: number, hint: string): number {
  if (!Number.isInteger(position)) throw invalidOperation(`${hint}:位置必须是整数。`)
  const index = position < 0 ? length + position : position
  if (index < 0 || index >= length) {
    throw invalidOperation(`${hint}:位置 ${position} 超出范围(0 到 ${length - 1})。`)
  }
  return index
}

function touchDocument(doc: StructuredDocument, now: Date): void {
  doc.metadata.updated_at = now.toISOString()
}

function touchNode(node: DocNode, now: Date): void {
  node.metadata.updated_at = now.toISOString()
}

// ─── 新增节点(add_node)──────────────────────────────────────────────────

export interface AddNodeArgs {
  parentId: string
  position?: number
  title?: string
  content?: string
  role?: string
  properties?: NodeProperties
}

export interface AddNodeResult {
  node: DocNode
  parentId: string
  index: number
}

/** 校验并整理新增节点的属性(按角色声明逐个检查)。 */
export function validatePropertiesForRole(profile: ProfileDefinition, role: string, properties: NodeProperties | undefined): NodeProperties {
  if (properties === undefined) return {}
  const cleaned: NodeProperties = {}
  for (const [key, value] of Object.entries(properties)) {
    const problem = checkPropertyForRole(profile, role, key, value)
    if (problem !== null) throw new DocumentOperationError('INVALID_PROPERTY', problem)
    cleaned[key] = value
  }
  return cleaned
}

/** 新增节点:默认追加到父节点末尾。 */
export function opAddNode(doc: StructuredDocument, profile: ProfileDefinition, args: AddNodeArgs, now: Date, createdBy: string): AddNodeResult {
  const parent = requireNode(doc, args.parentId, '新增节点')
  const role = args.role ?? profile.defaultRole
  if (findRole(profile, role) === undefined) {
    const available = profile.roles.map((definition) => `${definition.name}(${definition.label})`).join('、')
    throw new DocumentOperationError('INVALID_ROLE', `角色 ${role} 不在模板 ${profile.name} 中(可用角色:${available})。`)
  }
  const properties = validatePropertiesForRole(profile, role, args.properties)
  const index = normalizeInsertIndex(args.position, parent.children.length, '新增节点')
  const node: DocNode = {
    id: '',
    title: args.title ?? '',
    content: args.content ?? '',
    role,
    properties: { ...properties },
    children: [],
    metadata: {
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      created_by: createdBy,
    },
  }
  // ID 在形状确定后分配(避免校验失败时消耗计数器)。
  node.id = `node_${String(doc.metadata.node_seq + 1).padStart(3, '0')}`
  doc.metadata.node_seq += 1
  parent.children.splice(index, 0, node)
  touchDocument(doc, now)
  touchNode(parent, now)
  return { node, parentId: parent.id, index }
}

// ─── 修改节点(update_node)───────────────────────────────────────────────

export interface UpdateNodeArgs {
  nodeId: string
  title?: string
  content?: string
}

export interface UpdateNodeResult {
  node: DocNode
  changed: { title: boolean, content: boolean }
}

/** 修改节点标题 / 内容(至少给出一项)。 */
export function opUpdateNode(doc: StructuredDocument, args: UpdateNodeArgs, now: Date): UpdateNodeResult {
  if (args.title === undefined && args.content === undefined) {
    throw invalidOperation('修改节点:需要提供新的标题或内容(至少一项)。')
  }
  const node = findNodeById(doc, args.nodeId)
  if (node === undefined) throw nodeNotFound(`未找到节点:${args.nodeId}。`)
  const changed = { title: false, content: false }
  if (args.title !== undefined && args.title !== node.title) {
    node.title = args.title
    changed.title = true
  }
  if (args.content !== undefined && args.content !== node.content) {
    node.content = args.content
    changed.content = true
  }
  if (changed.title || changed.content) {
    touchNode(node, now)
    touchDocument(doc, now)
  }
  return { node, changed }
}

// ─── 删除节点(delete_node)───────────────────────────────────────────────

export interface DeleteNodeResult {
  /** 被移除的子树根(已从树上摘除)。 */
  removed: DocNode
  parentId: string
  index: number
  /** 被删除的节点总数(含子孙)。 */
  removedCount: number
}

function countNodes(node: DocNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0)
}

/** 删除节点(连同其子树);禁止删除根节点。 */
export function opDeleteNode(doc: StructuredDocument, nodeId: string, now: Date): DeleteNodeResult {
  if (nodeId === doc.root.id) {
    throw invalidOperation('不能删除根节点(文档标题)。如需清空内容,请逐个删除子节点。')
  }
  const parent = findParentOf(doc, nodeId)
  if (parent === undefined) throw nodeNotFound(`未找到节点:${nodeId}。`)
  const index = parent.children.findIndex((child) => child.id === nodeId)
  const [removed] = parent.children.splice(index, 1)
  touchDocument(doc, now)
  touchNode(parent, now)
  return { removed, parentId: parent.id, index, removedCount: countNodes(removed) }
}

/** 找到目标节点的父节点;不存在返回 undefined(根节点返回 null 语义由调用方区分)。 */
export function findParentOf(doc: StructuredDocument, nodeId: string): DocNode | undefined {
  const target = findNodeById(doc, nodeId)
  if (target === undefined) return undefined
  if (target.id === doc.root.id) return undefined
  const stack = [doc.root]
  while (stack.length > 0) {
    const node = stack.pop() as DocNode
    for (const child of node.children) {
      if (child.id === nodeId) return node
      stack.push(child)
    }
  }
  return undefined
}

// ─── 移动节点(move_node)与调整顺序(reorder_node)────────────────────────

export interface MoveNodeArgs {
  nodeId: string
  newParentId: string
  /** 插入位置(按插入后的位置计);缺省追加到末尾。 */
  position?: number
}

export interface MoveNodeResult {
  nodeId: string
  fromParentId: string
  fromIndex: number
  toParentId: string
  toIndex: number
}

/** 移动节点到新的父节点;防止移进自身子树(循环)与移动根节点。 */
export function opMoveNode(doc: StructuredDocument, args: MoveNodeArgs, now: Date): MoveNodeResult {
  const node = findNodeById(doc, args.nodeId)
  if (node === undefined) throw nodeNotFound(`未找到节点:${args.nodeId}。`)
  if (node.id === doc.root.id) {
    throw invalidOperation('不能移动根节点(文档标题)。')
  }
  const newParent = requireNode(doc, args.newParentId, '移动节点')
  if (isSelfOrDescendant(node, newParent.id)) {
    throw invalidOperation(`不能把节点移动到它自己或它的子节点下面(${node.id} → ${newParent.id}),会形成循环结构。`)
  }
  const fromParent = findParentOf(doc, node.id)
  if (fromParent === undefined) throw invalidOperation(`节点 ${node.id} 没有父节点,无法移动。`)
  const fromIndex = fromParent.children.findIndex((child) => child.id === node.id)
  const [detached] = fromParent.children.splice(fromIndex, 1)

  let toIndex: number
  if (newParent.id === fromParent.id) {
    // 同父移动:先摘除,再按“摘除后的数组”解释插入位置,再换算回最终位置。
    const requested = args.position ?? newParent.children.length
    toIndex = normalizeInsertIndex(requested, newParent.children.length, '移动节点')
  } else {
    toIndex = normalizeInsertIndex(args.position, newParent.children.length, '移动节点')
  }
  newParent.children.splice(toIndex, 0, detached)
  touchDocument(doc, now)
  touchNode(node, now)
  return { nodeId: node.id, fromParentId: fromParent.id, fromIndex, toParentId: newParent.id, toIndex }
}

export type ReorderDirection = 'up' | 'down' | 'top' | 'bottom'

export interface ReorderNodeArgs {
  nodeId: string
  /** 目标位置(兄弟间的 0 基下标;负数从末尾计数,-1 表示最后)。 */
  position?: number
  direction?: ReorderDirection
}

/** 调整节点在兄弟中的顺序(同父;up/down 到边界时为空操作)。 */
export function opReorderNode(doc: StructuredDocument, args: ReorderNodeArgs, now: Date): MoveNodeResult {
  if (args.position === undefined && args.direction === undefined) {
    throw invalidOperation('调整顺序:需要提供 position(目标位置)或 direction(up/down/top/bottom)。')
  }
  const node = findNodeById(doc, args.nodeId)
  if (node === undefined) throw nodeNotFound(`未找到节点:${args.nodeId}。`)
  if (node.id === doc.root.id) {
    throw invalidOperation('根节点没有兄弟,不能调整顺序。')
  }
  const parent = findParentOf(doc, node.id)
  if (parent === undefined) throw invalidOperation(`节点 ${node.id} 没有父节点,无法调整顺序。`)
  const siblings = parent.children
  const fromIndex = siblings.findIndex((child) => child.id === node.id)

  let toIndex: number
  if (args.direction !== undefined) {
    switch (args.direction) {
      case 'up': toIndex = Math.max(0, fromIndex - 1); break
      case 'down': toIndex = Math.min(siblings.length - 1, fromIndex + 1); break
      case 'top': toIndex = 0; break
      case 'bottom': toIndex = siblings.length - 1; break
    }
  } else {
    toIndex = normalizeChildIndex(args.position as number, siblings.length, '调整顺序')
  }
  if (toIndex === fromIndex) {
    return { nodeId: node.id, fromParentId: parent.id, fromIndex, toParentId: parent.id, toIndex }
  }
  siblings.splice(fromIndex, 1)
  siblings.splice(toIndex, 0, node)
  touchDocument(doc, now)
  touchNode(node, now)
  return { nodeId: node.id, fromParentId: parent.id, fromIndex, toParentId: parent.id, toIndex }
}

// ─── 修改角色(change_role)───────────────────────────────────────────────

export interface ChangeRoleArgs {
  nodeId: string
  role: string
}

export interface ChangeRoleResult {
  node: DocNode
  fromRole: string
  toRole: string
  /** 因新角色不再支持而被移除的属性。 */
  removedProperties: Record<string, PropertyValue>
}

/** 修改节点角色;新角色不支持的原属性会被移除(撤销可恢复)。 */
export function opChangeRole(doc: StructuredDocument, profile: ProfileDefinition, args: ChangeRoleArgs, now: Date): ChangeRoleResult {
  const node = findNodeById(doc, args.nodeId)
  if (node === undefined) throw nodeNotFound(`未找到节点:${args.nodeId}。`)
  const target = findRole(profile, args.role)
  if (target === undefined) {
    const available = profile.roles.map((definition) => `${definition.name}(${definition.label})`).join('、')
    throw new DocumentOperationError('INVALID_ROLE', `角色 ${args.role} 不在模板 ${profile.name} 中(可用角色:${available})。`)
  }
  const fromRole = node.role
  const removedProperties: Record<string, PropertyValue> = {}
  if (fromRole !== args.role) {
    for (const key of Object.keys(node.properties)) {
      const spec = target.properties.find((property) => property.key === key)
      if (spec === undefined) {
        removedProperties[key] = node.properties[key]
        delete node.properties[key]
      }
    }
    node.role = args.role
    touchNode(node, now)
    touchDocument(doc, now)
  }
  return { node, fromRole, toRole: args.role, removedProperties }
}

// ─── 修改属性(update_property)───────────────────────────────────────────

export interface SetPropertyArgs {
  nodeId: string
  key: string
  /** null 表示删除该属性。 */
  value: PropertyValue | null
}

export interface SetPropertyResult {
  node: DocNode
  key: string
  previous: PropertyValue | undefined
  removed: boolean
}

/** 修改节点属性(按角色声明校验;value 传 null 删除属性)。 */
export function opSetProperty(doc: StructuredDocument, profile: ProfileDefinition, args: SetPropertyArgs, now: Date): SetPropertyResult {
  const node = findNodeById(doc, args.nodeId)
  if (node === undefined) throw nodeNotFound(`未找到节点:${args.nodeId}。`)
  if (typeof args.key !== 'string' || args.key === '') {
    throw new DocumentOperationError('INVALID_PROPERTY', '属性名不能为空。')
  }
  const previous = node.properties[args.key]
  if (args.value === null) {
    if (previous === undefined) {
      throw new DocumentOperationError('INVALID_PROPERTY', `节点 ${node.id} 没有属性 ${args.key},无需删除。`)
    }
    delete node.properties[args.key]
    touchNode(node, now)
    touchDocument(doc, now)
    return { node, key: args.key, previous, removed: true }
  }
  const problem = checkPropertyForRole(profile, node.role, args.key, args.value)
  if (problem !== null) throw new DocumentOperationError('INVALID_PROPERTY', problem)
  node.properties[args.key] = args.value
  touchNode(node, now)
  touchDocument(doc, now)
  return { node, key: args.key, previous, removed: false }
}
