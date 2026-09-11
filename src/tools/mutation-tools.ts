/**
 * 基础修改工具(需求第 16、17 章):
 *   add_node         新增节点
 *   update_node      修改节点(标题/内容)
 *   delete_node      删除节点
 *   move_node        移动节点
 *   reorder_node     调整顺序
 *   change_role      修改角色
 *   update_property  修改属性
 *
 * 所有修改都经过内核管线:结构校验 → 自动保存 → Revision+1 → 状态更新。
 * 失败(参数非法 / 校验失败 / 保存失败)返回结构化错误,不留半完成状态。
 */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DocumentOperationError } from '../model/errors.ts'
import { ok, renderCandidates } from './envelope.ts'
import { nodeSummary, outputSchema, RELATIVE_PARAM, OCCURRENCE_PARAM, NODE_REF_PARAM, withWorkspace, type ToolDeps } from './query-tools.ts'

/** 渲染失败(含候选)。 */
function renderFail(value: { success: boolean, error?: string, message: string, candidates?: unknown }): string {
  const candidates = renderCandidates(value.candidates as never)
  return `[${value.error ?? 'ERROR'}] ${value.message}${candidates !== '' ? `\n${candidates}` : ''}`
}

// ─── add_node 新增节点 ──────────────────────────────────────────────────────

export function createAddNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'add_node',
    description: '新增节点:add_node。在指定父节点下新增一个节点(标题、内容、角色、属性可一次给全;一句话包含多个信息时应一次新增完整节点)。默认新增到当前节点(Selected Node)下、追加在末尾。适合:「在当前节点下面增加一个任务:采集热红外数据」「增加一个待办,负责人张三,周五完成」「再加一个议题」。',
    parameters: {
      title: { type: 'string', description: '节点标题;可以为空(仅内容)。' },
      content: { type: 'string', description: '节点内容(普通文本或简单 Markdown);可省略。' },
      role: { type: 'string', description: '角色(如 task 任务、action_item 待办、discussion 讨论);省略时用默认角色 note(笔记)。' },
      properties: { type: 'json', description: '属性表(对象),如 {"owner":"张三","status":"未开始","due_date":"周五"};键与值必须符合当前角色声明。' },
      parent: {
        type: 'string',
        description: `父节点引用(格式同下);省略时默认为当前节点 @selected,当前节点也未选中时挂在文档根部。${NODE_REF_PARAM.description}`,
      },
      position: { type: 'integer', description: '插入位置(在父节点的第几个子节点,0 表示第一个;负数从末尾计数;省略表示追加到最后)。' },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '新节点的完整信息(id、title、role、properties、子节点数)。' },
        parent: { type: 'json', description: '父节点摘要。' },
        position: { type: 'integer', description: '实际插入位置(0 起)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { node_id: string, title: string, role: string }, parent?: { path: string }, position?: number, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        return [{ type: 'text', text: `[OK] ${v.message}\n新节点:${v.node?.node_id} [${v.node?.role}] ${v.node?.title === '' ? '(无标题)' : v.node?.title};位于「${v.parent?.path}」第 ${(v.position ?? 0) + 1} 位;版本 ${v.revision}。已自动选中新节点。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('add_node', exec, deps, async (workspace) => {
      // 父节点缺省:当前节点;当前节点也没有 → 根节点。
      let parentArg = args.parent
      if (parentArg === undefined || parentArg === '') {
        parentArg = workspace.getSelectedNode() !== null ? '@selected' : '@root'
      }
      const parent = workspace.resolveRef(
        { node: parentArg, occurrence: args.occurrence, relative: args.relative },
        '新增节点(确定父节点)',
      )
      const properties = readPropertiesObject(args.properties)
      const committed = await workspace.addNode({
        parentId: parent.id,
        position: args.position,
        title: args.title,
        content: args.content,
        role: args.role,
        properties,
      })
      return ok('add_node', `已新增节点(${committed.result.node.id})到「${parent.title === '' ? '(无标题)' : parent.title}」下。`, {
        node: {
          node_id: committed.result.node.id,
          title: committed.result.node.title,
          role: committed.result.node.role,
          properties: committed.result.node.properties,
          child_count: committed.result.node.children.length,
        },
        parent: nodeSummary(workspace, parent),
        position: committed.result.index,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

/** 把工具参数里的 properties(json)整理为普通对象;非对象输入报 INVALID_PROPERTY。 */
function readPropertiesObject(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DocumentOperationError('INVALID_PROPERTY', 'properties 必须是对象,如 {"owner":"张三","status":"未开始"}。')
  }
  const result: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new DocumentOperationError('INVALID_PROPERTY', `属性 ${key} 的值只能是文本、数字或布尔。`)
    }
    result[key] = value
  }
  return result
}

// ─── update_node 修改节点 ──────────────────────────────────────────────────

export function createUpdateNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'update_node',
    description: '修改节点:update_node。修改节点的标题(Title)和/或内容(Content);节点 ID 不变,移动后引用依然有效。适合:「把项目目标改成……」「这一条的说明补充一句」「刚才那条标题改成增强时序信息提取」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      title: { type: 'string', description: '新的标题(传空字符串表示清空标题)。' },
      content: { type: 'string', description: '新的内容(整体替换;传空字符串表示清空内容)。' },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '修改后的节点摘要。' },
        changed: { type: 'json', description: '实际修改的字段({title:boolean,content:boolean})。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { node_id: string, title: string }, changed?: { title: boolean, content: boolean }, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        const changed = v.changed ?? { title: false, content: false }
        const fields = [changed.title ? '标题' : null, changed.content ? '内容' : null].filter(Boolean).join('和')
        return [{ type: 'text', text: `[OK] ${v.message}\n已修改${fields === '' ? '(无变化)' : fields}:${v.node?.node_id}「${v.node?.title === '' ? '(无标题)' : v.node?.title}」;版本 ${v.revision}。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('update_node', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '修改节点')
      const committed = await workspace.updateNode({ nodeId: node.id, title: args.title, content: args.content })
      return ok('update_node', `已修改节点(${committed.result.node.id})。`, {
        node: nodeSummary(workspace, committed.result.node),
        changed: committed.result.changed,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── delete_node 删除节点 ──────────────────────────────────────────────────

export function createDeleteNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'delete_node',
    description: '删除节点:delete_node。删除一个节点及其全部子节点(可用 undo 撤销);不能删除根节点(文档标题)。适合:「这一条删掉」「删除刚才那个任务」「这个不要了」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '被删除节点(子树根)的摘要。' },
        removed_count: { type: 'integer', description: '删除的节点总数(含子节点)。' },
        cleared_pointers: { type: 'array', items: { type: 'string' }, description: '因删除被清空的状态指针(当前节点/最近修改/最近新增)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { title: string }, removed_count?: number, cleared_pointers?: string[], revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        const cleared = (v.cleared_pointers ?? [])
        return [{ type: 'text', text: `[OK] ${v.message}\n已删除「${v.node?.title}」及其子节点,共 ${v.removed_count} 个节点;版本 ${v.revision}。${cleared.length > 0 ? `已清空状态指针:${cleared.join('、')}。` : ''}可用 undo 撤销。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('delete_node', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '删除节点')
      const committed = await workspace.deleteNode(node.id)
      return ok('delete_node', `已删除节点(${committed.result.removed.id})。`, {
        node: {
          node_id: committed.result.removed.id,
          title: committed.result.removed.title,
          role: committed.result.removed.role,
        },
        removed_count: committed.result.removedCount,
        cleared_pointers: committed.result.clearedPointers ?? [],
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── move_node 移动节点 ────────────────────────────────────────────────────

export function createMoveNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'move_node',
    description: '移动节点:move_node。把一个节点移动到另一个父节点下(可指定插入位置);不能移进它自己的子树,不能移动根节点。适合:「把这个移动到9月计划下面」「把灶具差异这一条放到讨论下面」「人员检测先移到10月方案实现下面」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      parent: { type: 'string', required: true, description: `新父节点引用(格式:${NODE_REF_PARAM.description})` },
      position: { type: 'integer', description: '插入位置(在新父节点的第几个子节点,0 表示第一个;负数从末尾计数;省略表示追加到最后)。' },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '被移动节点的摘要。' },
        from: { type: 'json', description: '原位置({parent_id,index})。' },
        to: { type: 'json', description: '新位置({parent_id,index})。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { node_id: string, title: string }, to?: { parent_id: string, index: number }, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        return [{ type: 'text', text: `[OK] ${v.message}\n已把「${v.node?.title}」(${v.node?.node_id})移动到 ${v.to?.parent_id} 下第 ${(v.to?.index ?? 0) + 1} 位;版本 ${v.revision}。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('move_node', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '移动节点')
      const parent = workspace.resolveRef({ node: args.parent }, '移动节点(确定目标父节点)')
      const committed = await workspace.moveNode({ nodeId: node.id, newParentId: parent.id, position: args.position })
      return ok('move_node', `已把「${node.title === '' ? '(无标题)' : node.title}」移动到「${parent.title === '' ? '(无标题)' : parent.title}」下。`, {
        node: nodeSummary(workspace, node),
        from: { parent_id: committed.result.fromParentId, index: committed.result.fromIndex },
        to: { parent_id: committed.result.toParentId, index: committed.result.toIndex },
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── reorder_node 调整顺序 ─────────────────────────────────────────────────

export function createReorderNodeTool(deps: ToolDeps) {
  return defineTool({
    name: 'reorder_node',
    description: '调整顺序:reorder_node。调整节点在兄弟节点中的顺序(不换父节点):给目标位置 position,或方向 direction(上移/下移/置顶/置底)。适合:「把第三条放到第一条」「这一条往上移」「把这个放到最后」「把当前问题下面两条交换顺序(两次调用)」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      position: { type: 'integer', description: '目标位置(兄弟间的第几个,0 表示第一个;负数从末尾计数,-1 表示最后)。与 direction 二选一。' },
      direction: {
        type: 'string',
        enum: ['up', 'down', 'top', 'bottom'],
        description: '移动方向:up 上移一位 / down 下移一位 / top 置顶 / bottom 置底。与 position 二选一。',
      },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '被调整节点的摘要。' },
        from_index: { type: 'integer', description: '原位置(0 起)。' },
        to_index: { type: 'integer', description: '新位置(0 起)。' },
        moved: { type: 'boolean', description: '位置是否实际变化(已在目标位置时为 false)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { title: string }, from_index?: number, to_index?: number, moved?: boolean, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        const moved = v.moved === true
        return [{ type: 'text', text: `[OK] ${v.message}\n「${v.node?.title}」${moved ? `从第 ${(v.from_index ?? 0) + 1} 位移动到第 ${(v.to_index ?? 0) + 1} 位` : '位置未变化(已在目标位置)'};版本 ${v.revision}。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('reorder_node', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '调整顺序')
      const committed = await workspace.reorderNode({ nodeId: node.id, position: args.position, direction: args.direction })
      const { fromIndex, toIndex } = committed.result
      const message = fromIndex === toIndex
        ? `节点(${node.id})位置未变化。`
        : `已把节点(${node.id})从第 ${fromIndex + 1} 位调整到第 ${toIndex + 1} 位。`
      return ok('reorder_node', message, {
        node: nodeSummary(workspace, node),
        from_index: fromIndex,
        to_index: toIndex,
        moved: fromIndex !== toIndex,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── change_role 修改角色 ──────────────────────────────────────────────────

export function createChangeRoleTool(deps: ToolDeps) {
  return defineTool({
    name: 'change_role',
    description: '修改角色:change_role。改变节点「是什么性质」(如讨论→结论、想法→方案、任务→风险);角色必须属于当前场景模板,新角色不支持的原属性会被移除(可用 undo 撤销)。适合:「这条不是讨论,改成结论」「刚才这一条改成方案」「这个作为待办」「这条改成风险」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      role: { type: 'string', required: true, description: '目标角色(英文标识,如 conclusion、solution、action_item;见当前模板的角色表)。' },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '修改后的节点摘要。' },
        from_role: { type: 'string', description: '原角色。' },
        to_role: { type: 'string', description: '新角色。' },
        removed_properties: { type: 'json', description: '因新角色不支持而被移除的属性(可 undo 恢复)。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { node_id: string, title: string }, from_role?: string, to_role?: string, removed_properties?: Record<string, unknown>, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        const removed = v.removed_properties !== undefined && Object.keys(v.removed_properties).length > 0
          ? `;移除了不再适用的属性:${Object.keys(v.removed_properties).join('、')}(可用 undo 撤销)`
          : ''
        return [{ type: 'text', text: `[OK] ${v.message}\n节点(${v.node?.node_id})「${v.node?.title === '' ? '(无标题)' : v.node?.title}」角色:${v.from_role} → ${v.to_role}${removed};版本 ${v.revision}。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('change_role', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '修改角色')
      const committed = await workspace.changeRole({ nodeId: node.id, role: args.role })
      return ok('change_role', `已把节点(${committed.result.node.id})的角色从 ${committed.result.fromRole} 改为 ${committed.result.toRole}。`, {
        node: nodeSummary(workspace, committed.result.node),
        from_role: committed.result.fromRole,
        to_role: committed.result.toRole,
        removed_properties: committed.result.removedProperties,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

// ─── update_property 修改属性 ──────────────────────────────────────────────

export function createUpdatePropertyTool(deps: ToolDeps) {
  return defineTool({
    name: 'update_property',
    description: '修改属性:update_property。设置或删除节点的属性(负责人 owner、状态 status、截止时间 due_date、进度 progress 等;键与取值必须符合节点当前角色的属性表;value 传 null 表示删除该属性)。适合:「负责人改成张三」「状态改成进行中」「截止时间改成周五」「进度改成50%」。',
    parameters: {
      node: { ...NODE_REF_PARAM, required: true },
      key: { type: 'string', required: true, description: '属性键(如 owner、status、due_date、progress)。' },
      value: { type: 'json', required: true, description: '属性值(文本/数字/布尔;progress 用 0-100 的整数;null 表示删除该属性)。' },
      occurrence: OCCURRENCE_PARAM,
      relative: RELATIVE_PARAM,
    },
    output: {
      schema: outputSchema({
        node: { type: 'json', description: '修改后的节点摘要。' },
        key: { type: 'string', description: '属性键。' },
        value: { type: 'json', description: '设置后的属性值(删除时省略)。' },
        removed: { type: 'boolean', description: '是否删除了属性。' },
      }),
      render: (_args, value) => {
        const v = value as unknown as { success: boolean, error?: string, message: string, candidates?: unknown, node?: { node_id: string, title: string }, key?: string, value?: unknown, removed?: boolean, revision?: number }
        if (!v.success) return [{ type: 'text', text: renderFail(value as never) }]
        const action = v.removed === true ? `已删除属性 ${v.key}` : `已把属性 ${v.key} 设为 ${JSON.stringify(v.value)}`
        return [{ type: 'text', text: `[OK] ${v.message}\n节点(${v.node?.node_id})「${v.node?.title === '' ? '(无标题)' : v.node?.title}」:${action};版本 ${v.revision}。` }]
      },
    },
    execute: async (args, exec) => withWorkspace('update_property', exec, deps, async (workspace) => {
      const node = workspace.resolveRef({ node: args.node, occurrence: args.occurrence, relative: args.relative }, '修改属性')
      const value = normalizePropertyValue(args.value)
      const committed = await workspace.setProperty({ nodeId: node.id, key: args.key, value })
      const spec = workspace.currentProfile.roles
        .flatMap((role) => role.properties)
        .find((property) => property.key === args.key)
      return ok('update_property', `已更新节点(${committed.result.node.id})的属性 ${args.key}${spec !== undefined ? `(${spec.label})` : ''}。`, {
        node: nodeSummary(workspace, committed.result.node),
        key: args.key,
        value: committed.result.removed ? undefined : committed.result.node.properties[args.key],
        removed: committed.result.removed,
        revision: committed.revision,
        saved: committed.saved,
        markdownUpdated: committed.markdownUpdated,
        sidecarSaved: committed.sidecarSaved,
      })
    }),
  })
}

/**
 * 规整属性值:进度接受 "50%" 形式并转为数字;其余保持原样
 * (null 表示删除属性;类型合法性由内核按角色声明校验)。
 */
function normalizePropertyValue(raw: unknown): string | number | boolean | null {
  if (raw === null) return null
  if (typeof raw === 'string') {
    const percentMatch = /^(\d+(?:\.\d+)?)\s*%$/.exec(raw.trim())
    if (percentMatch !== null) return Number(percentMatch[1])
    return raw
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') return raw
  throw new DocumentOperationError('INVALID_PROPERTY', '属性值只能是文本、数字、布尔或 null。')
}
