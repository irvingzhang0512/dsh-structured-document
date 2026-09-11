/**
 * 节点引用解析(Node Reference Resolution)。
 *
 * 工具的 `node` 参数是一个统一引用字符串,支持(requirements.md 第 22 章的中文
 * 指代由 SKILL.md 教 LLM 映射到这些引用):
 *
 *   `node_007`       节点 ID(精确)
 *   `@selected`      当前节点(Selected Node)
 *   `@last_edited`   最近修改节点(Last Edited Node)
 *   `@last_created`  最近新增节点(Last Created Node)
 *   `@root`          根节点(文档标题)
 *   其他文本          按标题匹配(先精确后包含;多候选报 MULTIPLE_NODES_FOUND)
 *
 * `occurrence` 用于同名歧义:第 N 个(1 起;负数从末尾计数,-1 = 最后一个)。
 * `relative` 在基础引用解析后做相对定位:previous_sibling / next_sibling /
 * parent / first_child / last_child。
 */
import type { DocNode, StructuredDocument } from '../model/types.ts'
import type { NodeCandidate } from '../model/errors.ts'
import { DocumentOperationError, invalidOperation, multipleNodesFound, nodeNotFound } from '../model/errors.ts'
import { findNodeById, nodeBreadcrumb, nodePath } from '../model/document.ts'
import type { DocumentStateTracker } from './document-state.ts'

/** 支持的相对定位。 */
export type RelativePosition = 'previous_sibling' | 'next_sibling' | 'parent' | 'first_child' | 'last_child'

/** 工具层传来的引用参数。 */
export interface NodeRefArgs {
  node?: string
  occurrence?: number
  relative?: RelativePosition
}

export const SPECIAL_REFS = ['@selected', '@last_edited', '@last_created', '@root'] as const

/** 引用解析结果。 */
export interface ResolvedRef {
  node: DocNode
  /** 是否经过 relative 定位(用于提示)。 */
  relativeApplied?: RelativePosition
}

/** 解析引用字符串为具体节点;失败抛 DocumentOperationError。 */
export function resolveNodeRef(
  doc: StructuredDocument,
  state: DocumentStateTracker,
  args: NodeRefArgs,
  hint: string,
): ResolvedRef {
  const base = resolveBase(doc, state, args, hint)
  const final = applyRelative(doc, base, args.relative, hint)
  return { node: final, relativeApplied: args.relative }
}

function resolveBase(doc: StructuredDocument, state: DocumentStateTracker, args: NodeRefArgs, hint: string): DocNode {
  const raw = args.node

  // 未提供 node:默认当前节点(Selected Node)。
  if (raw === undefined || raw === '') {
    const selected = state.selectedNodeId === null ? undefined : findNodeById(doc, state.selectedNodeId)
    if (selected === undefined) {
      throw new DocumentOperationError(
        'NODE_NOT_FOUND',
        `${hint}:还没有选中节点。请先“选中”一个节点(例如先说出节点标题),或直接给出节点 ID。`,
      )
    }
    return selected
  }

  if (raw === '@root') return doc.root

  if (raw === '@selected' || raw === '@last_edited' || raw === '@last_created') {
    const pointerId = raw === '@selected'
      ? state.selectedNodeId
      : raw === '@last_edited'
        ? state.lastEditedNodeId
        : state.lastCreatedNodeId
    const label = raw === '@selected' ? '当前节点' : raw === '@last_edited' ? '最近修改节点' : '最近新增节点'
    const target = pointerId === null ? undefined : findNodeById(doc, pointerId)
    if (target === undefined) {
      throw nodeNotFound(`${hint}:还没有${label}的记录,无法确定“${raw}”。`)
    }
    return target
  }

  // node_N 形状:优先按 ID 解析;ID 不存在时回退按标题匹配。
  if (/^node_\d+$/.test(raw)) {
    const byId = findNodeById(doc, raw)
    if (byId !== undefined) return byId
  }

  // 按标题匹配:先精确,后包含。
  const exact = matchByTitle(doc, raw, (candidate) => candidate.title === raw)
  const matches = exact.length > 0 ? exact : matchByTitle(doc, raw, (candidate) => candidate.title.includes(raw))
  if (matches.length === 0) {
    throw nodeNotFound(`${hint}:未找到标题包含“${raw}”的节点。可以先获取大纲(get_outline)确认标题。`)
  }
  if (matches.length === 1) return matches[0].node

  // 多候选:有 occurrence 取第 N 个,否则报歧义。
  if (args.occurrence !== undefined) {
    if (!Number.isInteger(args.occurrence)) {
      throw invalidOperation(`${hint}:occurrence 必须是整数(1 表示第一个,-1 表示最后一个)。`)
    }
    const index = args.occurrence > 0 ? args.occurrence - 1 : matches.length + args.occurrence
    if (index < 0 || index >= matches.length) {
      throw nodeNotFound(`${hint}:“${raw}”共 ${matches.length} 个候选,occurrence=${args.occurrence} 超出范围。`)
    }
    return matches[index].node
  }
  const candidates: NodeCandidate[] = matches.map((match) => ({
    node_id: match.node.id,
    title: match.node.title,
    role: match.node.role,
    path: match.path,
  }))
  throw multipleNodesFound(
    `${hint}:找到 ${matches.length} 个标题包含“${raw}”的节点,请确认是哪一个(可用 occurrence 参数指定第几个):` +
    candidates.map((candidate, index) => ` ${index + 1}. ${candidate.path}`).join(';'),
    candidates,
  )
}

interface TitleMatch { node: DocNode, path: string }

function matchByTitle(doc: StructuredDocument, raw: string, predicate: (node: DocNode) => boolean): TitleMatch[] {
  const matches: TitleMatch[] = []
  const visit = (node: DocNode): void => {
    if (predicate(node)) {
      matches.push({ node, path: breadcrumbOrTitle(doc, node) })
    }
    for (const child of node.children) visit(child)
  }
  visit(doc.root)
  return matches
}

function breadcrumbOrTitle(doc: StructuredDocument, node: DocNode): string {
  const breadcrumb = node.id === doc.root.id ? '' : nodeBreadcrumb(doc, node.id) ?? ''
  return breadcrumb !== '' ? breadcrumb : (node.title === '' ? '(无标题)' : node.title)
}

function applyRelative(doc: StructuredDocument, base: DocNode, relative: RelativePosition | undefined, hint: string): DocNode {
  if (relative === undefined) return base
  if (base.id === doc.root.id && (relative === 'previous_sibling' || relative === 'next_sibling' || relative === 'parent')) {
    throw invalidOperation(`${hint}:根节点(${base.id})没有兄弟或父节点,无法做“${relative}”相对定位。`)
  }
  switch (relative) {
    case 'parent': {
      const path = nodePath(doc, base.id)
      if (path === undefined || path.length < 2) throw nodeNotFound(`${hint}:找不到 ${base.id} 的父节点。`)
      return path[path.length - 2]
    }
    case 'first_child': {
      if (base.children.length === 0) throw nodeNotFound(`${hint}:节点 ${base.id}(${describe(base)})没有子节点。`)
      return base.children[0]
    }
    case 'last_child': {
      if (base.children.length === 0) throw nodeNotFound(`${hint}:节点 ${base.id}(${describe(base)})没有子节点。`)
      return base.children[base.children.length - 1]
    }
    case 'previous_sibling':
    case 'next_sibling': {
      const path = nodePath(doc, base.id)
      if (path === undefined || path.length < 2) throw nodeNotFound(`${hint}:找不到 ${base.id} 的兄弟节点。`)
      const parent = path[path.length - 2]
      const index = parent.children.findIndex((child) => child.id === base.id)
      const targetIndex = relative === 'previous_sibling' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= parent.children.length) {
        const label = relative === 'previous_sibling' ? '上一条' : '下一条'
        throw nodeNotFound(`${hint}:${describe(base)} 已经是${label === '上一条' ? '第一' : '最后一'}个,没有${label}。`)
      }
      return parent.children[targetIndex]
    }
  }
}

function describe(node: DocNode): string {
  return node.title === '' ? '(无标题)' : `“${node.title}”`
}
