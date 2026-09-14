/**
 * 查看与定位工具(需求第 15 章):
 *   get_document       获取文档
 *   get_outline        获取大纲
 *   find_node          查找节点
 *   select_node        选择节点(设置当前节点)
 *   get_selected_node  获取当前节点
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ParameterPropertySpec, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { DocNode } from '../model/types.ts'
import { nodeBreadcrumb } from '../model/document.ts'
import type { SessionWorkspace, WorkspaceRegistry } from '../state/kernel.ts'
import { fail, failFromError, ok, renderCandidates, sessionIdOf, toJsonValue, type FailEnvelope } from './envelope.ts'

/** 工具依赖(可注入,便于测试)。 */
export interface ToolDeps {
  registry: WorkspaceRegistry
}

/** 公共参数:节点引用(const 保持字面量类型,供 defineTool 推断)。 */
export const NODE_REF_PARAM = {
  type: 'string',
  description: '节点引用:节点 ID(node_007)/ 标题文本(先精确后包含匹配)/ @selected 当前节点 / @last_edited 最近修改节点 / @last_created 最近新增节点 / @root 根节点。省略时默认作用于当前节点。',
} as const satisfies ParameterPropertySpec

/** 公共参数:同名歧义消解。 */
export const OCCURRENCE_PARAM = {
  type: 'integer',
  description: '当标题匹配到多个节点时选第几个(从 1 起;负数从末尾计数,-1 表示最后一个)。',
} as const satisfies ParameterPropertySpec

/** 公共参数:相对定位。 */
export const RELATIVE_PARAM = {
  type: 'string',
  enum: ['previous_sibling', 'next_sibling', 'parent', 'first_child', 'last_child'],
  description: '相对定位(先解析 node,再做相对定位):previous_sibling 上一条 / next_sibling 下一条 / parent 父节点 / first_child 第一个子节点 / last_child 最后一个子节点。',
} as const satisfies ParameterPropertySpec

/**
 * envelope 基础输出字段(const 字面量,保证 defineTool 精确推断)。
 * success/action/message 恒存在;工具特定字段因失败路径不存在而一律可选。
 */
export const BASE_OUTPUT = {
  success: { type: 'boolean', required: true, description: '是否成功。' },
  action: { type: 'string', required: true, description: '工具动作名。' },
  message: { type: 'string', required: true, description: '中文结果说明。' },
  revision: { type: 'integer', description: '当前文档版本。' },
  saved: { type: 'boolean', description: '本次是否已持久化。' },
  markdownUpdated: { type: 'boolean', description: '本次是否已把完整业务信息写入 Markdown。' },
  sidecarSaved: { type: 'boolean', description: '内部 sidecar 状态是否同步成功；false 不表示 Markdown 业务数据丢失。' },
  error: { type: 'string', description: '失败时的错误码。' },
  candidates: {
    type: 'array',
    description: '多候选歧义时的候选节点列表(禁止随机选择,需向用户确认)。',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        node_id: { type: 'string', required: true, description: '节点 ID。' },
        title: { type: 'string', required: true, description: '标题。' },
        role: { type: 'string', required: true, description: '角色。' },
        path: { type: 'string', required: true, description: '从根到该节点的标题路径。' },
      },
    },
  },
} as const satisfies Record<string, ParameterPropertySpec>

/**
 * 组合输出根 schema。泛型 + 字面量保持,让 defineTool 的 const O 推断出精确类型,
 * execute 的返回值据此受类型检查(宽化会让推断塌缩为 never)。
 */
export function outputSchema<const E extends Record<string, ParameterPropertySpec>>(extra: E) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: { ...BASE_OUTPUT, ...extra },
  } as const
}

/** 统一执行壳:会话解析 + 当前文件懒绑定 + 错误转 envelope。 */
export async function withWorkspace<T>(
  action: string,
  exec: ToolRunContext,
  deps: ToolDeps,
  fn: (workspace: SessionWorkspace) => Promise<T>,
): Promise<T | FailEnvelope> {
  exec.signal.throwIfAborted()
  const sessionId = sessionIdOf(exec)
  if (sessionId === null) {
    return fail(action, 'INVALID_OPERATION', '无法确定调用方会话:该工具需要由会话中的 Agent 调用。')
  }
  try {
    return await deps.registry.withSessionLock(sessionId, async () => {
      const workspace = await deps.registry.requireBound(sessionId)
      // 外部修改检测:文件在会话外被改动时以磁盘为准重新装载(需求第 12 章)。
      await workspace.refreshIfExternalChanged()
      return fn(workspace)
    })
  } catch (error) {
    return failFromError(action, error)
  }
}

/** 节点摘要(工具返回用)。 */
export function nodeSummary(workspace: SessionWorkspace, node: DocNode) {
  const doc = workspace.getDocument().doc
  return {
    node_id: node.id,
    title: node.title,
    role: node.role,
    path: node.id === doc.root.id ? '(根节点)' : nodeBreadcrumb(doc, node.id) ?? '',
    properties: node.properties,
  }
}

/** 失败结果统一渲染(含候选列表)。 */
function renderEnvelope(value: { success: boolean, error?: string, message: string, candidates?: unknown }) {
  if (value.success) return [{ type: 'text' as const, text: `[OK] ${value.message}` }]
  const candidates = renderCandidates(value.candidates as never)
  return [{ type: 'text' as const, text: `[${value.error ?? 'ERROR'}] ${value.message}${candidates !== '' ? `\n${candidates}` : ''}` }]
}

// ─── get_document 获取文档 ─────────────────────────────────────────────────

export function createGetDocumentTool(deps: ToolDeps) {
  return defineTool({
    name: 'get_document',
    description: '获取文档:get_document。读取当前文件的完整结构化文档(树形结构:节点、标题、内容、角色、属性、子节点,以及文档状态与版本)。适合:「打开的是什么文档」「把完整内容给我看」「现在文档里有什么」。',
    parameters: {},
    isConcurrencySafe: () => true,
    output: {
      schema: outputSchema({
        document: { type: 'json', description: '完整文档 IR(Document:含 root 树与 metadata)。' },
        profile: { type: 'json', description: '当前场景模板(Profile:id、名称、角色与属性表)。' },
        state: { type: 'json', description: '文档状态(当前文件、当前节点、最近修改/新增节点、Dirty、Revision)。' },
        node_count: { type: 'integer', description: '节点总数(含根)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, document?: { title?: string, revision?: number, root?: DocNode }, profile?: { name?: string }, state?: { selected_node_id?: string | null } }
        if (!v.success) return renderEnvelope(value as never)
        return [{ type: 'text', text: renderDocTree(v.document ?? {}, v.profile?.name ?? '?', v.state) }]
      },
    },
    execute: async (_args, exec) => withWorkspace('get_document', exec, deps, async (workspace) => {
      const { doc, profile, state } = workspace.getDocument()
      let nodeCount = 0
      const walk = (node: DocNode): void => {
        nodeCount += 1
        for (const child of node.children) walk(child)
      }
      walk(doc.root)
      return ok('get_document', `已读取文档「${doc.title === '' ? '(无标题)' : doc.title}」(模板:${profile.name}),共 ${nodeCount} 个节点,版本 ${doc.revision}。`, {
        document: toJsonValue(doc),
        profile: toJsonValue({ id: profile.id, name: profile.name, description: profile.description, default_role: profile.defaultRole, roles: profile.roles }),
        state: toJsonValue(state),
        node_count: nodeCount,
        revision: doc.revision,
      })
    }),
  })
}

/** 从文档树构造文本渲染行。 */
function renderDocTree(document: { title?: string, revision?: number, root?: DocNode }, profileName: string, state?: { selected_node_id?: string | null }): string {
  if (document?.root === undefined) return '(文档为空)'
  const lines: string[] = [
    `文档:${document.title === '' ? '(无标题)' : document.title}(模板:${profileName},版本:${document.revision})`,
  ]
  if (state?.selected_node_id != null) lines.push(`当前节点 ID:${state.selected_node_id}`)
  const walk = (node: DocNode, depth: number): void => {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}${depth === 0 ? '#' : depth === 1 ? '##' : '·'} ${node.id} [${node.role}] ${node.title === '' ? '(无标题)' : node.title}`)
    if (node.content !== '') {
      const preview = node.content.length > 160 ? `${node.content.slice(0, 157)}…` : node.content
      for (const line of preview.split('\n')) lines.push(`${indent}    | ${line}`)
    }
    for (const child of node.children) walk(child, depth + 1)
  }
  walk(document.root, 0)
  return lines.join('\n')
}

// ─── get_outline 获取大纲 ─────────────────────────────────────────────────

export function createGetOutlineTool(deps: ToolDeps) {
  return defineTool({
    name: 'get_outline',
    description: '获取大纲:get_outline。只看文档结构(各级标题、角色、节点 ID),不展开正文。适合:「看看现在的结构」「这个文档有哪些部分」「把大纲给我看一下」。不确定目标节点时,应先获取大纲或查找节点,禁止猜测。',
    parameters: {
      max_depth: {
        type: 'integer',
        description: '最多展示的深度(1 = 只看一级;省略展示全部)。',
      },
    },
    isConcurrencySafe: () => true,
    output: {
      schema: outputSchema({
        outline: {
          type: 'array',
          description: '大纲行(按文档顺序;depth 为层级,0 是根)。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              node_id: { type: 'string', required: true, description: '节点 ID。' },
              title: { type: 'string', required: true, description: '标题(空标题显示为「(无标题)」)。' },
              role: { type: 'string', required: true, description: '角色。' },
              depth: { type: 'integer', required: true, description: '层级(根为 0)。' },
              child_count: { type: 'integer', required: true, description: '子节点数。' },
            },
          },
        },
        total_nodes: { type: 'integer', description: '节点总数(含根)。' },
        profile_id: { type: 'string', description: '当前场景模板 ID。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, outline?: Array<{ node_id: string, title: string, role: string, depth: number, child_count: number }> }
        if (!v.success) return renderEnvelope(value as never)
        const lines: string[] = [`[OK] ${v.message}`, '大纲:']
        for (const row of v.outline ?? []) {
          lines.push(`${'  '.repeat(row.depth)}${row.depth === 0 ? '#' : row.depth === 1 ? '##' : '·'} ${row.node_id} [${row.role}] ${row.title}${row.child_count > 0 ? ` (${row.child_count} 子节点)` : ''}`)
        }
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    execute: async (args, exec) => withWorkspace('get_outline', exec, deps, async (workspace) => {
      const rows = workspace.getOutline(args.max_depth)
      const total = workspace.getOutline().length
      const { doc, profile } = workspace.getDocument()
      return ok('get_outline', `已获取大纲(模板:${profile.name}),共 ${total} 个节点。`, {
        outline: rows.map((row) => ({ node_id: row.node_id, title: row.title === '' ? '(无标题)' : row.title, role: row.role, depth: row.depth, child_count: row.child_count })),
        total_nodes: total,
        profile_id: profile.id,
        revision: doc.revision,
      })
    }),
  })
}

// ─── find_node 查找节点 ─────────────────────────────────────────────────────

export function createFindNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'find_node',
    description: '查找节点:find_node。按标题/内容关键词、角色、属性查找节点;存在多个候选时全部返回(不随机选择),需要用户确认或用「第几个」消歧。适合:「找一下热红外相关的节点」「有哪些待办」「找负责人是张三的任务」。',
    parameters: {
      query: { type: 'string', description: '关键词:匹配标题或内容(包含即命中);省略则不限。' },
      role: { type: 'string', description: '按角色过滤(如 task、action_item、discussion)。' },
      property_key: { type: 'string', description: '按属性键过滤(如 owner、status)。' },
      property_value: { type: 'string', description: '按属性值过滤(与 property_key 配合;字符串比较)。' },
    },
    isConcurrencySafe: () => true,
    output: {
      schema: outputSchema({
        matches: {
          type: 'array',
          description: '全部匹配节点(按文档顺序)。',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              node_id: { type: 'string', required: true, description: '节点 ID。' },
              title: { type: 'string', required: true, description: '标题。' },
              role: { type: 'string', required: true, description: '角色。' },
              path: { type: 'string', required: true, description: '从根到该节点的标题路径。' },
              properties: { type: 'json', description: '节点属性。' },
            },
          },
        },
        count: { type: 'integer', description: '匹配数量。' },
        ambiguous: { type: 'boolean', description: '是否多候选(count > 1 时为 true,需向用户确认)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, matches?: Array<{ node_id: string, title: string, role: string, path: string }>, count?: number }
        if (!v.success) return renderEnvelope(value as never)
        const lines = [`[OK] ${v.message}`]
        for (const match of v.matches ?? []) {
          lines.push(`  · ${match.path}(ID:${match.node_id},角色:${match.role})`)
        }
        if ((v.count ?? 0) > 1) lines.push('存在多个候选:请向用户确认是哪一个,或用「第几个」消歧。')
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    execute: async (args, exec) => withWorkspace('find_node', exec, deps, async (workspace) => {
      const matches = workspace.findNodes({
        query: args.query,
        role: args.role,
        propertyKey: args.property_key,
        propertyValue: args.property_value,
      })
      const count = matches.length
      return ok('find_node', count === 0
        ? '未找到匹配的节点。可以放宽关键词,或先获取大纲确认结构。'
        : count === 1 ? '找到 1 个匹配节点。' : `找到 ${count} 个匹配节点,请确认目标是哪一个。`, {
        matches: matches.map((match) => ({
          node_id: match.node.id,
          title: match.node.title,
          role: match.node.role,
          path: match.path === '' ? '(根节点)' : match.path,
          properties: match.node.properties,
        })),
        count,
        ambiguous: count > 1,
        revision: workspace.getDocument().doc.revision,
      })
    }),
  })
}

// ─── select_node 选择节点 ──────────────────────────────────────────────────

export function createSelectNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'select_node',
    description: '选择节点:select_node。把某个节点设为「当前节点(Selected Node)」,后续的「下面增加」「这一条」等操作默认作用于它。适合:「选中当前算法问题」「进入9月验证这一部分」「接下来改这个」。多个同名节点时会返回候选列表,必须让用户确认,不能随机选择。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '被选中节点的摘要(node_id、title、role、path、properties)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, node?: { node_id: string, title: string, role: string, path: string } }
        if (!v.success) return renderEnvelope(value as never)
        const node = v.node
        return [{ type: 'text', text: `[OK] ${v.message}\n当前节点:${node?.path ?? ''}(ID:${node?.node_id ?? ''},角色:${node?.role ?? ''})` }]
      },
    },
    execute: async (args, exec) => withWorkspace('select_node', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '选择节点')
      await workspace.selectNode(node.id)
      return ok('select_node', `已选中「${node.title === '' ? '(无标题)' : node.title}」。后续「下面增加」「这一条」等操作将默认作用于它。`, {
        node: nodeSummary(workspace, node),
      })
    }),
  })
}

// ─── get_selected_node 获取当前节点 ────────────────────────────────────────

export function createGetSelectedNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'get_selected_node',
    description: '获取当前节点:get_selected_node。返回当前节点(Selected Node),以及最近修改节点(Last Edited Node)、最近新增节点(Last Created Node)等上下文,用于确认「这个/刚才那个/刚加的」到底指向谁。适合:「现在选中的是哪个」「刚才改的是哪条」。',
    parameters: {},
    isConcurrencySafe: () => true,
    output: {
      schema: outputSchema({
        selected_node: { type: 'json', description: '当前节点摘要;未选中时为 null。' },
        last_edited_node: { type: 'json', description: '最近修改节点摘要;没有时为 null。' },
        last_created_node: { type: 'json', description: '最近新增节点摘要;没有时为 null。' },
        state: { type: 'json', description: '完整文档状态快照。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, selected_node?: unknown, last_edited_node?: unknown, last_created_node?: unknown }
        if (!v.success) return renderEnvelope(value as never)
        const lines = [`[OK] ${v.message}`]
        lines.push(`当前节点:${summarize(v.selected_node)}`)
        lines.push(`最近修改节点:${summarize(v.last_edited_node)}`)
        lines.push(`最近新增节点:${summarize(v.last_created_node)}`)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    execute: async (_args, exec) => withWorkspace('get_selected_node', exec, deps, async (workspace) => {
      const selected = workspace.getSelectedNode()
      const { doc, state } = workspace.getDocument()
      const lastEdited = state.last_edited_node_id === null ? null : findNodeSafe(workspace, state.last_edited_node_id)
      const lastCreated = state.last_created_node_id === null ? null : findNodeSafe(workspace, state.last_created_node_id)
      return ok('get_selected_node', selected === null
        ? '当前没有选中节点。可以说出节点标题来选中,或先获取大纲。'
        : `当前节点是「${selected.title === '' ? '(无标题)' : selected.title}」(${selected.id})。`, {
        selected_node: selected === null ? null : nodeSummary(workspace, selected),
        last_edited_node: lastEdited === null ? null : nodeSummary(workspace, lastEdited),
        last_created_node: lastCreated === null ? null : nodeSummary(workspace, lastCreated),
        state: toJsonValue(state),
        revision: doc.revision,
      })
    }),
  })
}

function findNodeSafe(workspace: SessionWorkspace, id: string): DocNode | null {
  const { doc } = workspace.getDocument()
  const walk = (node: DocNode): DocNode | undefined => {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = walk(child)
      if (found !== undefined) return found
    }
    return undefined
  }
  return walk(doc.root) ?? null
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return '(无)'
  const v = value as { node_id?: string, title?: string, role?: string }
  return `${v.title === '' || v.title === undefined ? '(无标题)' : v.title}(${v.node_id ?? '?'},角色:${v.role ?? '?'})`
}
