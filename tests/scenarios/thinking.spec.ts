/**
 * 场景三:思路整理(thinking 模板)。
 * 覆盖:想法 → 方案 → 结论的角色演进、疑问记录、
 * 多轮中文指代(这个 / 刚才那个 / 上一条 / 第二个)、
 * 外部修改后重解析(ID 重新分配,不误指旧 ID)。
 */
import { describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { makeScenario } from './helpers.ts'

const THINKING_START = `# 时序信息提取汇报思路

## 问题

- 现有方法对长序列建模不足

## 疑问

- 评估指标怎么选
`

describe('场景:思路整理', () => {
  it('想法 → 方案 → 结论的角色演进与指代链', async () => {
    const s = await makeScenario(THINKING_START, { fileName: 'thinking.md', kernel: { defaultProfile: 'thinking' } })
    try {
      // 「在问题下面加一个想法:引入分层注意力」
      await s.call('select_node', { node: '问题' })
      const idea = await s.call('add_node', { title: '引入分层注意力', role: 'idea' })
      expect(idea.success).toBe(true)
      const ideaId = (idea.node as { node_id: string }).node_id

      // 「刚才那个想法补充内容:用窗口注意力降低复杂度」→ @last_created
      const enriched = await s.call('update_node', { node: '@last_created', content: '用窗口注意力降低复杂度' })
      expect(enriched.success).toBe(true)
      expect((enriched.node as { node_id: string }).node_id).toBe(ideaId)

      // 「这个想法成型了,改成方案」
      const solution = await s.call('change_role', { node: '@selected', role: 'solution' })
      expect(solution.success).toBe(true)
      expect(solution.from_role).toBe('idea')
      expect(solution.to_role).toBe('solution')

      // 「这个方案后面补一条疑问:窗口大小怎么定」→ next_sibling:方案已是末节点,如实报错
      const noNext = await s.call('add_node', {
        title: '窗口大小怎么定', role: 'question', parent: '@selected', relative: 'next_sibling',
      })
      expect(noNext.success).toBe(false)
      expect(noNext.error).toBe('NODE_NOT_FOUND')
      // 模型重试:改说「在『问题』这一节末尾补一条疑问」→ 父级 + 追加
      const question = await s.call('add_node', {
        title: '窗口大小怎么定', role: 'question', parent: '问题', position: -1,
      })
      expect(question.success).toBe(true)
      const questionId = (question.node as { node_id: string }).node_id
      expect(questionId).not.toBe(ideaId)

      // 「上一条再拆细一点:先做小窗口实验」→ 在疑问前插入 note
      const note = await s.call('add_node', {
        title: '先做小窗口实验', parent: '@selected', relative: 'previous_sibling',
      })
      expect(note.success).toBe(true)
      // 默认角色 note(thinking 模板含 note)
      expect((note.node as { role: string }).role).toBe('note')

      // 「评估指标那个疑问呢?看看现在选中的是谁」→ get_selected_node 澄清指代
      const ctx = await s.call('get_selected_node')
      expect((ctx.selected_node as { node_id: string }).node_id).toBe((note.node as { node_id: string }).node_id)
      expect((ctx.last_created_node as { node_id: string }).node_id).toBe((note.node as { node_id: string }).node_id)

      // 「不对,刚才说的是评估指标那条,标成已解决的说法:改为结论?不,先删掉窗口实验」
      const del = await s.call('delete_node', { node: '@last_created' })
      expect(del.success).toBe(true)
      expect((del.node as { node_id: string }).node_id).toBe((note.node as { node_id: string }).node_id)

      // 「撤销」→ 恢复
      const undo = await s.call('undo')
      expect(undo.success).toBe(true)
      expect(undo.restored_node_id).toBe((note.node as { node_id: string }).node_id)

      // 「把两个疑问都找出来」→ 既有节点解析后默认 note;显式新增的才是 question(设计行为)
      const questions = await s.call('find_node', { role: 'question' })
      expect(questions.count).toBe(1)
      const byText = await s.call('find_node', { query: '评估指标' })
      expect(byText.count).toBe(1)
    } finally {
      await s.cleanup()
    }
  })

  it('「第二个」指代:同名想法的 occurrence 消歧', async () => {
    const s = await makeScenario(`# 头脑风暴

## 想法

- 用热红外做人员检测
- 用热红外做夜间补光
- 用毫米波做人员检测
`, { fileName: 'brainstorm.md', kernel: { defaultProfile: 'thinking' } })
    try {
      // 「选中第二个『热红外』想法」
      const second = await s.call('select_node', { node: '热红外', occurrence: 2 })
      expect(second.success).toBe(true)
      expect((second.node as { title: string }).title).toBe('用热红外做夜间补光')

      // 「最后一个热红外改成方案」→ occurrence: -1
      const last = await s.call('change_role', { node: '热红外', occurrence: -1, role: 'solution' })
      expect(last.success).toBe(true)
      expect((last.node as { title: string }).title).toBe('用热红外做夜间补光')
      expect(last.to_role).toBe('solution')
    } finally {
      await s.cleanup()
    }
  })

  it('外部修改文件后:重新解析、ID 重新分配,旧 ID 引用如实失败', async () => {
    const s = await makeScenario(THINKING_START, { fileName: 'thinking.md', kernel: { defaultProfile: 'thinking' } })
    try {
      // 会话内选中 node_002 并记住
      const selected = await s.call('select_node', { node: '问题' })
      expect((selected.node as { node_id: string }).node_id).toBe('node_002')

      // 用户在外部编辑器大改文件(结构变化)
      await writeFile(s.filePath, `# 时序信息提取汇报思路

## 问题重述

- 长序列建模不足
- 计算开销大

## 新增方向

- 分层注意力
`, 'utf8')

      // 下一次工具调用:感知外部修改,重解析(sidecar hash 不匹配 → 丢弃 → 重解析)
      const outline = await s.call('get_outline') as unknown as { outline: Array<{ node_id: string, title: string }> }
      const titles = outline.outline.map((row) => row.title)
      expect(titles).toEqual(['时序信息提取汇报思路', '问题重述', '长序列建模不足', '计算开销大', '新增方向', '分层注意力'])
      // ID 重新分配:node_002 现在是「问题重述」
      const node2 = outline.outline.find((row) => row.node_id === 'node_002')
      expect(node2?.title).toBe('问题重述')

      // 旧指代不误指:用旧内容标题定位新结构
      const stale = await s.call('find_node', { query: '评估指标怎么选' })
      expect(stale.count).toBe(0)
    } finally {
      await s.cleanup()
    }
  })
})
