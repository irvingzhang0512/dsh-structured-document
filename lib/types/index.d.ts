import type { Context } from './context-types.ts';
import { Config, type PluginConfig } from './plugin/config.ts';
/** 插件标识(cordis.yml 行)。 */
export declare const name = "dsh-structured-document";
/**
 * 挂载前需要就绪的服务:工具注册表、skill 注册表、会话存储(权威 cwd)。
 *
 * `settings` **故意不在这里** —— cordis 把入口 `inject` 当硬前置,任一服务不可用
 * 都会让 fiber 不激活并卸载,插件的 `apply` 根本不会被调用。设置服务是软依赖,
 * 用 `ctx.inject(['settings'], …)` 在服务可用时接入(F010;见 docs/architecture.md
 * 的「配置契约」)。
 */
export declare const inject: string[];
export { Config };
export type { StructuredDocumentService, DocumentSnapshot } from './integration/service.ts';
export type { WorkspaceChange } from './state/kernel.ts';
/**
 * 插件主体:注册工具与 skill,挂载按会话隔离的文档工作区。
 * @param ctx - 宿主插件 context(tools/skills/sessions)。
 * @param baseConfig - schemastery 解析后的插件配置。
 */
export declare function apply(ctx: Context, baseConfig?: PluginConfig): void;
export default apply;
