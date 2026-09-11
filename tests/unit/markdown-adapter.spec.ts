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
})
