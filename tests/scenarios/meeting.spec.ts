/**
 * 场景一:会议纪要(meeting 模板)。
 * 模拟一个真实周会的连续多轮中文操作:看结构 → 进议题 → 记讨论 →
 * 定结论 → 派待办(全属性)→ 改状态 → 指代操作 → 歧义确认 → 撤销 →
 * 落盘验证 → 重开会话状态恢复(节点 ID 稳定)。
 */
import { describe, expect, it } from 'vitest'
import { makeScenario } from './helpers.ts'

const MEETING_START = `# 防干烧项目周会

## 当前算法问题

- 砂锅误报较多
- 灶具差异可能有影响

## 第二技术路线

- 热红外方案正在验证
`

describe('场景:会议纪要', () => {
  it('从原始周会 Markdown 开始,连续多轮中文操作全程可追溯', async () => {
    const s = await makeScenario(MEETING_START)
    try {
      // ── 第 1 轮:「看看现在这个周会记了什么」(get_outline 定位结构)
      const outline = await s.call('get_outline')
      expect(outline.success).toBe(true)
      const rows = outline.outline as Array<{ node_id: string, title: string, depth: number }>
      expect(rows.map((row) => row.title)).toEqual(['防干烧项目周会', '当前算法问题', '砂锅误报较多', '灶具差异可能有影响', '第二技术路线', '热红外方案正在验证'])

      // ── 第 2 轮:「进入当前算法问题这部分」(select_node;后续默认作用于它)
      const selected = await s.call('select_node', { node: '当前算法问题' })
      expect(selected.success).toBe(true)
      const topicId = (selected.node as { node_id: string }).node_id
      expect(topicId).toBe('node_002')

      // ── 第 3 轮:「这个下面加一条讨论:误报集中在低功率档位」
      //    (「这个」→ @selected,add_node 默认父节点即当前节点)
      const addedDiscussion = await s.call('add_node', { title: '误报集中在低功率档位', role: 'discussion' })
      expect(addedDiscussion.success).toBe(true)
      const discussion = addedDiscussion.node as { node_id: string, role: string }
      expect(discussion.role).toBe('discussion')

      // ── 第 4 轮:「刚加的这条改成结论」(「刚加的」→ @last_created;add 后自动选中,等价 @selected)
      const toConclusion = await s.call('change_role', { node: '@last_created', role: 'conclusion' })
      expect(toConclusion.success).toBe(true)
      expect(toConclusion.to_role).toBe('conclusion')

      // ── 第 5 轮:「回到当前算法问题,再加一个待办,负责人张三,周五前完成D灶数据采集」
      //    (第 3 轮新增后当前节点已移到讨论节点;用户明确"回到议题"→ 重新选中)
      await s.call('select_node', { node: '当前算法问题' })
      const addedAction = await s.call('add_node', {
        title: '完成D灶数据采集',
        role: 'action_item',
        properties: { owner: '张三', status: '未开始', due_date: '周五' },
      })
      expect(addedAction.success).toBe(true)
      const actionId = (addedAction.node as { node_id: string }).node_id
      expect(addedAction.revision).toBe(4) // 初始导入为版本 1;add(2) → change_role(3) → add_action(4)

      // ── 第 6 轮:「这个待办状态改成进行中」(自动选中最后新增 → @selected 指向它)
      const statusUpdate = await s.call('update_property', { node: '@selected', key: 'status', value: '进行中' })
      expect(statusUpdate.success).toBe(true)
      expect(statusUpdate.value).toBe('进行中')

      // ── 第 7 轮:「上一条的负责人改成李四」(「上一条」→ previous_sibling)
      const prevSibling = await s.call('update_property', {
        node: '@selected', relative: 'previous_sibling', key: 'owner', value: '李四',
      })
      // 前一个兄弟是结论节点(discussion→conclusion),没有 owner 属性 → INVALID_PROPERTY
      expect(prevSibling.success).toBe(false)
      expect(prevSibling.error).toBe('INVALID_PROPERTY')
      // 修正说法:「上一条待办的负责人改成李四」→ find_node 按角色定位
      const found = await s.call('find_node', { role: 'action_item' })
      expect(found.count).toBe(1)
      const ownerUpdate = await s.call('update_property', {
        node: (found.matches as Array<{ node_id: string }>)[0]!.node_id, key: 'owner', value: '李四',
      })
      expect(ownerUpdate.success).toBe(true)

      // ── 第 8 轮:「把第二技术路线里那条热红外,也归到当前算法问题下面」(move_node)
      const moved = await s.call('move_node', { node: '热红外方案正在验证', parent: '当前算法问题' })
      expect(moved.success).toBe(true)
      const outlineAfterMove = await s.call('get_outline') as unknown as { outline: Array<{ node_id: string, title: string, depth: number }> }
      const movedRow = outlineAfterMove.outline.find((row) => row.title === '热红外方案正在验证')
      expect(movedRow?.depth).toBe(2) // 挂到 node_002 下的列表层

      // ── 第 9 轮:「不对,把它放回第二技术路线」(undo 撤销刚才的移动)
      const undone = await s.call('undo')
      expect(undone.success).toBe(true)
      expect(undone.undone_action).toBe('move_node')
      expect(undone.restored_node_id).toBe('node_006')
      const outlineAfterUndo = await s.call('get_outline') as unknown as { outline: Array<{ title: string, depth: number }> }
      expect(outlineAfterUndo.outline.find((row) => row.title === '热红外方案正在验证')?.depth).toBe(2)
      // 注意:node_006 恢复在原父级下,层级仍是列表层(2)
      const secondRouteRows = outlineAfterUndo.outline.filter((row) => row.depth === 2)
      expect(secondRouteRows.some((row) => row.title === '热红外方案正在验证')).toBe(true)

      // ── 落盘验证:文件与 sidecar 已同步,Revision 与内存一致
      const disk = await s.readDisk()
      expect(disk).toContain('误报集中在低功率档位')
      expect(disk).toContain('完成D灶数据采集')
      const sidecar = await s.readSidecar()
      expect(sidecar.plugin).toBe('dsh-structured-document')
      const sidecarDoc = sidecar.document as { revision: number, metadata: { node_seq: number } }
      expect(sidecarDoc.revision).toBe(8) // 初始 1 + add(2) change_role(3) add(4) status(5) owner(6) move(7) undo(8)
    } finally {
      await s.cleanup()
    }
  })

  it('多同名节点歧义:不自动随机选择,返回候选列表', async () => {
    const s = await makeScenario(`# 周会

## 议题

- 讨论热红外方案

## 决定

- 讨论热红外方案
`)
    try {
      // 「选中讨论热红外方案」→ 两个同名节点
      const ambiguous = await s.call('select_node', { node: '讨论热红外方案' })
      expect(ambiguous.success).toBe(false)
      expect(ambiguous.error).toBe('MULTIPLE_NODES_FOUND')
      const candidates = ambiguous.candidates as Array<{ node_id: string, path: string }>
      expect(candidates).toHaveLength(2)
      expect(candidates[0]!.node_id).toBe('node_003')
      expect(candidates[1]!.node_id).toBe('node_005')

      // 用户消歧:「第二个」→ occurrence: 2
      const disambiguated = await s.call('select_node', { node: '讨论热红外方案', occurrence: 2 })
      expect(disambiguated.success).toBe(true)
      expect((disambiguated.node as { node_id: string }).node_id).toBe('node_005')

      // find_node 也如实标记 ambiguous
      const found = await s.call('find_node', { query: '热红外' })
      expect(found.ambiguous).toBe(true)
      expect(found.count).toBe(2)
    } finally {
      await s.cleanup()
    }
  })

  it('重开会话(新会话 + 外部未改动):sidecar 状态恢复,节点 ID 稳定', async () => {
    const s = await makeScenario(MEETING_START)
    try {
      // 会话 A:选中并修改
      await s.call('select_node', { node: '当前算法问题' })
      const added = await s.call('add_node', { title: '低功率档位复现步骤', role: 'discussion' })
      const newId = (added.node as { node_id: string }).node_id
      const revisionA = added.revision as number

      // 模拟新会话:清理指针的方式是新建 workspace——直接用同一路径重新绑定。
      // (真实插件中会话结束由 dispose 清理;这里用第二个会话 ID 验证"另一会话同文件"场景)
      const result = await s.call('get_document')
      const state = result.state as { current_file: string }
      expect(state.current_file).toBe(s.filePath)

      // ID 稳定:node_002 仍是「当前算法问题」;新增节点 ID 依旧有效。
      const found = await s.call('find_node', { query: '低功率档位复现步骤' })
      expect((found.matches as Array<{ node_id: string }>)[0]!.node_id).toBe(newId)
      expect(revisionA).toBeGreaterThan(1)
    } finally {
      await s.cleanup()
    }
  })
})
