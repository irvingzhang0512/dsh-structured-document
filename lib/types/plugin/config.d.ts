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
import z from '@deepseek-ai/schemastery';
/** 设置命名空间 = 包名(设置文档分节键、设置卡片 slot key、客户端 bundle id 三者一致)。 */
export declare const SETTINGS_NAMESPACE = "dsh-structured-document";
/** `defaultProfile` 的合法取值(设置卡片 select 与设置 schema 共用同一份字面量)。 */
export declare const PROFILE_IDS: readonly ["meeting", "project", "thinking"];
/** 场景模板标识。 */
export type ProfileId = (typeof PROFILE_IDS)[number];
/** 组装层配置(插件行 `cordis.patch.yml` 的 `config`):`currentFile` 只在这一层。 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    defaultProfile: z<string, string, "defined">;
    autoSave: z<boolean, boolean, "defined">;
    currentFile: z<string, string, "defined">;
    maxUndoSteps: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    defaultProfile: z<string, string, "defined">;
    autoSave: z<boolean, boolean, "defined">;
    currentFile: z<string, string, "defined">;
    maxUndoSteps: z<number, number, "defined">;
}>>, "plain">;
export type PluginConfig = {
    defaultProfile: string;
    autoSave: boolean;
    currentFile: string;
    maxUndoSteps: number;
};
/**
 * 设置命名空间 schema(F010 设置卡片的可编辑字段)。
 *
 * 非法取值由 schema 拒绝并明确报错(如 `defaultProfile: 'weekly'`、`maxUndoSteps: 0`
 * 或非整数),不静默退化为默认值。`currentFile` 不在其中,详见文件头说明。
 */
export declare const SettingsConfig: z<Schemastery.ObjectS<NoInfer<{
    defaultProfile: z<"meeting" | "project" | "thinking", "meeting" | "project" | "thinking", "defined">;
    autoSave: z<boolean, boolean, "defined">;
    maxUndoSteps: z<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    defaultProfile: z<"meeting" | "project" | "thinking", "meeting" | "project" | "thinking", "defined">;
    autoSave: z<boolean, boolean, "defined">;
    maxUndoSteps: z<number, number, "defined">;
}>>, "plain">;
/** 设置命名空间解析值(用户层 > 组装 `base` > schema 默认);由 schema 反推,避免手写类型漂移。 */
export type SettingsConfigValue = ReturnType<typeof SettingsConfig>;
/** 运行期生效配置(内核与集成层经 `getConfig()` 读取)。 */
export interface ResolvedConfig {
    defaultProfile: string;
    autoSave: boolean;
    currentFile: string;
    maxUndoSteps: number;
}
/**
 * 解析运行期生效配置,逐字段 `??` 兜底。
 * @param base - 组装层配置(宿主可能传 `{}` 或缺字段)。
 * @param live - 设置命名空间的实时解析值;设置服务缺失时为 undefined。
 * @returns 供内核与集成层使用的生效配置。
 */
export declare function resolveConfig(base: Partial<PluginConfig> | undefined, live: Partial<SettingsConfigValue> | undefined): ResolvedConfig;
