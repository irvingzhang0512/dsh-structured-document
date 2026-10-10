/**
 * F010 配置分层与设置命名空间(宿主侧)。
 *
 * 覆盖三件事:
 * 1. `resolveConfig` 的解析顺序(schema 默认 → 组装 base → 用户层)与逐字段 `??` 兜底;
 * 2. 设置命名空间 schema 只声明卡片三个字段,`currentFile` 不在其中,非法取值被拒;
 * 3. 宿主软依赖接入:有设置服务时 `getConfig()` 跟随写入实时变化,服务缺失或摘除时
 *    插件仍挂载并回退组装配置。
 *
 * 假 `ctx` 只实现本插件用到的表面;假 settings 服务用**真实的** `SettingsConfig`
 * 解析 base+user,与 dsh-settings provider 的 `schema(mergeLayers(base, section))`
 * 同构,因此 schema 的拒绝行为在用例里真实发生。
 */
import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  Config,
  PROFILE_IDS,
  resolveConfig,
  SETTINGS_NAMESPACE,
  SettingsConfig,
  type SettingsConfigValue,
} from '../../src/plugin/config.ts'
import { apply } from '../../src/index.ts'

/** 与 dsh-tools ToolDefinition 对齐的最小结构。 */
interface ToolLike {
  name: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, exec: ToolRunContext): Promise<unknown>
}

class FakeToolRegistry {
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

/** 一次 register 调用的记录。 */
interface SettingsRegistration {
  ns: string
  schema: unknown
  base: Record<string, unknown>
  applies: string
}

/** 假设置服务:与 provider 同构地解析 base+user(用真实 schema 校验)。 */
function makeFakeSettings(): {
  service: { register(ns: string, schema: unknown, options?: { base?: Record<string, unknown>, applies?: 'live' | 'restart' }): { get(): SettingsConfigValue } }
  registrations: SettingsRegistration[]
  setUser(section: Record<string, unknown>): void
} {
  const registrations: SettingsRegistration[] = []
  let user: Record<string, unknown> = {}
  const parse = SettingsConfig as unknown as (input: unknown) => SettingsConfigValue
  return {
    registrations,
    setUser(section) { user = section },
    service: {
      register(ns, schema, options) {
        const base = options?.base ?? {}
        registrations.push({ ns, schema, base, applies: options?.applies ?? 'live' })
        // provider 的实现是 `schema(mergeLayers(base, section))`:合并后整体过 schema。
        return { get: () => parse({ ...base, ...user }) }
      },
    },
  }
}

interface FakeHost {
  dir: string
  file: string
  tools: FakeToolRegistry
  skills: unknown[]
  warns: string[]
  settings: ReturnType<typeof makeFakeSettings> | undefined
  /** 夹具是否成功绑定了当前文件(越界配置下绑定失败属被测行为)。 */
  bound: boolean
  /** 触发注入 fiber 的清理(模拟设置服务被摘除)。 */
  disposeInjected(): void
  cleanup(): Promise<void>
}

/** 会话 ID:F010 用例统一使用同一会话,便于夹具绑定当前文件。 */
const SESSION_ID = 'session-settings'

async function makeHost(options: {
  withSettings?: boolean
  settingsUser?: Record<string, unknown>
  baseConfig?: Record<string, unknown>
  content?: string
}): Promise<FakeHost> {
  const dir = await mkdtemp(join(tmpdir(), 'sdoc-settings-'))
  const file = join(dir, 'doc.md')
  await writeFile(file, options.content ?? '# 周会\n\n## 议题\n- 第一条\n', 'utf8')

  const tools = new FakeToolRegistry()
  const skills: unknown[] = []
  const warns: string[] = []
  const injectedDisposers: Array<() => void> = []
  /** ctx.provide 发布的服务(夹具用它拿回 structuredDocument 并绑定当前文件)。 */
  const services = new Map<string, unknown>()
  const settings = options.withSettings === true ? makeFakeSettings() : undefined
  if (settings !== undefined && options.settingsUser !== undefined) settings.setUser(options.settingsUser)

  const ctx = {
    tools,
    skills: { register: (registration: unknown) => { skills.push(registration); return () => {} } },
    sessions: { get: () => ({ header: { cwd: dir } }) },
    logger: { warn: (message: string) => { warns.push(message) }, info: () => {}, error: () => {} },
    provide: (key: string, value: unknown) => { services.set(key, value); return () => { services.delete(key) } },
    effect: (fn: () => (() => void) | void) => { fn(); return () => {} },
    // 真 cordis 的 ctx.inject:服务可用时才回调;不可用时回调不发生(插件照常运行)。
    inject: (deps: string[], callback: (ctx: unknown) => void) => {
      if (deps.includes('settings') && settings !== undefined) {
        callback({
          settings: settings.service,
          effect: (fn: () => (() => void) | void) => {
            const dispose = fn()
            if (typeof dispose === 'function') injectedDisposers.push(dispose)
            return () => {}
          },
        })
      }
      return { then: () => {} }
    },
  }

  apply(ctx as never, options.baseConfig as never)

  // 绑定当前文件:走插件自己发布的服务接缝(ctx.structuredDocument),与真实宿主
  // (工作台 / 视图插件)的接入方式一致。缺这一步时工作区没有当前文件,任何工具
  // 都只会返回 NO_CURRENT_FILE —— 夹具必须先接通,后续断言才有意义。
  // 绑定失败不在这里硬失败:越界配置下装载文档会抛内核的明确报错,那正是被测行为;
  // 集成层按既有语义记绑定失败告警,由用例断言。
  const documentService = services.get('structuredDocument') as {
    bindCurrentFile(sessionId: string, filePath: string): Promise<boolean>
  }
  const bound = await documentService.bindCurrentFile(SESSION_ID, file)
  // 除“组装值越界”用例外,其它用例都依赖绑定成功:这里显式告警,避免夹具再次
  // 静默失去当前文件、把失败伪装成 NO_CURRENT_FILE 而看不出原因。
  if (!bound && options.baseConfig?.['defaultProfile'] !== 'weekly') {
    throw new Error(`夹具绑定当前文件失败(非预期的配置越界):${file}`)
  }

  return {
    dir,
    file,
    tools,
    skills,
    warns,
    settings,
    bound,
    disposeInjected: () => { for (const dispose of injectedDisposers.splice(0)) dispose() },
    cleanup: async () => { await rm(dir, { recursive: true, force: true }) },
  }
}

const SESSION = {
  agent: { session: { id: SESSION_ID } },
  signal: new AbortController().signal,
  deferContext: () => () => {},
  concludeTurn: () => {},
} as unknown as ToolRunContext

/** 按注册表调用工具(execute 内置参数校验,业务错误以失败信封返回)。 */
async function call(host: FakeHost, name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const tool = host.tools.get(name)
  expect(tool, `工具 ${name} 应已注册`).toBeDefined()
  return (await tool!.execute(args, SESSION)) as Record<string, unknown>
}

async function readDoc(host: FakeHost): Promise<string> {
  return readFile(host.file, 'utf8')
}

describe('F010 resolveConfig 配置分层', () => {
  it('解析顺序为 schema 默认 → 组装 base → 用户层', () => {
    // 两层都缺:内置默认。
    expect(resolveConfig(undefined, undefined)).toEqual({
      defaultProfile: 'meeting', autoSave: true, currentFile: '', maxUndoSteps: 100,
    })
    // 组装层空对象(插件自带 cordis.patch.yml 的 config: {})仍拿到默认值。
    expect(resolveConfig({}, undefined)).toEqual({
      defaultProfile: 'meeting', autoSave: true, currentFile: '', maxUndoSteps: 100,
    })
    // 组装层覆盖默认。
    expect(resolveConfig({ defaultProfile: 'project', maxUndoSteps: 5, autoSave: false }, undefined)).toEqual({
      defaultProfile: 'project', autoSave: false, currentFile: '', maxUndoSteps: 5,
    })
    // 用户层覆盖组装层。
    expect(resolveConfig(
      { defaultProfile: 'project', autoSave: false, maxUndoSteps: 5 },
      { defaultProfile: 'thinking', autoSave: true, maxUndoSteps: 9 },
    )).toEqual({ defaultProfile: 'thinking', autoSave: true, currentFile: '', maxUndoSteps: 9 })
    // 逐字段 ?? :用户层缺字段时回退组装值,不会被整体跳过。
    expect(resolveConfig({ defaultProfile: 'project', autoSave: false, maxUndoSteps: 7 }, {})).toEqual({
      defaultProfile: 'project', autoSave: false, currentFile: '', maxUndoSteps: 7,
    })
  })

  it('currentFile 只在组装层:设置层即使写入同名字段也不生效', () => {
    // 设置命名空间 schema 里没有 currentFile,这里用宽松对象模拟“设置文档被外部写入该字段”。
    const liveWithSeamHack = { currentFile: 'hacked.md' } as Record<string, unknown> as Partial<SettingsConfigValue>
    expect(resolveConfig({ currentFile: 'assembly.md' }, liveWithSeamHack).currentFile).toBe('assembly.md')
    expect(resolveConfig(undefined, liveWithSeamHack).currentFile).toBe('')
    expect(resolveConfig({ currentFile: 'assembly.md' }, undefined).currentFile).toBe('assembly.md')
  })
})

describe('F010 设置命名空间 schema', () => {
  it('只声明卡片三个字段,currentFile 不在其中', () => {
    const fields = Object.keys((SettingsConfig as unknown as { dict?: Record<string, unknown> }).dict ?? {})
    expect(fields.sort()).toEqual(['autoSave', 'defaultProfile', 'maxUndoSteps'])
    // 组装层 schema 仍保留四个字段(含 currentFile),语义与 F009 一致。
    const assemblyFields = Object.keys((Config as unknown as { dict?: Record<string, unknown> }).dict ?? {})
    expect(assemblyFields.sort()).toEqual(['autoSave', 'currentFile', 'defaultProfile', 'maxUndoSteps'])
  })

  it('默认值符合规格,且非法取值被明确拒绝', () => {
    expect(SettingsConfig({})).toEqual({ defaultProfile: 'meeting', autoSave: true, maxUndoSteps: 100 })
    expect(PROFILE_IDS).toEqual(['meeting', 'project', 'thinking'])
    expect(() => SettingsConfig({ defaultProfile: 'weekly' })).toThrow()
    expect(() => SettingsConfig({ maxUndoSteps: 0 })).toThrow()
    expect(() => SettingsConfig({ maxUndoSteps: 1.5 })).toThrow()
    expect(() => SettingsConfig({ maxUndoSteps: '5' })).toThrow()
    expect(() => SettingsConfig({ autoSave: 'yes' })).toThrow()
    // maxUndoSteps 最小 1:1 合法。
    expect(SettingsConfig({ maxUndoSteps: 1 }).maxUndoSteps).toBe(1)
  })

  it('组装层 schema 仍接受任意 defaultProfile 字符串(不改 F009 语义)', () => {
    expect(Config({ defaultProfile: 'weekly' }).defaultProfile).toBe('weekly')
  })
})

describe('F010 宿主软依赖接入', () => {
  it('有设置服务:按包名注册命名空间(base 只含三个字段、applies live),插件照常挂载', async () => {
    const host = await makeHost({ withSettings: true, baseConfig: { defaultProfile: 'project', maxUndoSteps: 5 } })
    try {
      expect(host.tools.registered).toHaveLength(17)
      expect(host.skills.length).toBeGreaterThan(0)
      expect(host.settings!.registrations).toHaveLength(1)
      const registration = host.settings!.registrations[0]!
      expect(registration.ns).toBe(SETTINGS_NAMESPACE)
      expect(registration.ns).toBe('dsh-structured-document')
      expect(registration.schema).toBe(SettingsConfig)
      expect(registration.applies).toBe('live')
      expect(Object.keys(registration.base).sort()).toEqual(['autoSave', 'defaultProfile', 'maxUndoSteps'])
      expect(registration.base).not.toHaveProperty('currentFile')
      expect(registration.base.defaultProfile).toBe('project')
      expect(registration.base.maxUndoSteps).toBe(5)
    } finally { await host.cleanup() }
  })

  it('getConfig() 跟随设置写入:autoSave 关闭后修改不落盘,重新开启后落盘', async () => {
    const host = await makeHost({ withSettings: true, baseConfig: { autoSave: true } })
    try {
      host.settings!.setUser({ autoSave: false })
      expect(await call(host, 'add_node', { title: '草稿节点' })).toMatchObject({ success: true })
      expect(await readDoc(host)).not.toContain('草稿节点')

      host.settings!.setUser({ autoSave: true })
      expect(await call(host, 'add_node', { title: '落盘节点' })).toMatchObject({ success: true })
      expect(await readDoc(host)).toContain('落盘节点')
    } finally { await host.cleanup() }
  })

  it('getConfig() 跟随 defaultProfile:覆盖后新文档用新模板,未覆盖时用组装值', async () => {
    const withoutOverride = await makeHost({ withSettings: true, baseConfig: { autoSave: true }, content: '' })
    const withOverride = await makeHost({ withSettings: true, settingsUser: { defaultProfile: 'project' }, baseConfig: { autoSave: true, defaultProfile: 'meeting' }, content: '' })
    try {
      await call(withoutOverride, 'add_node', { title: '事项' })
      await call(withOverride, 'add_node', { title: '事项' })
      expect(await readDoc(withoutOverride)).toMatch(/dsh_profile:\s*meeting/)
      expect(await readDoc(withOverride)).toMatch(/dsh_profile:\s*project/)
    } finally {
      await withoutOverride.cleanup()
      await withOverride.cleanup()
    }
  })

  it('getConfig() 跟随 maxUndoSteps:设为 1 时只保留最近一步撤销', async () => {
    const host = await makeHost({ withSettings: true, baseConfig: { autoSave: true, maxUndoSteps: 100 } })
    const control = await makeHost({ withSettings: true, baseConfig: { autoSave: true, maxUndoSteps: 100 } })
    try {
      host.settings!.setUser({ maxUndoSteps: 1 })
      await call(host, 'add_node', { title: '节点一' })
      await call(host, 'add_node', { title: '节点二' })
      const undo = await call(host, 'undo')
      expect(undo.success).toBe(true)
      // 栈被裁剪到 1:撤销一步后没有剩余可撤销步骤。
      expect(undo.undo_remaining).toBe(0)
      expect(await readDoc(host)).toContain('节点一')
      expect(await readDoc(host)).not.toContain('节点二')

      // 对照组:未覆盖时按组装值 100,撤销一步后仍有剩余。
      await call(control, 'add_node', { title: '节点一' })
      await call(control, 'add_node', { title: '节点二' })
      expect((await call(control, 'undo')).undo_remaining).toBe(1)
    } finally {
      await host.cleanup()
      await control.cleanup()
    }
  })

  it('设置服务缺失:插件仍挂载、工具可用、使用组装配置', async () => {
    const host = await makeHost({ withSettings: false, baseConfig: { autoSave: false, defaultProfile: 'thinking' } })
    try {
      expect(host.tools.registered).toHaveLength(17)
      expect(host.skills.length).toBeGreaterThan(0)
      expect(await call(host, 'add_node', { title: '组装配置节点' })).toMatchObject({ success: true })
      // 组装层 autoSave: false → 不落盘(回退路径确实用了组装配置)。
      expect(await readDoc(host)).not.toContain('组装配置节点')
    } finally { await host.cleanup() }
  })

  it('设置服务摘除后回退组装配置', async () => {
    const host = await makeHost({ withSettings: true, baseConfig: { autoSave: true } })
    try {
      host.settings!.setUser({ autoSave: false })
      await call(host, 'add_node', { title: '覆盖期节点' })
      expect(await readDoc(host)).not.toContain('覆盖期节点')

      // 注入 fiber 卸载 → liveScope 还原,回到组装层 autoSave: true。
      host.disposeInjected()
      await call(host, 'add_node', { title: '回退后节点' })
      expect(await readDoc(host)).toContain('回退后节点')
    } finally { await host.cleanup() }
  })

  it('组装值越界时告警并回退组装配置,内核仍按原有语义报错', async () => {
    const host = await makeHost({ withSettings: true, baseConfig: { defaultProfile: 'weekly', autoSave: true } })
    try {
      // 越界的组装值不能让插件整块挂载失败:工具照常注册,只是设置层被隔离。
      expect(host.tools.registered).toHaveLength(17)
      expect(host.skills.length).toBeGreaterThan(0)
      // provider 惰性校验:注册不抛错,第一次读取设置层时才越界,由插件告警并回退。
      expect(host.settings!.registrations).toHaveLength(1)
      expect(host.warns.some(message => message.includes('设置层解析失败'))).toBe(true)
      // 不静默改成 schema 默认值:越界的组装值仍走内核既有的明确报错。装载文档时
      // requireProfile 抛出“场景模板不合法”,集成层按既有语义记绑定失败并保留原状态。
      expect(host.bound).toBe(false)
      expect(host.warns.some(message => message.includes('场景模板不合法'))).toBe(true)
      // 工具照常可用(插件没被越界配置拖垮),错误以结构化信封返回而不是静默成功。
      const result = await call(host, 'add_node', { title: '节点' })
      expect(result.success).toBe(false)
      expect(result.error).toBe('NO_CURRENT_FILE')
    } finally { await host.cleanup() }
  })
})
