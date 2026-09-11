/**
 * 场景测试共享工具:搭建「真实文件 + 会话绑定 + 工具调用」环境,
 * 模拟模型按 SKILL.md 规则发起的连续多轮中文操作。
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { WorkspaceRegistry, type KernelOptions } from '../../src/state/kernel.ts'
import { NodeFsStorage } from '../../src/storage/storage.ts'
import { registerStructuredDocumentTools } from '../../src/tools/register-tools.ts'

/** 与 dsh-tools ToolDefinition 对齐的最小结构。 */
export interface ToolLike {
  name: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, exec: ToolRunContext): Promise<unknown>
}

export const NOW = new Date('2026-01-15T10:00:00Z')

class FakeTools {
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

export interface Scenario {
  dir: string
  filePath: string
  /** 调用工具(模拟模型按 SKILL.md 构造参数)。 */
  call(name: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>
  /** 读取当前文件在磁盘上的内容。 */
  readDisk(): Promise<string>
  /** 读取 sidecar JSON。 */
  readSidecar(): Promise<Record<string, unknown>>
  cleanup(): Promise<void>
}

export async function makeScenario(
  fileContent: string,
  options?: { fileName?: string, kernel?: Partial<KernelOptions> },
): Promise<Scenario> {
  const dir = await mkdtemp(join(tmpdir(), 'sdoc-scenario-'))
  const filePath = join(dir, options?.fileName ?? 'document.md')
  await writeFile(filePath, fileContent, 'utf8')
  const kernelOptions: KernelOptions = {
    storage: new NodeFsStorage(),
    defaultProfile: 'meeting',
    autoSave: true,
    maxUndoSteps: 100,
    resolvePath: async (_sessionId, raw) => isAbsolute(raw) ? raw : join(dir, raw),
    now: () => NOW,
    createdBy: 'scenario-test',
    ...options?.kernel,
  }
  const registry = new WorkspaceRegistry(kernelOptions)
  registry.attachCurrentFileProvider({ getCurrentFile: () => filePath })
  const fakeTools = new FakeTools()
  registerStructuredDocumentTools({ tools: fakeTools } as never, registry)
  const session = {
    agent: { session: { id: 'scenario-session' } },
    signal: new AbortController().signal,
    deferContext: () => () => {},
    concludeTurn: () => {},
  } as unknown as ToolRunContext
  return {
    dir,
    filePath,
    call: async (name, args = {}) => {
      const tool = fakeTools.get(name)
      if (tool === undefined) throw new Error(`工具未注册:${name}`)
      return (await tool.execute(args, session)) as Record<string, unknown>
    },
    readDisk: () => readFile(filePath, 'utf8'),
    readSidecar: async () => JSON.parse(await readFile(`${filePath}.sdoc.json`, 'utf8')) as Record<string, unknown>,
    cleanup: async () => {
      registry.disposeAll()
      await rm(dir, { recursive: true, force: true })
    },
  }
}
