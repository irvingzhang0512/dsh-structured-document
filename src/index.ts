/**
 * dsh-structured-document —— DSH 结构化文档插件(宿主侧入口)。
 *
 * 链路(requirements.md 第 4 章):
 *
 *   中文自然语言 → DSH Agent → 结构化文档 Skill → 结构化文档 Tools
 *   → 结构化文档(IR)→ 结构校验并保存
 *
 * 本模块挂载:
 * - 17 个职责明确的结构化文档工具(无万能 command 工具);
 * - 中文 SKILL.md(bundled skill,教 LLM 用中文自然语言调用工具);
 * - 按会话隔离的文档工作区(加载/解析/校验/自动保存/撤销)。
 *
 * 边界:本插件不负责文件树、文件选择、文件切换与 Sidebar;“当前文件”由外部
 * 提供(config.currentFile 或未来集成,见 plugin/current-file.ts 的 TODO)。
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context, SettingsConsumerContext, SettingsScopeFace } from './context-types.ts'
import {
  Config,
  resolveConfig,
  SETTINGS_NAMESPACE,
  SettingsConfig,
  type PluginConfig,
  type ResolvedConfig,
  type SettingsConfigValue,
} from './plugin/config.ts'
import { InMemoryCurrentFileStore, StaticCurrentFileProvider } from './plugin/current-file.ts'
import { registerSkill } from './plugin/skill.ts'
import { registerStructuredDocumentTools } from './tools/register-tools.ts'
import { WorkspaceRegistry, type KernelOptions } from './state/kernel.ts'
import { StructuredDocumentServiceImpl } from './integration/service.ts'
import { sessionDirectory } from './session-directory.ts'
import { NodeFsStorage } from './storage/storage.ts'

/** 插件标识(cordis.yml 行)。 */
export const name = 'dsh-structured-document'

/**
 * 挂载前需要就绪的服务:工具注册表、skill 注册表、会话存储(权威 cwd)。
 *
 * `settings` **故意不在这里** —— cordis 把入口 `inject` 当硬前置,任一服务不可用
 * 都会让 fiber 不激活并卸载,插件的 `apply` 根本不会被调用。设置服务是软依赖,
 * 用 `ctx.inject(['settings'], …)` 在服务可用时接入(F010;见 docs/architecture.md
 * 的「配置契约」)。
 */
export const inject = ['tools', 'skills', 'sessions', 'sessionController']

export { Config }
export type { StructuredDocumentService, DocumentSnapshot } from './integration/service.ts'
export type { WorkspaceChange } from './state/kernel.ts'

/** 会话 cwd 的防御式读取(会话行缺失时退回进程 cwd)。 */
function sessionCwd(ctx: Context): (sessionId: string) => Promise<string | null> {
  return sessionId => sessionDirectory(ctx, sessionId)
}

/**
 * 插件主体:注册工具与 skill,挂载按会话隔离的文档工作区。
 * @param ctx - 宿主插件 context(tools/skills/sessions)。
 * @param baseConfig - schemastery 解析后的插件配置。
 */
export function apply(ctx: Context, baseConfig?: PluginConfig): void {
  // 组装层配置:逐字段合并默认值。宿主可能传入空对象 `{}`(例如本插件自带
  // cordis.patch.yml 的 `config: {}`),此时 `baseConfig ?? 默认值` 会整体跳过
  // 默认分支,导致 defaultProfile 为 undefined,首次装载任意无 sidecar 的文档时
  // 抛出“场景模板不合法:undefined”。逐字段 ?? 兜底可同时兼容 undefined 与 {}。
  const assemblyConfig: ResolvedConfig = resolveConfig(baseConfig, undefined)

  /** 设置命名空间 owner scope:设置服务在场时才存在(F010 软依赖)。 */
  let liveScope: SettingsScopeFace<SettingsConfigValue> | undefined

  /**
   * 读取设置层的实时解析值;越界(解析抛错)时视为该层不可用并退回组装配置。
   *
   * 宿主 provider 是**惰性**校验的:注册时不解析 `base`,第一次 `get()` 才把
   * base 与用户层合并后交给 schema,越界的组装值(如 `defaultProfile: 'weekly'`)
   * 因此在读取时才抛错。若不在此兜底,首次 `getConfig()` 就会把异常抛进
   * `apply()`,插件整块挂载失败——与 F010「服务/取值异常时插件照常挂载、退回
   * 组装配置」的边界相悖。这里只隔离设置层,不静默改成 schema 默认值:退化路径
   * 交给内核按原有语义明确报错(如装载文档时的“场景模板不合法”)。
   */
  let settingsLayerWarned = false
  const readLiveConfig = (): SettingsConfigValue | undefined => {
    const scope = liveScope
    if (scope === undefined) return undefined
    try {
      return scope.get()
    } catch (error) {
      // 只告警一次,避免每次读配置都刷日志;liveScope 保留,重新保存合法值可自愈。
      if (!settingsLayerWarned) {
        settingsLayerWarned = true
        ctx.logger?.warn?.(
          `[${SETTINGS_NAMESPACE}] 设置层解析失败,已回退到组装配置:${error instanceof Error ? error.message : String(error)}`,
        )
      }
      return undefined
    }
  }

  /**
   * 运行期生效配置:每次读取都重新解析「设置解析值(用户层 > 组装 base > schema 默认)
   * > 组装配置 > 内置默认」,`applies: 'live'` 因此对内核即时生效——内核经
   * KernelOptions 的 getter 每次读取本函数,而不是在挂载时快照配置。
   */
  const getConfig = (): ResolvedConfig => resolveConfig(assemblyConfig, readLiveConfig())

  // 设置服务是软依赖:不写进入口 `inject`(否则服务缺失时 fiber 不激活、插件整块
  // 不挂载)。用 ctx.inject 在服务可用时接入;服务缺失时回调不发生,getConfig()
  // 退回只读的组装配置,插件照常挂载、工具与 Skill 照常工作。
  ctx.inject(['settings'], (sctx) => {
    const consumer = sctx as unknown as SettingsConsumerContext
    const settings = consumer.settings
    if (settings === undefined) return
    let scope: SettingsScopeFace<SettingsConfigValue>
    try {
      scope = settings.register(SETTINGS_NAMESPACE, SettingsConfig, {
        // 组装配置注册为设置命名空间的 `base` 层;currentFile 不进该 schema。
        // 宿主 provider 会把 base 与用户层合并后交给 SettingsConfig 校验,
        // 因此越界的组装值(如 defaultProfile: 'weekly')在读取时被拒。
        base: {
          defaultProfile: assemblyConfig.defaultProfile,
          autoSave: assemblyConfig.autoSave,
          maxUndoSteps: assemblyConfig.maxUndoSteps,
        },
        applies: 'live',
      })
    } catch (error) {
      // 宿主在注册阶段就拒绝(部分 provider 会立即校验 base):同样退回组装配置,
      // 内核仍按原有语义在装载文档时明确报错,不静默改成 schema 默认值。
      ctx.logger?.warn?.(
        `[${SETTINGS_NAMESPACE}] 设置命名空间注册失败,已回退到组装配置:${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
    liveScope = scope
    // 服务摘除(或 fiber 卸载)时还原成组装配置,不留悬挂读取。
    consumer.effect(() => () => {
      if (liveScope === scope) liveScope = undefined
      settingsLayerWarned = false
    }, 'dsh-structured-document: settings fallback')
  })

  const getCwd = sessionCwd(ctx)

  // 把(可能相对的)路径解析为绝对路径:相对会话工作目录。
  const resolvePath = async (sessionId: string, rawPath: string): Promise<string> => {
    if (isAbsolute(rawPath)) return rawPath
    const cwd = await getCwd(sessionId)
    return cwd === null ? resolve(rawPath) : resolve(cwd, rawPath)
  }

  const kernelOptions: KernelOptions = {
    storage: new NodeFsStorage(),
    resolvePath,
    // 三个可配置字段用 getter:内核每次读取都经 getConfig() 取实时解析值,
    // 设置页保存后按 applies:'live' 立即生效(挂载时快照会让 live 失效)。
    get defaultProfile() { return getConfig().defaultProfile },
    get autoSave() { return getConfig().autoSave },
    get maxUndoSteps() { return getConfig().maxUndoSteps },
  }
  const registry = new WorkspaceRegistry(kernelOptions)

  // 当前文件集成(需求第 12.1 章 + current-file.ts 的 TODO):
  //   - InMemoryCurrentFileStore 是可编程写入口,外部集成方(如
  //     dsh-structured-document-view 视图插件)经 ctx.structuredDocument
  //     .setCurrentFile() 推送"当前文件"变化;
  //   - getConfig().currentFile 静态配置作为兜底(store 未设置时使用)。
  //     该字段只在组装层解析(见 plugin/config.ts),设置页无法覆盖它。
  const currentFileStore = new InMemoryCurrentFileStore()
  const staticCurrentFile = getConfig().currentFile
  if (staticCurrentFile !== '') {
    const staticProvider = new StaticCurrentFileProvider(staticCurrentFile, getCwd)
    registry.attachCurrentFileProvider({
      getCurrentFile: (sessionId) => currentFileStore.getCurrentFile(sessionId) ?? staticProvider.getCurrentFile(sessionId),
    })
  } else {
    registry.attachCurrentFileProvider(currentFileStore)
  }

  // 对外集成服务:ctx.structuredDocument(宿主 cordis 服务)。
  const documentService = new StructuredDocumentServiceImpl({
    registry,
    store: currentFileStore,
    resolvePath,
    logger: ctx.logger,
  })
  const unprovideDocumentService = ctx.provide('structuredDocument', documentService)

  const toolsDisposer = registerStructuredDocumentTools(ctx, registry)

  // 中文 SKILL.md 注册(bundled skill)。
  registerSkill(ctx)

  ctx.effect(() => () => {
    toolsDisposer()
    unprovideDocumentService()
    registry.disposeAll()
  }, 'dsh-structured-document: teardown')
}

export default apply
