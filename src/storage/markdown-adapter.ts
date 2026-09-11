/**
 * Markdown 适配器:把“当前文件”的 Markdown 文本解析为 IR,再把 IR 序列化回
 * Markdown。这是 V0.1 的文档源格式(需求第 8 章:普通文本 + 简单 Markdown)。
 *
 * 解析规则(V0.1):
 * - ATX 标题(`#`~`######`)→ 结构节点;第一个 H1 作为文档标题(根节点)。
 * - 列表项(`-` `*` `+` `1.` `1)`,按缩进嵌套)→ 列表节点;保留原始 marker,
 *   序列化时原样写回(不重新编号);`- [ ]` / `- [x]` 任务列表记录勾选状态。
 * - 普通文本行 → 归入最近打开节点的内容(Content);围栏代码块(``` / ~~~)
 *   内的行原样归入内容,不参与结构解析。
 * - 空行仅作段落分隔,序列化时不保留(内容行数可能减少,文字不丢失)。
 *
 * 已知限制(记录于 docs/ir.md):Setext 标题(`标题` 下划线 `===`)按普通文本
 * 处理;列表缩进按规范风格输出(2 空格一层);标题层级超过 6 时按 6 输出。
 */
import type { DocNode, StructuredDocument } from '../model/types.ts'

/** 解析选项。 */
export interface ParseOptions {
  /** 场景模板 ID。 */
  profileId: string
  /** 解析时间(写入节点元信息)。 */
  now: Date
  /** 创建来源(写入节点元信息)。 */
  createdBy: string
  /** 文件名(用于文档 ID 与缺省标题)。 */
  fileName?: string
}

/** 解析结果。 */
export interface ParseResult {
  doc: StructuredDocument
}

/** 创建一个带根节点的空文档(根节点固定为 node_001)。 */
export function createEmptyDocument(options: ParseOptions, sourcePath?: string): StructuredDocument {
  const iso = options.now.toISOString()
  const docId = buildDocId(options.fileName)
  return {
    id: docId,
    title: '',
    profile: options.profileId,
    root: {
      id: 'node_001',
      title: '',
      content: '',
      role: 'note',
      properties: {},
      children: [],
      metadata: { created_at: iso, updated_at: iso, created_by: options.createdBy },
    },
    metadata: {
      created_at: iso,
      updated_at: iso,
      created_by: options.createdBy,
      node_seq: 1,
      eol: '\n',
      ...(sourcePath !== undefined ? { source_path: sourcePath } : {}),
    },
    revision: 1,
  }
}

function buildDocId(fileName: string | undefined): string {
  const stem = (fileName ?? 'document').replace(/\.[^.]+$/, '').trim()
  const sanitized = stem.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'document'
  return `sdoc-${sanitized}`
}

/** 判断标题行;返回 (level, title) 或 null。要求 `#` 后是空格或行尾。 */
function matchHeading(line: string): { level: number, title: string } | null {
  const match = /^(#{1,6})(?:\s+(.*?))?\s*$/.exec(line)
  if (match === null) return null
  return { level: match[1].length, title: (match[2] ?? '').trim() }
}

/** 判断列表行;返回 (indent, marker, inline) 或 null。 */
function matchBullet(line: string): { indent: number, marker: string, inline: string } | null {
  const match = /^(\s*)([-*+]|\d+[.)])[ \t]+(.*?)\s*$/.exec(line)
  if (match === null) return null
  return { indent: match[1].replace(/\t/g, '    ').length, marker: match[2], inline: match[3] }
}

/** 解析任务列表前缀 `- [ ] 文本`;返回勾选状态与剩余文本。 */
function matchTask(inline: string): { checked: boolean | undefined, text: string } {
  const match = /^\[([ xX])\]\s+(.*)$/.exec(inline)
  if (match === null) return { checked: undefined, text: inline }
  return { checked: match[1] === 'x' || match[1] === 'X', text: match[2] }
}

/**
 * 解析 Markdown 文本为结构化文档。
 * 节点 ID 按出现顺序(前序)分配:根 node_001,其余 node_002 起。
 */
export function parseMarkdown(text: string, options: ParseOptions, sourcePath?: string): ParseResult {
  const eol: '\n' | '\r\n' = /\r\n/.test(text) ? '\r\n' : '\n'
  const doc = createEmptyDocument(options, sourcePath)
  doc.metadata.eol = eol
  const lines = text.split(/\r?\n/)

  let counter = 1
  const nextId = (): string => {
    counter += 1
    return `node_${String(counter).padStart(3, '0')}`
  }
  const newNode = (title: string, marker?: string, checked?: boolean): DocNode => {
    const iso = options.now.toISOString()
    const node: DocNode = {
      id: nextId(),
      title,
      content: '',
      role: 'note',
      properties: {},
      children: [],
      metadata: { created_at: iso, updated_at: iso, created_by: options.createdBy },
    }
    if (marker !== undefined) node.metadata.listMarker = marker
    if (checked !== undefined) node.metadata.taskChecked = checked
    return node
  }

  // 标题栈:stack[0] 恒为根;打开 H2 后栈长 2,以此类推。
  const headingStack: DocNode[] = [doc.root]
  // 列表栈:当前标题区块内的缩进嵌套。
  let bulletStack: Array<{ indent: number, node: DocNode }> = []
  // 围栏代码块状态:null = 不在代码块内;否则为结束围栏标记(``` 或 ~~~)。
  let fence: string | null = null

  const appendContent = (line: string, ownerIndent: number | null): void => {
    const current = bulletStack.length > 0
      ? bulletStack[bulletStack.length - 1].node
      : headingStack[headingStack.length - 1]
    // 列表节点的内容行按规范去缩进(最多去掉“列表缩进 + 2”),保证
    // parse → serialize 幂等;标题节点的内容行原样保留。
    const cleaned = ownerIndent === null
      ? line
      : line.replace(new RegExp(`^ {1,${ownerIndent + 2}}`), '')
    current.content = current.content === '' ? cleaned : `${current.content}\n${cleaned}`
  }

  for (const rawLine of lines) {
    // 围栏代码块内:一切原样归入当前节点内容。
    if (fence !== null) {
      appendContent(rawLine, null)
      if (rawLine.trimStart().startsWith(fence)) fence = null
      continue
    }
    const fenceMatch = /^\s*(```+|~~~+)/.exec(rawLine)
    if (fenceMatch !== null) {
      fence = fenceMatch[1]
      appendContent(rawLine, null)
      continue
    }

    const heading = matchHeading(rawLine)
    if (heading !== null) {
      bulletStack = []
      const title = heading.title
      // 第一个 H1:作为文档标题(根节点标题);之后的 H1 视作一级子节点;
      // H2~H6 按自身层级挂树(H2 是根的直接子节点)。
      if (heading.level === 1 && doc.title === '') {
        doc.title = title
        doc.root.title = title
        continue
      }
      const effectiveLevel = heading.level === 1 ? 2 : heading.level
      while (headingStack.length >= effectiveLevel) headingStack.pop()
      const parent = headingStack[headingStack.length - 1]
      const node = newNode(title)
      parent.children.push(node)
      headingStack.push(node)
      continue
    }

    const bullet = matchBullet(rawLine)
    if (bullet !== null) {
      const task = matchTask(bullet.inline)
      const node = newNode(task.text, bullet.marker, task.checked)
      while (bulletStack.length > 0 && bulletStack[bulletStack.length - 1].indent >= bullet.indent) {
        bulletStack.pop()
      }
      const parent = bulletStack.length > 0
        ? bulletStack[bulletStack.length - 1].node
        : headingStack[headingStack.length - 1]
      parent.children.push(node)
      bulletStack.push({ indent: bullet.indent, node })
      continue
    }

    if (rawLine.trim() === '') continue
    appendContent(rawLine, bulletStack.length > 0 ? bulletStack[bulletStack.length - 1].indent : null)
  }

  doc.title = doc.root.title
  // 把解析期间使用的 ID 计数器写回文档,保证后续分配不与解析出的 ID 冲突。
  doc.metadata.node_seq = counter
  return { doc }
}

// ─── 序列化 ───────────────────────────────────────────────────────────────

/** 把结构化文档序列化为 Markdown 文本(EOL 风格与解析时一致)。 */
export function serializeMarkdown(doc: StructuredDocument): string {
  const eol = doc.metadata.eol ?? '\n'
  const lines: string[] = []

  if (doc.root.title !== '') lines.push(`# ${doc.root.title}`)
  pushContentLines(lines, doc.root.content, '')
  // 根节点是文档标题(H1),它的子节点从 H2 开始。
  emitChildren(doc.root, lines, { kind: 'heading', depth: 2 })

  if (lines.length === 0) return ''
  return lines.join(eol) + eol
}

type ChildMode = { kind: 'heading', depth: number } | { kind: 'bullet', indent: number }

function emitChildren(node: DocNode, lines: string[], mode: ChildMode): void {
  for (const child of node.children) {
    if (typeof child.metadata.listMarker === 'string') {
      emitBullet(child, lines, mode.kind === 'bullet' ? mode.indent + 2 : 0)
    } else {
      const depth = mode.kind === 'heading' ? mode.depth : headingDepthForIndent(mode.indent)
      emitHeading(child, lines, depth)
    }
  }
}

/** 嵌套在列表下方的标题按缩进反推层级(每 2 空格一层,从 H2 起)。 */
function headingDepthForIndent(indent: number): number {
  return Math.min(6, 2 + Math.max(0, Math.floor(indent / 2)))
}

function emitHeading(node: DocNode, lines: string[], depth: number): void {
  const hashes = '#'.repeat(Math.min(6, Math.max(1, depth)))
  lines.push(node.title === '' ? hashes : `${hashes} ${node.title}`)
  pushContentLines(lines, node.content, '')
  emitChildren(node, lines, { kind: 'heading', depth: depth + 1 })
}

function emitBullet(node: DocNode, lines: string[], indent: number): void {
  const marker = typeof node.metadata.listMarker === 'string' ? node.metadata.listMarker : '-'
  const pad = ' '.repeat(indent)
  let inline = node.title
  if (node.metadata.taskChecked !== undefined) {
    inline = `[${node.metadata.taskChecked ? 'x' : ' '}] ${node.title}`.trimEnd()
  }
  lines.push(inline === '' ? `${pad}${marker}` : `${pad}${marker} ${inline}`)
  const continuationIndent = indent + marker.length + 1
  pushContentLines(lines, node.content, ' '.repeat(continuationIndent))
  emitChildren(node, lines, { kind: 'bullet', indent })
}

function pushContentLines(lines: string[], content: string, indent: string): void {
  if (content === '') return
  for (const line of content.split('\n')) {
    lines.push(line === '' ? '' : indent + line)
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────

/** 从文档中摘取一个子树的文本概要(调试用)。 */
export function summarizeNode(node: DocNode): string {
  const title = node.title === '' ? '(无标题)' : node.title
  return `${node.id} [${node.role}] ${title}`
}
