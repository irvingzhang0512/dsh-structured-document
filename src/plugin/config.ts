/**
 * 插件配置(schemastery)+ 配置分层(F010)。
 *
 * 配置有两个来源,解析顺序为 **schema 默认 → 组装 `base` → 用户层**(后者覆盖前者):
 *  - {@link Config}:组装层配置(插件行 `cordis.patch.yml` 的 `config`),含 `currentFile`;
 *  - {@link SettingsConfig} + {@link SETTINGS_NAMESPACE}:设置页卡片可编辑的三个字段。
 *
 * `currentFile` **故意不进入设置命名空间的 schema**:它是外部集成接缝(谁提供
 * “当前文件”),只能由组装层提供,用户层无法从设置文档顶掉它。
 *
 * 运行期由 {@link resolveConfig} 统一兜底:宿主可能传入空对象 `{}`(本插件自带
 * `cordis.patch.yml` 的 `config: {}`),逐字段 `??` 避免“整体跳过默认分支”导致
 * `defaultProfile` 为 undefined。
 */
import z from '@deepseek-ai/schemastery'

/** 设置命名空间 = 包名(设置文档分节键、设置卡片 slot key、客户端 bundle id 三者一致)。 */
export const SETTINGS_NAMESPACE = 'dsh-structured-document'

/** `defaultProfile` 的合法取值(设置卡片 select 与设置 schema 共用同一份字面量)。 */
export const PROFILE_IDS = ['meeting', 'project', 'thinking'] as const

/** 场景模板标识。 */
export type ProfileId = (typeof PROFILE_IDS)[number]

/** 组装层配置(插件行 `cordis.patch.yml` 的 `config`):`currentFile` 只在这一层。 */
export const Config = z.object({
  defaultProfile: z.string().default('meeting')
    .description('默认场景模板:meeting 会议纪要 / project 项目管理 / thinking 思路整理。文档首次装载且无历史记录时使用。'),
  autoSave: z.boolean().default(true)
    .description('自动保存:每次修改经结构校验后立即写盘并推进版本;关闭后需要用 save_document 手动保存。'),
  currentFile: z.string().default('')
    .description('可选:固定绑定的当前文件(绝对路径,或相对会话工作目录)。留空表示由外部集成提供(见 docs/architecture.md 的当前文件集成 TODO)。'),
  maxUndoSteps: z.number().default(100)
    .description('撤销栈深度(可撤销的最近操作步数)。'),
})

export type PluginConfig = {
  defaultProfile: string
  autoSave: boolean
  currentFile: string
  maxUndoSteps: number
}

/**
 * 设置命名空间 schema(F010 设置卡片的可编辑字段)。
 *
 * 非法取值由 schema 拒绝并明确报错(如 `defaultProfile: 'weekly'`、`maxUndoSteps: 0`
 * 或非整数),不静默退化为默认值。`currentFile` 不在其中,详见文件头说明。
 */
export const SettingsConfig = z.object({
  defaultProfile: z.union(PROFILE_IDS).default('meeting')
    .description('默认场景模板:装载无 sidecar 历史的新文档时使用。'),
  autoSave: z.boolean().default(true)
    .description('自动保存:关闭后普通修改保持脏状态,需手动调用 save_document。'),
  maxUndoSteps: z.number().min(1).step(1).default(100)
    .description('撤销栈深度(整数,最小 1)。'),
})

/** 设置命名空间解析值(用户层 > 组装 `base` > schema 默认);由 schema 反推,避免手写类型漂移。 */
export type SettingsConfigValue = ReturnType<typeof SettingsConfig>

/** 运行期生效配置(内核与集成层经 `getConfig()` 读取)。 */
export interface ResolvedConfig {
  defaultProfile: string
  autoSave: boolean
  currentFile: string
  maxUndoSteps: number
}

/**
 * 解析运行期生效配置,逐字段 `??` 兜底。
 * @param base - 组装层配置(宿主可能传 `{}` 或缺字段)。
 * @param live - 设置命名空间的实时解析值;设置服务缺失时为 undefined。
 * @returns 供内核与集成层使用的生效配置。
 */
export function resolveConfig(
  base: Partial<PluginConfig> | undefined,
  live: Partial<SettingsConfigValue> | undefined,
): ResolvedConfig {
  return {
    defaultProfile: live?.defaultProfile ?? base?.defaultProfile ?? 'meeting',
    autoSave: live?.autoSave ?? base?.autoSave ?? true,
    // currentFile 只认组装层:设置文档即使写入同名字段也不改变这个集成接缝。
    currentFile: base?.currentFile ?? '',
    maxUndoSteps: live?.maxUndoSteps ?? base?.maxUndoSteps ?? 100,
  }
}
