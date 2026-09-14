import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { WorkspaceRegistry, type KernelOptions } from '../../src/state/kernel.ts'
import { NodeFsStorage } from '../../src/storage/storage.ts'
import { InMemoryCurrentFileStore } from '../../src/plugin/current-file.ts'
import { StructuredDocumentServiceImpl, type DocumentSnapshot } from '../../src/integration/service.ts'

const NOW = new Date('2026-01-15T10:00:00Z')

const MEETING_FIXTURE = [
  '# 防干烧项目周会',
  '## 当前算法问题',
  '- 砂锅误报较多',
].join('\n') + '\n'

async function makeFixture(): Promise<{ dir: string, filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sdoc-svc-'))
  const filePath = join(dir, 'weekly.md')
  await writeFile(filePath, MEETING_FIXTURE, 'utf8')
  return { dir, filePath }
}

function makeRegistry(dir: string): WorkspaceRegistry {
  const options: KernelOptions = {
    storage: new NodeFsStorage(),
    defaultProfile: 'meeting',
    autoSave: true,
    maxUndoSteps: 50,
    resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    now: () => NOW,
    createdBy: 'test',
  }
  return new WorkspaceRegistry(options)
}

describe('内核工作区事件', () => {
  it('bindFile → bound;变更 → document;selectNode → selection;unbind → unbound', async () => {
    const { dir, filePath } = await makeFixture()
    const registry = makeRegistry(dir)
    const events: string[] = []
    const off = registry.onSessionChanged('s1', (change) => events.push(change.kind))
    const workspace = registry.get('s1')

    await workspace.bindFile(filePath)
    expect(events).toEqual(['bound'])

    await workspace.addNode({ parentId: 'node_001', title: '新议题', role: 'topic' })
    expect(events).toContain('document')

    await workspace.selectNode('node_001')
    await vi.waitFor(() => expect(events.filter((e) => e === 'selection').length).toBe(1))

    workspace.unbindFile()
    expect(events).toContain('unbound')

    off()
    await rm(dir, { recursive: true, force: true })
  })
})

describe('结构化文档集成服务', () => {
  it('bindCurrentFile 返回时已经完成目标切换', async () => {
    const { dir, filePath } = await makeFixture()
    const secondPath = join(dir, 'second.md')
    await writeFile(secondPath, '# 第二份文档\n', 'utf8')
    const registry = makeRegistry(dir)
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    })
    expect(await service.bindCurrentFile('s1', filePath)).toBe(true)
    expect(await service.bindCurrentFile('s1', secondPath)).toBe(true)
    expect(service.getDocumentSnapshot('s1')?.document.title).toBe('第二份文档')
    await rm(dir, { recursive: true, force: true })
  })

  it('目标切换等待同会话中的在途操作，解除目标后不再暴露旧文档', async () => {
    const { dir, filePath } = await makeFixture()
    const secondPath = join(dir, 'second.md')
    await writeFile(secondPath, '# 第二份文档\n', 'utf8')
    const registry = makeRegistry(dir)
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    })
    await service.bindCurrentFile('s1', filePath)
    let release!: () => void
    const held = registry.withSessionLock('s1', () => new Promise<void>(resolve => { release = resolve }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const switching = service.bindCurrentFile('s1', secondPath)
    expect(service.getDocumentSnapshot('s1')?.document.title).toBe('防干烧项目周会')
    release()
    await held
    expect(await switching).toBe(true)
    expect(service.getDocumentSnapshot('s1')?.document.title).toBe('第二份文档')
    service.setCurrentFile('s1', null)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')).toBeNull())
    expect(await service.ensureBound('s1')).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })

  it('setCurrentFile 触发懒绑定并推送 bound 事件与快照', async () => {
    const { dir, filePath } = await makeFixture()
    const registry = makeRegistry(dir)
    const store = new InMemoryCurrentFileStore()
    const service = new StructuredDocumentServiceImpl({
      registry,
      store,
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    })
    const events: string[] = []
    service.subscribe('s1', (change) => events.push(change.kind))

    expect(service.getDocumentSnapshot('s1')).toBeNull()
    service.setCurrentFile('s1', filePath)
    await vi.waitFor(() => expect(events).toContain('bound'))

    const snapshot = service.getDocumentSnapshot('s1')
    expect(snapshot).not.toBeNull()
    expect((snapshot as DocumentSnapshot).document.title).toBe('防干烧项目周会')
    expect((snapshot as DocumentSnapshot).currentFile).toBe(filePath)
    expect(service.getCurrentFile('s1')).toBe(filePath)
    expect(await service.ensureBound('s1')).toBe(true)
    await rm(dir, { recursive: true, force: true })
  })

  it('setCurrentFile 路径变化时重绑(同会话覆盖旧文档)', async () => {
    const { dir, filePath } = await makeFixture()
    const secondPath = join(dir, 'another.md')
    await writeFile(secondPath, '# 另一个文档\n## 议题\n', 'utf8')
    const registry = makeRegistry(dir)
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    })
    service.setCurrentFile('s1', filePath)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')?.document.title).toBe('防干烧项目周会'))
    service.setCurrentFile('s1', secondPath)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')?.document.title).toBe('另一个文档'))
    await rm(dir, { recursive: true, force: true })
  })

  it('setCurrentFile 指向不存在文件:不抛错,保留旧状态', async () => {
    const { dir, filePath } = await makeFixture()
    const registry = makeRegistry(dir)
    const warn = vi.fn()
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
      logger: { warn },
    })
    service.setCurrentFile('s1', filePath)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')).not.toBeNull())
    service.setCurrentFile('s1', join(dir, 'missing.md'))
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    // 旧文档保留
    expect(service.getDocumentSnapshot('s1')?.document.title).toBe('防干烧项目周会')
    await rm(dir, { recursive: true, force: true })
  })

  it('selectNode 透传到工作区状态', async () => {
    const { dir, filePath } = await makeFixture()
    const registry = makeRegistry(dir)
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async (_sessionId, raw) => (isAbsolute(raw) ? raw : join(dir, raw)),
    })
    service.setCurrentFile('s1', filePath)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')).not.toBeNull())
    const snapshot = service.getDocumentSnapshot('s1')!
    const childId = snapshot.document.root.children[0].id
    service.selectNode('s1', childId)
    await vi.waitFor(() => expect(service.getDocumentSnapshot('s1')?.selectedNodeId).toBe(childId))
    // 未绑定会话:静默忽略
    expect(() => service.selectNode('s2', 'node_999')).not.toThrow()
    // 等 sidecar 异步写盘完成后删除临时目录(Windows 上句柄可能占用)。
    await vi.waitFor(async () => {
      await rm(dir, { recursive: true, force: true })
    }, { timeout: 3000 })
  })

  it('ensureBound 未提供当前文件时返回 false', async () => {
    const { dir } = await makeFixture()
    const registry = makeRegistry(dir)
    const service = new StructuredDocumentServiceImpl({
      registry,
      store: new InMemoryCurrentFileStore(),
      resolvePath: async () => dir,
    })
    expect(await service.ensureBound('s1')).toBe(false)
    await rm(dir, { recursive: true, force: true })
  })
})
