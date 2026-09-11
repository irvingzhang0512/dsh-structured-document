/**
 * dsh-structured-document —— DSH 结构化文档插件(宿主侧入口)。
 *
 * 链路(requirements.md 第 4 章):
 *
 *   中文自然语言 → DSH Agent → 结构化文档 Skill → 结构化文档 Tools
 *   → 结构化文档(IR)→ 结构校验并保存
 *
 * 本模块挂载:
 * - 14 个职责明确的结构化文档工具(无万能 command 工具);
 * - 中文 SKILL.md(bundled skill,教 LLM 用中文自然语言调用工具);
 * - 按会话隔离的文档工作区(加载/解析/校验/自动保存/撤销)。
 *
 * 边界:本插件不负责文件树、文件选择、文件切换与 Sidebar;“当前文件”由外部
 * 提供(config.currentFile 或未来集成,见 plugin/current-file.ts 的 TODO)。
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context } from './context-types.ts'
import { Config, type PluginConfig } from './plugin/config.ts'
import { InMemoryCurrentFileStore, StaticCurrentFileProvider } from './plugin/current-file.ts'
import { registerSkill } from './plugin/skill.ts'
import { registerStructuredDocumentTools } from './tools/register-tools.ts'
import { WorkspaceRegistry, type KernelOptions } from './state/kernel.ts'
import { StructuredDocumentServiceImpl } from './integration/service.ts'
import { NodeFsStorage } from './storage/storage.ts'

/** 插件标识(cordis.yml 行)。 */
export const name = 'dsh-structured-document'

/** 挂载前需要就绪的服务:工具注册表、skill 注册表、会话存储(权威 cwd)。 */
export const inject = ['tools', 'skills', 'sessions']

export { Config }
export type { StructuredDocumentService, DocumentSnapshot } from './integration/service.ts'
export type { WorkspaceChange } from './state/kernel.ts'

/** 会话 cwd 的防御式读取(会话行缺失时退回进程 cwd)。 */
function sessionCwd(ctx: Context): (sessionId: string) => Promise<string | null> {
  return async (sessionId: string) => {
    try {
      const cwd = ctx.sessions.get(sessionId)?.header?.cwd
      if (typeof cwd === 'string' && cwd !== '') return cwd
    } catch {
      // sessions 服务不可用时退回进程 cwd。
    }
    return process.cwd()
  }
}

/**
 * 插件主体:注册工具与 skill,挂载按会话隔离的文档工作区。
 * @param ctx - 宿主插件 context(tools/skills/sessions)。
 * @param baseConfig - schemastery 解析后的插件配置。
 */
export function apply(ctx: Context, baseConfig?: PluginConfig): void {
  // 逐字段合并默认值:宿主可能传入空对象 `{}`(例如本插件自带 cordis.patch.yml
  // 的 `config: {}`),此时 `baseConfig ?? 默认值` 会整体跳过默认分支,导致
  // defaultProfile 为 undefined,首次装载任意无 sidecar 的文档时抛出
  // “场景模板不合法:undefined”。逐字段 ?? 兜底可同时兼容 undefined 与 {}。
  const config: PluginConfig = {
    defaultProfile: baseConfig?.defaultProfile ?? 'meeting',
    autoSave: baseConfig?.autoSave ?? true,
    currentFile: baseConfig?.currentFile ?? '',
    maxUndoSteps: baseConfig?.maxUndoSteps ?? 100,
  }

  const getCwd = sessionCwd(ctx)

  // 把(可能相对的)路径解析为绝对路径:相对会话工作目录。
  const resolvePath = async (sessionId: string, rawPath: string): Promise<string> => {
    if (isAbsolute(rawPath)) return rawPath
    const cwd = await getCwd(sessionId)
    return cwd === null ? resolve(rawPath) : resolve(cwd, rawPath)
  }

  const kernelOptions: KernelOptions = {
    storage: new NodeFsStorage(),
    defaultProfile: config.defaultProfile,
    autoSave: config.autoSave,
    maxUndoSteps: config.maxUndoSteps,
    resolvePath,
  }
  const registry = new WorkspaceRegistry(kernelOptions)

  // 当前文件集成(需求第 12.1 章 + current-file.ts 的 TODO):
  //   - InMemoryCurrentFileStore 是可编程写入口,外部集成方(如
  //     dsh-structured-document-view 视图插件)经 ctx.structuredDocument
  //     .setCurrentFile() 推送"当前文件"变化;
  //   - config.currentFile 静态配置作为兜底(store 未设置时使用)。
  const currentFileStore = new InMemoryCurrentFileStore()
  if (config.currentFile !== '') {
    const staticProvider = new StaticCurrentFileProvider(config.currentFile, getCwd)
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
