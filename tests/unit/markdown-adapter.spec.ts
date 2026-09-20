import { describe, expect, it } from 'vitest'
import { parseMarkdown, serializeMarkdown } from '../../src/storage/markdown-adapter.ts'

const NOW = new Date('2026-01-15T10:00:00Z')

function parse(text: string) {
  return parseMarkdown(text, { profileId: 'meeting', now: NOW, createdBy: 'test', fileName: 'weekly-meeting.md' }).doc
}

describe('Markdown 适配器:解析', () => {
  it('解析标题层级与列表', () => {
    const doc = parse([
      '# 防干烧项目周会',
      '',
      '## 当前算法问题',
      '- 砂锅误报较多',
      '- 灶具差异可能有影响',
      '',
      '## 第二技术路线',
      '- 热红外方案正在验证',
    ].join('\n'))
    expect(doc.title).toBe('防干烧项目周会')
    expect(doc.root.id).toBe('node_001')
    expect(doc.root.children).toHaveLength(2)
    const topics = doc.root.children
    expect(topics[0].title).toBe('当前算法问题')
    expect(topics[0].children.map((child) => child.title)).toEqual(['砂锅误报较多', '灶具差异可能有影响'])
    expect(topics[0].children[0].metadata.listMarker).toBe('-')
  })

  it('H3 挂在 H2 之下', () => {
    const doc = parse([
      '# 文档',
      '## 一',
      '### 一点一',
      '## 二',
    ].join('\n'))
    expect(doc.root.children.map((child) => child.title)).toEqual(['一', '二'])
    expect(doc.root.children[0].children[0].title).toBe('一点一')
  })

  it('列表缩进嵌套', () => {
    const doc = parse([
      '# 根',
      '- A',
      '  - A1',
      '  - A2',
      '- B',
    ].join('\n'))
    const [a, b] = doc.root.children
    expect(a.title).toBe('A')
    expect(a.children.map((child) => child.title)).toEqual(['A1', 'A2'])
    expect(b.title).toBe('B')
  })

  it('标题后的普通文本进入标题节点的内容', () => {
    const doc = parse([
      '# 会议',
      '## 议题',
      '这是议题的说明文字。',
      '第二行说明。',
    ].join('\n'))
    const topic = doc.root.children[0]
    expect(topic.content).toBe('这是议题的说明文字。\n第二行说明。')
  })

  it('围栏代码块内的内容不参与结构解析', () => {
    const doc = parse([
      '# 文档',
      '## 部分',
      '```',
      '# 不是标题',
      '- 不是列表',
      '```',
    ].join('\n'))
    const section = doc.root.children[0]
    expect(doc.root.children).toHaveLength(1)
    expect(section.content).toContain('# 不是标题')
    expect(section.content).toContain('- 不是列表')
  })

  it('任务列表记录勾选状态', () => {
    const doc = parse([
      '# 待办',
      '- [ ] 未完成事项',
      '- [x] 已完成事项',
    ].join('\n'))
    expect(doc.root.children[0].metadata.taskChecked).toBe(false)
    expect(doc.root.children[1].metadata.taskChecked).toBe(true)
  })

  it('CRLF 文件保持换行风格', () => {
    const doc = parse('# 标题\r\n## 部分\r\n- 项目\r\n')
    expect(doc.metadata.eol).toBe('\r\n')
  })

  it('无标题文件:根节点标题为空,正文进入根内容', () => {
    const doc = parse('只有一段文字。\n')
    expect(doc.title).toBe('')
    expect(doc.root.content).toBe('只有一段文字。')
  })
})

describe('Markdown 适配器:序列化与往返', () => {
  it('parse → serialize → parse 保持结构一致(幂等)', () => {
    const original = [
      '# 防干烧项目周会',
      '',
      '## 当前算法问题',
      '- 砂锅误报较多',
      '  延伸说明',
      '- 灶具差异可能有影响',
      '',
      '## 第二技术路线',
      '### 热红外方案',
      '正在验证',
    ].join('\n') + '\n'
    const first = parse(original)
    const once = serializeMarkdown(first)
    const second = parse(once)
    const twice = serializeMarkdown(second)
    expect(twice).toBe(once)
    expect(second.root.children[0].children[0].content).toBe('延伸说明')
    expect(second.root.children[1].children[0].title).toBe('热红外方案')
  })

  it('有序列表编号原样保留(不重新编号)', () => {
    const doc = parse('# 待办\n3. 第三项\n1. 第一项\n')
    const text = serializeMarkdown(doc)
    expect(text).toContain('3. 第三项')
    expect(text).toContain('1. 第一项')
  })

  it('任务列表勾选状态写回', () => {
    const doc = parse('# 待办\n- [x] 已完成\n- [ ] 未完成\n')
    const text = serializeMarkdown(doc)
    expect(text).toContain('- [x] 已完成')
    expect(text).toContain('- [ ] 未完成')
  })

  it('序列化使用解析时的 EOL 风格', () => {
    const doc = parse('# 标题\r\n- 项目\r\n')
    const text = serializeMarkdown(doc)
    expect(text).toContain('\r\n')
    expect(text).not.toMatch(/[^\r]\n/)
  })

  it('修改后序列化:新节点为列表节点(默认 marker)', () => {
    const doc = parse('# 会议\n## 议题\n- 原有\n')
    const newNode = {
      id: 'node_099', title: '新增项', content: '', role: 'note',
      properties: {}, children: [],
      metadata: { created_at: NOW.toISOString(), updated_at: NOW.toISOString(), created_by: 'test', listMarker: '-' },
    }
    doc.root.children[0].children.push(newNode)
    const text = serializeMarkdown(doc)
    expect(text).toContain('- 新增项')
  })

  it('待办的角色和属性写入可见表格并可往返解析', () => {
    const doc = parse('# 周会\n## 登录体验\n')
    const node = doc.root.children[0]
    node.role = 'action_item'
    node.properties = { owner: '张三', status: '进行中', due_date: '周五' }
    const text = serializeMarkdown(doc)
    expect(text).toContain('dsh_profile: meeting')
    expect(text).toContain('<!-- dsh:node-properties -->')
    expect(text).toContain('| 类型 | 负责人 | 状态 | 截止日期 |')
    expect(text).toContain('| 待办 | 张三 | 进行中 | 周五 |')
    const reparsed = parseMarkdown(text, { profileId: 'thinking', now: NOW, createdBy: 'test' }).doc
    expect(reparsed.profile).toBe('meeting')
    expect(reparsed.root.children[0].role).toBe('action_item')
    expect(reparsed.root.children[0].properties).toEqual({ owner: '张三', status: '进行中', due_date: '周五' })
  })

  it('项目任务的进度以百分比显示并解析为整数', () => {
    const doc = parseMarkdown('# 项目\n## 联调\n', { profileId: 'project', now: NOW, createdBy: 'test' }).doc
    const node = doc.root.children[0]
    node.role = 'task'
    node.properties = { owner: '李四', progress: 30 }
    const text = serializeMarkdown(doc)
    expect(text).toContain('| 任务 | 李四 | 30% |')
    const reparsed = parseMarkdown(text, { profileId: 'meeting', now: NOW, createdBy: 'test' }).doc
    expect(reparsed.profile).toBe('project')
    expect(reparsed.root.children[0].properties.progress).toBe(30)
  })

  it('project 新属性列(start_date/actual_date/level)往返无损', () => {
    const doc = parseMarkdown('# 项目\n## 里程碑\n## 风险\n', { profileId: 'project', now: NOW, createdBy: 'test' }).doc
    const [ms, risk] = doc.root.children
    ms.role = 'milestone'
    ms.properties = { owner: '张丽君', status: '已完成', due_date: '2026-09-30', actual_date: '2026-10-02' }
    risk.role = 'risk'
    risk.properties = { owner: '陈铭泽', status: '有风险', due_date: '待确认', level: '高' }
    const text = serializeMarkdown(doc)
    expect(text).toContain('| 类型 | 负责人 | 状态 | 截止日期 | 实际完成 |')
    expect(text).toContain('| 里程碑 | 张丽君 | 已完成 | 2026-09-30 | 2026-10-02 |')
    expect(text).toContain('| 类型 | 负责人 | 状态 | 截止日期 | 等级 |')
    expect(text).toContain('| 风险 | 陈铭泽 | 有风险 | 待确认 | 高 |')
    const reparsed = parseMarkdown(text, { profileId: 'project', now: NOW, createdBy: 'test' }).doc
    expect(reparsed.root.children[0].properties).toEqual({ owner: '张丽君', status: '已完成', due_date: '2026-09-30', actual_date: '2026-10-02' })
    expect(reparsed.root.children[1].properties).toEqual({ owner: '陈铭泽', status: '有风险', due_date: '待确认', level: '高' })
  })

  it('旧列集文档(无新列)仍可正常解析', () => {
    const legacy = [
      '# 项目',
      '## 联调',
      '  <!-- dsh:node-properties -->',
      '  | 类型 | 负责人 | 状态 | 截止日期 |',
      '  |---|---|---|---|',
      '  | 任务 | 李四 | 进行中 | 周五 |',
      '',
    ].join('\n')
    const doc = parseMarkdown(legacy, { profileId: 'project', now: NOW, createdBy: 'test' }).doc
    expect(doc.root.children[0].role).toBe('task')
    expect(doc.root.children[0].properties).toEqual({ owner: '李四', status: '进行中', due_date: '周五' })
    const text = serializeMarkdown(doc)
    expect(text).toContain('| 任务 | 李四 | 进行中 | 周五 |')
  })

  it('列集之外的属性键序列化时抛 VALIDATION_FAILED(防静默丢数据)', () => {
    const doc = parseMarkdown('# 项目\n## 联调\n', { profileId: 'project', now: NOW, createdBy: 'test' }).doc
    const node = doc.root.children[0]
    node.role = 'task'
    node.properties = { owner: '李四', priority: '高' } as unknown as Record<string, import('../../src/model/types.ts').PropertyValue>
    expect(() => serializeMarkdown(doc)).toThrowError(/priority 无法序列化到 Markdown 属性表/)
  })

  it('普通 Markdown 表格保持正文而不被识别成属性表', () => {
    const original = '# 文档\n## 数据\n| 类型 | 状态 |\n|---|---|\n| 普通数据 | 正常 |\n'
    const doc = parse(original)
    expect(doc.root.children[0].role).toBe('note')
    expect(doc.root.children[0].content).toContain('| 类型 | 状态 |')
  })

  it('属性值中的管道符可见且往返不丢失', () => {
    const doc = parse('# 周会\n## 待办\n')
    const node = doc.root.children[0]
    node.role = 'action_item'
    node.properties = { owner: '张三|李四', status: '未开始' }
    const text = serializeMarkdown(doc)
    expect(text).toContain('张三\\|李四')
    const reparsed = parse(text)
    expect(reparsed.root.children[0].properties.owner).toBe('张三|李四')
  })

  it('保留用户已有 Front Matter 字段并补充 Profile', () => {
    const doc = parse('---\nauthor: Irving\ntags: [meeting]\n---\n# 周会\n')
    const text = serializeMarkdown(doc)
    expect(text).toContain('author: Irving')
    expect(text).toContain('tags: [meeting]')
    expect(text).toContain('dsh_profile: meeting')
  })
})
