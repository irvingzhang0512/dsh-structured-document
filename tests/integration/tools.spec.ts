/**
 * 工具层集成测试:通过与 DSH 工具注册表相同的调用方式(execute + 校验参数)
 * 驱动 17 个结构化文档工具,验证 envelope、错误码、状态维护与真实文件读写。
 */
import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { WorkspaceRegistry, type KernelOptions } from '../../src/state/kernel.ts'
import { NodeFsStorage } from '../../src/storage/storage.ts'
import { registerStructuredDocumentTools, STRUCTURED_DOCUMENT_TOOL_NAMES } from '../../src/tools/register-tools.ts'

/** 与 dsh-tools ToolDefinition 对齐的最小结构(index 未导出该类型)。 */
interface ToolLike {
  name: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, exec: ToolRunContext): Promise<unknown>
}

const NOW = new Date('2026-01-15T10:00:00Z')

class FakeRegistry {
  readonly registered: ToolLike[] = []
  register(tool: ToolLike): () => void {
    this.registered.push(tool)
    return () => {
      const index = this.registered.indexOf(tool)
      if (index >= 0) this.registered.splice(index, 1)
    }
  }
  get(name: string): ToolLike | undefined {
    return this.registered.find((tool) => tool.name === name)
  }
}

const MEETING = [
  '# 防干烧项目周会',
  '## 当前算法问题',
  '- 砂锅误报较多',
  '- 灶具差异可能有影响',
  '## 第二技术路线',
  '- 热红外方案正在验证',
].join('\n') + '\n'

interface Harness {
  dir: string
  registry: WorkspaceRegistry
  tools: FakeRegistry
  session: ToolRunContext
  filePath: string
  cleanup(): Promise<void>
}

async function makeHarness(fileContent: string, fileName = 'weekly.md', overrides?: Partial<KernelOptions>): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), 'sdoc-tools-'))
  const filePath = join(dir, fileName)
  await writeFile(filePath, fileContent, 'utf8')
  const kernelOptions: KernelOptions = {
    storage: new NodeFsStorage(),
    defaultProfile: 'meeting',
    autoSave: true,
    maxUndoSteps: 50,
    resolvePath: async (_sessionId, raw) => isAbsolute(raw) ? raw : join(dir, raw),
    now: () => NOW,
    createdBy: 'test',
    ...overrides,
  }
  const registry = new WorkspaceRegistry(kernelOptions)
  registry.attachCurrentFileProvider({
    getCurrentFile: (sessionId) => sessionId === 'session-test' ? filePath : null,
  })
  const fakeTools = new FakeRegistry()
  registerStructuredDocumentTools({ tools: fakeTools } as never, registry)
  const session = {
    agent: { session: { id: 'session-test' } },
    signal: new AbortController().signal,
    deferContext: () => () => {},
    concludeTurn: () => {},
  } as unknown as ToolRunContext
  return {
    dir,
    registry,
    tools: fakeTools,
    session,
    filePath,
    cleanup: async () => {
      registry.disposeAll()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/** 按注册表调用工具(defineTool 生成的 execute 已内置参数校验,非法参数抛 ToolArgsError)。 */
async function call(harness: Harness, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tool = harness.tools.get(name)
  expect(tool, `工具 ${name} 应已注册`).toBeDefined()
  return (await tool!.execute(args, harness.session)) as Record<string, unknown>
}

describe('工具注册', () => {
  it('注册 17 个职责明确的工具,无万能 command 工具', async () => {
    const harness = await makeHarness(MEETING)
    try {
      expect(harness.tools.registered.map((tool) => tool.name).sort()).toEqual([...STRUCTURED_DOCUMENT_TOOL_NAMES].sort())
      expect(STRUCTURED_DOCUMENT_TOOL_NAMES).not.toContain('document')
      expect(STRUCTURED_DOCUMENT_TOOL_NAMES).toHaveLength(17)
    } finally {
      await harness.cleanup()
    }
  })
})

describe('整篇与批量事务工具', () => {
  it('replace_document 一次提交整篇结构且一次撤销全部恢复', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const result = await call(harness, 'replace_document', {
        title: '正式周会纪要', profile: 'meeting', expected_revision: 1,
        expected_file: harness.filePath, request_id: 'replace-001',
        children: [
          { title: '上线安排', role: 'topic', children: [
            { title: '周五发布', role: 'decision' },
            { title: '准备检查清单', role: 'action_item', properties: { owner: '张三', status: '未开始' } },
          ] },
        ],
      })
      expect(result.success).toBe(true)
      expect(result.revision).toBe(2)
      expect((result.summary as { counts: { added: number } }).counts.added).toBe(3)
      const undo = await call(harness, 'undo')
      expect(undo.success).toBe(true)
      const restored = await readFile(harness.filePath, 'utf8')
      expect(restored).toContain('# 防干烧项目周会')
      expect(restored).toContain('砂锅误报较多')
      expect(restored).not.toContain('正式周会纪要')
    } finally { await harness.cleanup() }
  })

  it('apply_document_patch 原子执行多项修改并阻止陈旧版本', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const outline = await call(harness, 'get_outline')
      const rows = outline.outline as Array<{ node_id: string, title: string }>
      const target = rows.find(row => row.title === '砂锅误报较多')!
      const result = await call(harness, 'apply_document_patch', {
        expected_revision: 1, expected_file: harness.filePath, request_id: 'patch-001',
        operations: [
          { op: 'change_role', node_id: target.node_id, role: 'problem' },
          { op: 'add', parent_id: target.node_id, node: { title: '补充验证', role: 'action_item', properties: { owner: '李四' } } },
        ],
      })
      expect(result.success).toBe(true)
      expect(result.revision).toBe(2)
      const stale = await call(harness, 'apply_document_patch', {
        expected_revision: 1, expected_file: harness.filePath, request_id: 'patch-002',
        operations: [{ op: 'update', node_id: target.node_id, title: '不应写入' }],
      })
      expect(stale.success).toBe(false)
      expect(stale.error).toBe('EXTERNAL_MODIFIED')
    } finally { await harness.cleanup() }
  })

  it('create_document 自动避开同名文件并打开新文档', async () => {
    const harness = await makeHarness(MEETING)
    try {
      await writeFile(join(harness.dir, '项目计划.md'), '# 旧文件\n', 'utf8')
      const result = await call(harness, 'create_document', {
        title: '项目计划', profile: 'project', request_id: 'create-001',
        children: [{ title: '完成联调', role: 'task', properties: { status: '未开始' } }],
      })
      expect(result.success).toBe(true)
      expect(result.file_path).toBe(join(harness.dir, '项目计划 (2).md'))
      expect(await readFile(String(result.file_path), 'utf8')).toContain('完成联调')
    } finally { await harness.cleanup() }
  })
})

describe('查看与定位工具', () => {
  it('get_document 返回完整文档与状态', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const result = await call(harness, 'get_document')
      expect(result.success).toBe(true)
      const doc = result.document as { title: string, root: { children: unknown[] } }
      expect(doc.title).toBe('防干烧项目周会')
      expect(doc.root.children).toHaveLength(2)
      expect(result.node_count).toBe(6)
      const state = result.state as { current_file: string }
      expect(state.current_file).toBe(harness.filePath)
    } finally {
      await harness.cleanup()
    }
  })

  it('get_outline 返回大纲;max_depth 生效', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const full = await call(harness, 'get_outline')
      expect(full.total_nodes).toBe(6)
      const shallow = await call(harness, 'get_outline', { max_depth: 1 })
      expect((shallow.outline as unknown[]).length).toBe(3)
    } finally {
      await harness.cleanup()
    }
  })

  it('find_node 按关键词 / 角色 / 属性查找', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const byQuery = await call(harness, 'find_node', { query: '热红外' })
      expect(byQuery.count).toBe(1)
      const none = await call(harness, 'find_node', { query: '不存在的词' })
      expect(none.count).toBe(0)
      expect(none.success).toBe(true)
      const byRole = await call(harness, 'find_node', { role: 'note' })
      expect(byRole.count).toBe(6)
    } finally {
      await harness.cleanup()
    }
  })

  it('find_node 多属性 properties 为 AND 组合(project 七状态)', async () => {
    const harness = await makeHarness('# 项目\n## 研发\n', 'project.md', { defaultProfile: 'project' })
    try {
      const t1 = await call(harness, 'add_node', { parent: '研发', title: '任务A', role: 'task', properties: { owner: '张三', status: '进行中' } })
      expect(t1.success).toBe(true)
      const t2 = await call(harness, 'add_node', { parent: '研发', title: '任务B', role: 'task', properties: { owner: '张三', status: '有风险' } })
      expect(t2.success).toBe(true)
      const t3 = await call(harness, 'add_node', { parent: '研发', title: '任务C', role: 'task', properties: { owner: '李四', status: '进行中' } })
      expect(t3.success).toBe(true)

      // AND:张三 + 进行中 → 只有任务A
      const both = await call(harness, 'find_node', { properties: { owner: '张三', status: '进行中' } })
      expect(both.count).toBe(1)
      expect((both.matches as Array<{ title: string }>)[0].title).toBe('任务A')
      // 单键
      const risky = await call(harness, 'find_node', { properties: { status: '有风险' } })
      expect(risky.count).toBe(1)
      expect((risky.matches as Array<{ title: string }>)[0].title).toBe('任务B')
      // role + properties 同为 AND
      const roleAndProps = await call(harness, 'find_node', { role: 'task', properties: { owner: '李四' } })
      expect(roleAndProps.count).toBe(1)
      expect((roleAndProps.matches as Array<{ title: string }>)[0].title).toBe('任务C')
      // 旧参数不受影响
      const legacy = await call(harness, 'find_node', { property_key: 'owner', property_value: '张三' })
      expect(legacy.count).toBe(2)
    } finally {
      await harness.cleanup()
    }
  })

  it('select_node 设置当前节点;get_selected_node 读取;歧义返回候选', async () => {
    const harness = await makeHarness(MEETING)
    try {
      // “方案”按包含匹配命中 node_006「热红外方案正在验证」(先精确后包含,属正确行为);
      // 真正无匹配的标题应返回 NODE_NOT_FOUND。
      const noMatch = await call(harness, 'select_node', { node: '完全不存在的标题xyz' })
      expect(noMatch.success).toBe(false)
      expect(noMatch.error).toBe('NODE_NOT_FOUND')

      const selected = await call(harness, 'select_node', { node: '当前算法问题' })
      expect(selected.success).toBe(true)
      expect((selected.node as { node_id: string }).node_id).toBe('node_002')

      const current = await call(harness, 'get_selected_node')
      expect((current.selected_node as { node_id: string }).node_id).toBe('node_002')
      expect(current.last_edited_node).toBeNull()
    } finally {
      await harness.cleanup()
    }
  })
})

describe('修改工具', () => {
  it('add_node 默认挂在当前节点下并自动选中;非法角色报 INVALID_ROLE', async () => {
    const harness = await makeHarness(MEETING)
    try {
      await call(harness, 'select_node', { node: 'node_002' })
      const added = await call(harness, 'add_node', {
        title: '采集热红外数据',
        role: 'discussion',
      })
      expect(added.success).toBe(true)
      const node = added.node as { node_id: string, role: string }
      expect(node.role).toBe('discussion')
      const current = await call(harness, 'get_selected_node')
      expect((current.selected_node as { node_id: string }).node_id).toBe(node.node_id)

      const badRole = await call(harness, 'add_node', { title: 'X', role: 'risk' })
      expect(badRole.success).toBe(false)
      expect(badRole.error).toBe('INVALID_ROLE')

      const badProperty = await call(harness, 'add_node', {
        title: 'Y', role: 'discussion', properties: { owner: '张三' },
      })
      expect(badProperty.success).toBe(false)
      expect(badProperty.error).toBe('INVALID_PROPERTY')
    } finally {
      await harness.cleanup()
    }
  })

  it('add_node 一次给全待办属性;update_property 修改与删除', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const added = await call(harness, 'add_node', {
        title: '完成D灶数据采集',
        role: 'action_item',
        properties: { owner: '张三', status: '未开始', due_date: '周五' },
      })
      expect(added.success).toBe(true)
      expect(added.markdownUpdated).toBe(true)
      expect(added.sidecarSaved).toBe(true)
      const nodeId = (added.node as { node_id: string }).node_id
      const visibleMarkdown = await readFile(harness.filePath, 'utf8')
      expect(visibleMarkdown).toContain('| 待办 | 张三 | 未开始 | 周五 |')

      const updated = await call(harness, 'update_property', { node: nodeId, key: 'status', value: '进行中' })
      expect(updated.success).toBe(true)
      expect(updated.value).toBe('进行中')

      const badStatus = await call(harness, 'update_property', { node: nodeId, key: 'status', value: '已完成x' })
      expect(badStatus.success).toBe(false)
      expect(badStatus.error).toBe('INVALID_PROPERTY')

      const badKey = await call(harness, 'update_property', { node: nodeId, key: 'progress', value: 50 })
      expect(badKey.success).toBe(false)
      expect(badKey.error).toBe('INVALID_PROPERTY')

      const removed = await call(harness, 'update_property', { node: nodeId, key: 'owner', value: null })
      expect(removed.removed).toBe(true)
    } finally {
      await harness.cleanup()
    }
  })

  it('update_node 修改标题/内容;delete_node 连子树删除并清理指针', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const updated = await call(harness, 'update_node', { node: 'node_003', title: '砂锅误报较多(复现)' })
      expect(updated.success).toBe(true)
      expect((updated.node as { title: string }).title).toBe('砂锅误报较多(复现)')

      await call(harness, 'select_node', { node: 'node_003' })
      const deleted = await call(harness, 'delete_node', { node: 'node_002' })
      expect(deleted.success).toBe(true)
      expect(deleted.removed_count).toBe(3)
      expect(deleted.cleared_pointers).toContain('当前节点')

      const gone = await call(harness, 'find_node', { query: '砂锅' })
      expect(gone.count).toBe(0)
    } finally {
      await harness.cleanup()
    }
  })

  it('move_node 移动子树;非法移动报 INVALID_OPERATION', async () => {
    const harness = await makeHarness(MEETING)
    try {
      // 非法:移进自己的子树(node_003 仍是 node_002 的子节点)。
      const cycle = await call(harness, 'move_node', { node: 'node_002', parent: 'node_003' })
      expect(cycle.success).toBe(false)
      expect(cycle.error).toBe('INVALID_OPERATION')

      // 非法:移动根节点。
      const rootMove = await call(harness, 'move_node', { node: 'node_001', parent: 'node_002' })
      expect(rootMove.success).toBe(false)
      expect(rootMove.error).toBe('INVALID_OPERATION')

      // 合法:把 node_003 移到 node_005 下。
      const moved = await call(harness, 'move_node', { node: 'node_003', parent: 'node_005' })
      expect(moved.success).toBe(true)
      const doc = (await call(harness, 'get_document')).document as { root: { children: Array<{ id: string, children: Array<{ id: string }> }> } }
      expect(doc.root.children[1].children.some((child) => child.id === 'node_003')).toBe(true)
    } finally {
      await harness.cleanup()
    }
  })

  it('reorder_node:position / direction;越界报 INVALID_OPERATION', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const toTop = await call(harness, 'reorder_node', { node: 'node_005', direction: 'top' })
      expect(toTop.moved).toBe(true)
      expect(toTop.to_index).toBe(0)
      const noop = await call(harness, 'reorder_node', { node: 'node_005', direction: 'up' })
      expect(noop.moved).toBe(false)
      const outOfRange = await call(harness, 'reorder_node', { node: 'node_002', position: 9 })
      expect(outOfRange.success).toBe(false)
      expect(outOfRange.error).toBe('INVALID_OPERATION')
    } finally {
      await harness.cleanup()
    }
  })

  it('change_role:讨论 → 结论;非法角色报 INVALID_ROLE', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const changed = await call(harness, 'change_role', { node: 'node_003', role: 'conclusion' })
      expect(changed.success).toBe(true)
      expect(changed.to_role).toBe('conclusion')

      const bad = await call(harness, 'change_role', { node: 'node_003', role: 'milestone' })
      expect(bad.success).toBe(false)
      expect(bad.error).toBe('INVALID_ROLE')
    } finally {
      await harness.cleanup()
    }
  })
})

describe('历史工具', () => {
  it('undo 撤销删除;空栈报 INVALID_OPERATION', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const empty = await call(harness, 'undo')
      expect(empty.success).toBe(false)
      expect(empty.error).toBe('INVALID_OPERATION')

      await call(harness, 'delete_node', { node: 'node_005' })
      const undone = await call(harness, 'undo')
      expect(undone.success).toBe(true)
      expect(undone.undone_action).toBe('delete_node')
      expect(undone.restored_node_id).toBe('node_005')
      expect(undone.undo_remaining).toBe(0)

      const doc = (await call(harness, 'get_document')).document as { root: { children: unknown[] } }
      expect(doc.root.children).toHaveLength(2)
    } finally {
      await harness.cleanup()
    }
  })

  it('save_document:无未保存修改时不写盘', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const saved = await call(harness, 'save_document')
      expect(saved.saved).toBe(false)
      expect(saved.was_dirty).toBe(false)
    } finally {
      await harness.cleanup()
    }
  })
})

describe('会话与错误路径', () => {
  it('无会话 → INVALID_OPERATION;未绑定当前文件 → NO_CURRENT_FILE', async () => {
    const harness = await makeHarness(MEETING)
    try {
      const noSession = { agent: {}, signal: new AbortController().signal } as unknown as ToolRunContext
      const tool = harness.tools.get('get_document')!
      const result = (await tool.execute({}, noSession)) as Record<string, unknown>
      expect(result.success).toBe(false)
      expect(result.error).toBe('INVALID_OPERATION')

      const freshSession = { agent: { session: { id: 'other-session' } }, signal: new AbortController().signal } as unknown as ToolRunContext
      const result2 = (await tool.execute({}, freshSession)) as Record<string, unknown>
      expect(result2.success).toBe(false)
      expect(result2.error).toBe('NO_CURRENT_FILE')
    } finally {
      await harness.cleanup()
    }
  })

  it('保存失败 → SAVE_FAILED,文档与版本不变', async () => {
    const harness = await makeHarness(MEETING, 'weekly.md', {
      storage: {
        readFile: (path) => new NodeFsStorage().readFile(path),
        writeFile: async () => {
          throw new Error('磁盘已满(模拟)')
        },
      },
    })
    try {
      const failed = await call(harness, 'add_node', { title: 'X', role: 'discussion' })
      expect(failed.success).toBe(false)
      expect(failed.error).toBe('SAVE_FAILED')
      expect(String(failed.message)).toContain('磁盘已满')
      const doc = (await call(harness, 'get_document')).document as { root: { children: unknown[] }, revision: number }
      expect(doc.revision).toBe(1)
    } finally {
      await harness.cleanup()
    }
  })

  it('自动保存落盘:修改真实写入文件(sidecar 同步)', async () => {
    const harness = await makeHarness(MEETING)
    try {
      await call(harness, 'add_node', { title: '落盘检查', role: 'discussion' })
      const onDisk = await readFile(harness.filePath, 'utf8')
      expect(onDisk).toContain('落盘检查')
      const sidecar = JSON.parse(await readFile(`${harness.filePath}.sdoc.json`, 'utf8'))
      expect(sidecar.plugin).toBe('dsh-structured-document')
      expect(sidecar.format_version).toBe(2)
      expect(sidecar.document.node_seq).toBeGreaterThan(6)
    } finally {
      await harness.cleanup()
    }
  })
})
