import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { SessionWorkspace, WorkspaceRegistry, type KernelOptions } from '../../src/state/kernel.ts'
import { hashText, NodeFsStorage } from '../../src/storage/storage.ts'
import { DocumentOperationError } from '../../src/model/errors.ts'

const NOW = new Date('2026-01-15T10:00:00Z')

async function makeOptions(overrides?: Partial<KernelOptions>): Promise<{ options: KernelOptions, dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sdoc-kernel-'))
  return {
    dir,
    options: {
      storage: new NodeFsStorage(),
      defaultProfile: 'meeting',
      autoSave: true,
      maxUndoSteps: 50,
      resolvePath: async (_sessionId, raw) => isAbsolute(raw) ? raw : join(dir, raw),
      now: () => NOW,
      createdBy: 'test',
      ...overrides,
    },
  }
}

async function writeFixture(dir: string, name: string, content: string): Promise<string> {
  const filePath = join(dir, name)
  await writeFile(filePath, content, 'utf8')
  return filePath
}

const MEETING_FIXTURE = [
  '# 防干烧项目周会',
  '## 当前算法问题',
  '- 砂锅误报较多',
  '- 灶具差异可能有影响',
  '## 第二技术路线',
  '- 热红外方案正在验证',
].join('\n') + '\n'

describe('内核:当前文件绑定', () => {
  it('首次装载:解析 Markdown,分配 ID', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    const result = await workspace.bindFile('weekly.md')
    expect(result.source).toBe('fresh')
    expect(result.title).toBe('防干烧项目周会')
    expect(result.nodeCount).toBe(6)
    expect(workspace.getDocument().doc.root.children[0].title).toBe('当前算法问题')
    await rm(dir, { recursive: true, force: true })
  })

  it('保存后重载:通过 sidecar 采纳,节点 ID 稳定', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const first = new SessionWorkspace('s1', options)
    await first.bindFile('weekly.md')
    await first.addNode({ parentId: 'node_001', title: '新议题', role: 'topic' })
    const createdId = first.state.lastCreatedNodeId

    const second = new SessionWorkspace('s2', options)
    const result = await second.bindFile('weekly.md')
    expect(result.source).toBe('sidecar')
    expect(second.state.lastCreatedNodeId).toBe(createdId)
    expect(second.getDocument().doc.root.children.find((child) => child.id === createdId)?.title).toBe('新议题')
    await rm(dir, { recursive: true, force: true })
  })

  it('删除 sidecar 后仅凭 Markdown 恢复 Profile、角色和业务属性', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const first = new SessionWorkspace('s1', options)
    await first.bindFile('weekly.md')
    await first.addNode({
      parentId: 'node_002', title: '排查登录超时', role: 'action_item',
      properties: { owner: '张三', status: '进行中', due_date: '周五' },
    })
    await unlink(join(dir, 'weekly.md.sdoc.json'))

    const second = new SessionWorkspace('s2', { ...options, defaultProfile: 'thinking' })
    const result = await second.bindFile('weekly.md')
    const restored = second.getDocument().doc.root.children[0].children.find(node => node.title === '排查登录超时')
    expect(result.source).toBe('fresh')
    expect(result.profileId).toBe('meeting')
    expect(restored?.role).toBe('action_item')
    expect(restored?.properties).toEqual({ owner: '张三', status: '进行中', due_date: '周五' })
    await rm(dir, { recursive: true, force: true })
  })

  it('v1 sidecar 打开时不改 Markdown，首次业务修改迁移为 Markdown + v2', async () => {
    const { options, dir } = await makeOptions()
    const filePath = await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const seed = new SessionWorkspace('seed', options)
    await seed.bindFile('weekly.md')
    const legacyDoc = seed.getDocument().doc
    const target = legacyDoc.root.children[0]
    target.role = 'action_item'
    target.properties = { owner: '张三', status: '未开始', due_date: '周五' }
    await writeFile(`${filePath}.sdoc.json`, JSON.stringify({
      format_version: 1,
      plugin: 'dsh-structured-document',
      content_hash: hashText(MEETING_FIXTURE),
      document: legacyDoc,
      state: { selected_node_id: target.id, last_edited_node_id: null, last_created_node_id: null },
    }), 'utf8')

    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    expect(await readFile(filePath, 'utf8')).toBe(MEETING_FIXTURE)
    await workspace.selectNode(target.id)
    expect(JSON.parse(await readFile(`${filePath}.sdoc.json`, 'utf8')).format_version).toBe(1)
    await workspace.setProperty({ nodeId: target.id, key: 'status', value: '进行中' })
    const migratedMarkdown = await readFile(filePath, 'utf8')
    const migratedSidecar = JSON.parse(await readFile(`${filePath}.sdoc.json`, 'utf8'))
    expect(migratedMarkdown).toContain('dsh_profile: meeting')
    expect(migratedMarkdown).toContain('| 待办 | 张三 | 进行中 | 周五 |')
    expect(migratedSidecar.format_version).toBe(2)
    expect(migratedSidecar.document.root).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })

  it('文件在外部被修改后:sidecar 失效,重新解析', async () => {
    const { options, dir } = await makeOptions()
    const filePath = await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const first = new SessionWorkspace('s1', options)
    await first.bindFile('weekly.md')
    await first.addNode({ parentId: 'node_001', title: '将被外部修改覆盖', role: 'topic' })

    await writeFile(filePath, MEETING_FIXTURE + '## 外部新增\n', 'utf8')
    const second = new SessionWorkspace('s2', options)
    const result = await second.bindFile('weekly.md')
    expect(result.source).toBe('reparsed')
    expect(second.getDocument().doc.root.children.some((child) => child.title === '外部新增')).toBe(true)
    expect(second.state.selectedNodeId).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })

  it('绑定不存在的文件 → FILE_NOT_FOUND', async () => {
    const { options } = await makeOptions()
    const workspace = new SessionWorkspace('s1', options)
    await expect(workspace.bindFile('missing.md')).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
  })
})

describe('内核:变更管线与自动保存', () => {
  it('操作后文件与 sidecar 均被写入,Revision 递增', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    const before = workspace.getDocument().doc.revision
    const committed = await workspace.addNode({ parentId: 'node_002', title: '新增讨论', role: 'discussion' })
    expect(committed.saved).toBe(true)
    expect(committed.revision).toBe(before + 1)
    const onDisk = await readFile(join(dir, 'weekly.md'), 'utf8')
    expect(onDisk).toContain('新增讨论')
    const sidecar = JSON.parse(await readFile(join(dir, 'weekly.md.sdoc.json'), 'utf8'))
    expect(sidecar.format_version).toBe(2)
    expect(sidecar.document.revision).toBe(committed.revision)
    await rm(dir, { recursive: true, force: true })
  })

  it('保存失败:SAVE_FAILED,文档回滚,Revision 不变', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const failingStorage = {
      readFile: options.storage.readFile.bind(options.storage),
      writeFile: async () => {
        throw new Error('磁盘已满(模拟)')
      },
    }
    const failing = new SessionWorkspace('s1', { ...options, storage: failingStorage })
    await failing.bindFile('weekly.md')
    const beforeDoc = failing.getDocument().doc
    const beforeRevision = beforeDoc.revision
    await expect(failing.addNode({ parentId: 'node_002', title: 'X', role: 'discussion' }))
      .rejects.toMatchObject({ code: 'SAVE_FAILED' })
    expect(failing.getDocument().doc.title).toBe(beforeDoc.title)
    expect(failing.getDocument().doc.revision).toBe(beforeRevision)
    expect(failing.getDocument().doc.root.children[0].children.some((child) => child.title === 'X')).toBe(false)
    expect(failing.state.dirty).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('sidecar 保存失败不回滚已写入 Markdown 业务数据', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    let writes = 0
    const storage = {
      readFile: options.storage.readFile.bind(options.storage),
      writeFile: async (path: string, content: string) => {
        writes += 1
        if (writes === 2) throw new Error('sidecar 写入失败(模拟)')
        await options.storage.writeFile(path, content)
      },
    }
    const workspace = new SessionWorkspace('s1', { ...options, storage })
    await workspace.bindFile('weekly.md')
    const committed = await workspace.addNode({
      parentId: 'node_002', title: '可见待办', role: 'action_item',
      properties: { owner: '张三', status: '未开始', due_date: '周五' },
    })
    expect(committed.saved).toBe(true)
    expect(committed.markdownUpdated).toBe(true)
    expect(committed.sidecarSaved).toBe(false)
    expect(await readFile(join(dir, 'weekly.md'), 'utf8')).toContain('| 待办 | 张三 | 未开始 | 周五 |')
    await rm(dir, { recursive: true, force: true })
  })

  it('自动保存关闭:操作只改内存,save_document 落盘', async () => {
    const { options, dir } = await makeOptions({ autoSave: false })
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    const committed = await workspace.addNode({ parentId: 'node_002', title: '未保存项', role: 'discussion' })
    expect(committed.saved).toBe(false)
    expect(workspace.state.dirty).toBe(true)
    let onDisk = await readFile(join(dir, 'weekly.md'), 'utf8')
    expect(onDisk).not.toContain('未保存项')
    const saved = await workspace.saveNow()
    expect(saved.saved).toBe(true)
    expect(workspace.state.dirty).toBe(false)
    onDisk = await readFile(join(dir, 'weekly.md'), 'utf8')
    expect(onDisk).toContain('未保存项')
    await rm(dir, { recursive: true, force: true })
  })
})

describe('内核:撤销(Undo)', () => {
  it('撤销新增:节点消失,再撤销删除:节点回来(ID 不变)', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')

    const added = await workspace.addNode({ parentId: 'node_002', title: '临时节点', role: 'discussion' })
    const addedId = added.result.node.id
    expect(workspace.getDocument().doc.root.children[0].children.some((child) => child.id === addedId)).toBe(true)

    const undoAdd = await workspace.undo()
    expect(undoAdd.result.undoneAction).toBe('add_node')
    expect(workspace.getDocument().doc.root.children[0].children.some((child) => child.id === addedId)).toBe(false)

    await expect(workspace.undo()).rejects.toMatchObject({ code: 'INVALID_OPERATION' })

    // 删除 → 撤销 → 子树完整恢复且 ID 不变
    const deleted = await workspace.deleteNode('node_003')
    expect(deleted.result.removed.title).toBe('砂锅误报较多')
    const undoDelete = await workspace.undo()
    expect(undoDelete.result.restoredNodeId).toBe('node_003')
    expect(workspace.getDocument().doc.root.children[0].children.map((child) => child.id)).toContain('node_003')
    await rm(dir, { recursive: true, force: true })
  })

  it('撤销移动:恢复原位置', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    await workspace.moveNode({ nodeId: 'node_003', newParentId: 'node_005' })
    expect(workspace.getDocument().doc.root.children[1].children.some((child) => child.id === 'node_003')).toBe(true)
    await workspace.undo()
    expect(workspace.getDocument().doc.root.children[0].children.map((child) => child.id)).toContain('node_003')
    await rm(dir, { recursive: true, force: true })
  })

  it('撤销不复用节点 ID(计数器单调)', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    const added = await workspace.addNode({ parentId: 'node_001', title: 'A', role: 'topic' })
    await workspace.addNode({ parentId: 'node_001', title: 'B', role: 'topic' })
    await workspace.undo()
    const next = await workspace.addNode({ parentId: 'node_001', title: 'C', role: 'topic' })
    expect(next.result.node.id).not.toBe(added.result.node.id)
    expect(Number(next.result.node.id.slice(5))).toBeGreaterThan(Number(added.result.node.id.slice(5)))
    await rm(dir, { recursive: true, force: true })
  })
})

describe('内核:引用解析与状态指针', () => {
  it('@selected / @last_created / @last_edited / relative', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')

    await workspace.addNode({ parentId: 'node_002', title: '新讨论', role: 'discussion' })
    expect(workspace.resolveRef({ node: '@last_created' }, '测试').title).toBe('新讨论')
    expect(workspace.resolveRef({ node: '@last_edited' }, '测试').title).toBe('新讨论')
    expect(workspace.resolveRef({ node: '@selected' }, '测试').title).toBe('新讨论')
    // 上一条 = 新讨论的前一个兄弟 = 灶具差异可能有影响(node_004)
    expect(workspace.resolveRef({ node: '@selected', relative: 'previous_sibling' }, '测试').id).toBe('node_004')
    // 父节点
    expect(workspace.resolveRef({ node: '@last_created', relative: 'parent' }, '测试').id).toBe('node_002')
    // 未选中时 @selected 报错(用另一份没有 sidecar 状态的文件验证)
    await writeFixture(dir, 'blank.md', '# 空白文档\n- 项目一\n')
    const other = new SessionWorkspace('s2', options)
    await other.bindFile('blank.md')
    expect(() => other.resolveRef({ node: '@selected' }, '测试')).toThrowError(DocumentOperationError)
    await rm(dir, { recursive: true, force: true })
  })

  it('同名节点歧义:报 MULTIPLE_NODES_FOUND 并带候选;occurrence 可消歧', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'plan.md', [
      '# 项目计划',
      '## 九月',
      '- 验证计划',
      '## 十月',
      '- 验证计划',
    ].join('\n') + '\n')
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('plan.md')
    try {
      workspace.resolveRef({ node: '验证计划' }, '测试')
      expect.unreachable()
    } catch (error) {
      const err = error as DocumentOperationError
      expect(err.code).toBe('MULTIPLE_NODES_FOUND')
      expect(err.candidates).toHaveLength(2)
      expect(err.candidates?.[0].path).toBe('九月 / 验证计划')
      expect(err.candidates?.[1].path).toBe('十月 / 验证计划')
    }
    expect(workspace.resolveRef({ node: '验证计划', occurrence: 2 }, '测试').id).toBe('node_005')
    expect(workspace.resolveRef({ node: '验证计划', occurrence: -1 }, '测试').id).toBe('node_005')
    expect(workspace.resolveRef({ node: '验证计划', occurrence: 1 }, '测试').id).toBe('node_003')
    await rm(dir, { recursive: true, force: true })
  })

  it('删除节点后悬空指针被清理', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const workspace = new SessionWorkspace('s1', options)
    await workspace.bindFile('weekly.md')
    await workspace.addNode({ parentId: 'node_002', title: '临时', role: 'discussion' })
    const id = workspace.state.lastCreatedNodeId as string
    await workspace.deleteNode(id)
    expect(workspace.state.lastCreatedNodeId).toBeNull()
    expect(workspace.state.selectedNodeId).toBeNull()
    await rm(dir, { recursive: true, force: true })
  })
})

describe('内核:会话注册表', () => {
  it('会话之间互相隔离;requireBound 在未绑定时报 NO_CURRENT_FILE', async () => {
    const { options, dir } = await makeOptions()
    const registry = new WorkspaceRegistry(options)
    const a = registry.get('session-a')
    expect(a.bound).toBe(false)
    await expect(registry.requireBound('session-a')).rejects.toMatchObject({ code: 'NO_CURRENT_FILE' })

    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    await a.bindFile('weekly.md')
    const b = registry.get('session-b')
    expect(b.bound).toBe(false)
    expect(a.bound).toBe(true)
    registry.disposeAll()
    expect(registry.get('session-a').bound).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('CurrentFileProvider 懒绑定接缝', async () => {
    const { options, dir } = await makeOptions()
    await writeFixture(dir, 'weekly.md', MEETING_FIXTURE)
    const registry = new WorkspaceRegistry(options)
    registry.attachCurrentFileProvider({
      getCurrentFile: async (sessionId) => sessionId === 'session-a' ? join(dir, 'weekly.md') : null,
    })
    const workspace = await registry.requireBound('session-a')
    expect(workspace.bound).toBe(true)
    expect(workspace.getDocument().doc.title).toBe('防干烧项目周会')
    await expect(registry.requireBound('session-b')).rejects.toMatchObject({ code: 'NO_CURRENT_FILE' })
    await rm(dir, { recursive: true, force: true })
  })
})
