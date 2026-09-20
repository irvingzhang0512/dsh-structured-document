/**
 * 场景二:项目管理(project 模板)。
 * 覆盖:task 进度(0-100 整数与 "50%" 规整)、非法属性值/非法角色/非法移动、
 * 保存失败回滚、连续撤销、顺序调整。
 */
import { describe, expect, it } from 'vitest'
import { makeScenario, type Scenario } from './helpers.ts'
import { NodeFsStorage } from '../../src/storage/storage.ts'

const PROJECT_START = `# 人员检测项目

## 项目目标

- 9 月底完成人员检测 v1

## 10月方案实现

- 完成时序特征提取
- 人员检测联调
`

/** 在 project 模板下搭建场景(工具按 SKILL.md 规则调用)。 */
async function makeProjectScenario(overrides?: ConstructorParameters<typeof makeScenario>[1]): Promise<Scenario> {
  return makeScenario(PROJECT_START, {
    fileName: 'project.md',
    ...overrides,
    kernel: { defaultProfile: 'project', ...overrides?.kernel },
  })
}

describe('场景:项目管理', () => {
  it('目标 → 任务派发 → 进度更新 → 顺序调整,全程 project 角色', async () => {
    const s = await makeProjectScenario()
    try {
      // 「进到 10 月方案实现」
      await s.call('select_node', { node: '10月方案实现' })

      // 「下面加个任务:时序模型选型,李四负责,进度 30%」(一次做全)
      const task = await s.call('add_node', {
        title: '时序模型选型',
        role: 'task',
        properties: { owner: '李四', status: '未开始', progress: 30 },
      })
      expect(task.success).toBe(true)
      const taskNode = task.node as { node_id: string, properties: Record<string, unknown> }
      expect(taskNode.properties.progress).toBe(30)

      // 「进度更新到一半」→ "50%" 由工具层规整为 50
      const half = await s.call('update_property', { node: '@last_created', key: 'progress', value: '50%' })
      expect(half.success).toBe(true)
      expect(half.value).toBe(50)

      // 「这个任务已经完成了」→ 状态枚举合法值
      const done = await s.call('update_property', { node: '@last_created', key: 'status', value: '已完成' })
      expect(done.success).toBe(true)
      expect(done.value).toBe('已完成')

      // 「把人员检测联调放到最后一条」→ reorder bottom
      const reorder = await s.call('reorder_node', { node: '人员检测联调', direction: 'bottom' })
      expect(reorder.success).toBe(true)
      expect(reorder.moved).toBe(true)

      // 结构验证:10月方案实现 下依次是 完成时序特征提取 / 时序模型选型 / 人员检测联调
      const outline = await s.call('get_outline') as unknown as { outline: Array<{ title: string, depth: number }> }
      const siblings = outline.outline.filter((row) => row.depth === 2).map((row) => row.title)
      expect(siblings.filter((title) => title !== '9 月底完成人员检测 v1')).toEqual([
        '完成时序特征提取', '时序模型选型', '人员检测联调',
      ])
    } finally {
      await s.cleanup()
    }
  })

  it('完整 V2 对齐:G/S/M/模块/决策角色、七状态、里程碑实际完成与风险等级', async () => {
    const s = await makeProjectScenario()
    try {
      await s.call('select_node', { node: '@root' })
      // 策略(G1-S1)带计划周期与七状态之一
      const strategy = await s.call('add_node', {
        title: 'G1-S1 完成移动版硬件和结构迭代', role: 'strategy',
        properties: { owner: '陈铭泽', status: '进行中', start_date: '2026-08-01', due_date: '2026-09-15' },
      })
      expect(strategy.success).toBe(true)
      // 验收(M)
      const measure = await s.call('add_node', {
        parent: '@last_created', title: 'M1 输出受控PCB、BOM及结构资料', role: 'measure',
        properties: { owner: '陈铭泽', status: '未开始', due_date: '待确认' },
      })
      expect(measure.success).toBe(true)
      // 里程碑带 actual_date
      const milestone = await s.call('add_node', {
        title: 'MVP-1 设计冻结', role: 'milestone',
        properties: { owner: '陈铭泽', status: '已完成', due_date: '2026-09-01', actual_date: '2026-09-02' },
      })
      expect(milestone.success).toBe(true)
      const msNode = milestone.node as { properties: Record<string, unknown> }
      expect(msNode.properties.actual_date).toBe('2026-09-02')
      // 风险带等级,状态用「有风险」(旧四值之外的新枚举)
      const risk = await s.call('add_node', {
        title: 'RISK-001 结构干涉风险', role: 'risk',
        properties: { owner: '陈铭泽', status: '有风险', due_date: '待确认', level: '高' },
      })
      expect(risk.success).toBe(true)
      // 决策 + 阻塞/暂停等其他新状态值
      const decision = await s.call('add_node', {
        title: 'D-1 批准核心场景范围', role: 'decision',
        properties: { owner: '王总', status: '已完成', due_date: '2026-08-20' },
      })
      expect(decision.success).toBe(true)
      const blocked = await s.call('add_node', { title: '任务X', role: 'task', properties: { status: '阻塞' } })
      expect(blocked.success).toBe(true)
      // goal/strategy 之外再验证 goal 角色
      const goal = await s.call('add_node', { title: 'G1 完成两款产品研发', role: 'goal', properties: { status: '进行中' } })
      expect(goal.success).toBe(true)
      // 七状态全部合法
      for (const status of ['未开始', '进行中', '已完成', '已取消', '有风险', '阻塞', '暂停']) {
        const set = await s.call('update_property', { node: '任务X', key: 'status', value: status })
        expect(set.success, `状态 ${status} 应合法`).toBe(true)
      }
      // 落盘内容包含新列
      const disk = await s.readDisk()
      expect(disk).toContain('实际完成')
      expect(disk).toContain('等级')
      expect(disk).toContain('| 风险 | 陈铭泽 | 有风险 | 待确认 | 高 |')
    } finally {
      await s.cleanup()
    }
  })

  it('非法输入全部被拒:非法角色、非法属性键、非法进度、非法移动', async () => {
    const s = await makeProjectScenario()
    try {
      await s.call('select_node', { node: '10月方案实现' })

      // 非法角色:milestone 是 project 的角色,但 risk 是;用模板外的角色
      const badRole = await s.call('add_node', { title: 'X', role: 'epic' })
      expect(badRole.success).toBe(false)
      expect(badRole.error).toBe('INVALID_ROLE')

      // 非法属性键:task 没有 priority
      const badKey = await s.call('add_node', {
        title: 'X', role: 'task', properties: { priority: '高' },
      })
      expect(badKey.success).toBe(false)
      expect(badKey.error).toBe('INVALID_PROPERTY')

      // 非法进度:越界与字符串
      await s.call('add_node', { title: '联调任务', role: 'task' })
      const tooBig = await s.call('update_property', { node: '@last_created', key: 'progress', value: 150 })
      expect(tooBig.success).toBe(false)
      expect(tooBig.error).toBe('INVALID_PROPERTY')
      const negative = await s.call('update_property', { node: '@last_created', key: 'progress', value: -1 })
      expect(negative.success).toBe(false)
      expect(negative.error).toBe('INVALID_PROPERTY')
      const textProgress = await s.call('update_property', { node: '@last_created', key: 'progress', value: '一半' })
      expect(textProgress.success).toBe(false)
      expect(textProgress.error).toBe('INVALID_PROPERTY')

      // 非法枚举值
      const badStatus = await s.call('update_property', { node: '@last_created', key: 'status', value: '暂时搁置' })
      expect(badStatus.success).toBe(false)
      expect(badStatus.error).toBe('INVALID_PROPERTY')

      // 非法移动:父节点移进自己的子树 / 移动根节点
      const cycle = await s.call('move_node', { node: '10月方案实现', parent: '人员检测联调' })
      expect(cycle.success).toBe(false)
      expect(cycle.error).toBe('INVALID_OPERATION')
      const rootMove = await s.call('move_node', { node: '@root', parent: '10月方案实现' })
      expect(rootMove.success).toBe(false)
      expect(rootMove.error).toBe('INVALID_OPERATION')

      // 连续失败 + 1 次成功(联调任务)后:文档只留下这次合法修改
      const doc = await s.call('get_document') as unknown as { document: { revision: number }, node_count: number }
      expect(doc.document.revision).toBe(2) // 初始 1 + 联调任务(2);8 次失败 0 次推进
      // 节点数:根+目标+9月底+阶段+2 条既有+联调任务 = 7
      expect(doc.node_count).toBe(7)
    } finally {
      await s.cleanup()
    }
  })

  it('保存失败:SAVE_FAILED 后文档回滚,随后可正常继续操作', async () => {
    let failWrites = true
    const s = await makeProjectScenario({
      kernel: {
        storage: {
          readFile: (path) => new NodeFsStorage().readFile(path),
          writeFile: async (path, content) => {
            if (failWrites) throw new Error('EACCES: 模拟文件被占用')
            return new NodeFsStorage().writeFile(path, content)
          },
        },
      },
    })
    try {
      await s.call('select_node', { node: '10月方案实现' })
      const failed = await s.call('add_node', { title: '占用期任务', role: 'task' })
      expect(failed.success).toBe(false)
      expect(failed.error).toBe('SAVE_FAILED')
      expect(String(failed.message)).toContain('EACCES')

      // 失败期间磁盘未变
      expect(await s.readDisk()).toBe(PROJECT_START)

      // 故障恢复后继续:同样的操作成功
      failWrites = false
      const retried = await s.call('add_node', { title: '占用期任务', role: 'task' })
      expect(retried.success).toBe(true)
      expect((retried.node as { node_id: string }).node_id).toBe('node_007') // ID 未被失败尝试浪费
      expect(await s.readDisk()).toContain('占用期任务')
    } finally {
      await s.cleanup()
    }
  })

  it('连续撤销链:新增 → 修改 → 删除,三次 undo 逐级恢复', async () => {
    const s = await makeProjectScenario()
    try {
      await s.call('select_node', { node: '10月方案实现' })
      const added = await s.call('add_node', { title: '新任务A', role: 'task' })
      const idA = (added.node as { node_id: string }).node_id
      await s.call('update_node', { node: idA, title: '新任务A(改)' })
      const deleted = await s.call('delete_node', { node: idA })
      expect(deleted.success).toBe(true)
      expect(deleted.removed_count).toBe(1)

      // undo #1:恢复删除
      const undo1 = await s.call('undo')
      expect(undo1.undone_action).toBe('delete_node')
      expect(undo1.restored_node_id).toBe(idA)
      // undo #2:撤销改名
      const undo2 = await s.call('undo')
      expect(undo2.undone_action).toBe('update_node')
      // undo #3:撤销新增(回到初始 5 节点)
      const undo3 = await s.call('undo')
      expect(undo3.undone_action).toBe('add_node')
      expect(undo3.undo_remaining).toBe(0)
      const emptyUndo = await s.call('undo')
      expect(emptyUndo.success).toBe(false)
      expect(emptyUndo.error).toBe('INVALID_OPERATION')

      const doc = await s.call('get_document') as unknown as { document: { root: { children: Array<{ children: unknown[] }> } } }
      expect(doc.document.root.children[1]!.children).toHaveLength(2) // 10月方案实现 回到 2 条
      // 新任务A(改) 已不存在
      const found = await s.call('find_node', { query: '新任务A' })
      expect(found.count).toBe(0)
    } finally {
      await s.cleanup()
    }
  })
})
