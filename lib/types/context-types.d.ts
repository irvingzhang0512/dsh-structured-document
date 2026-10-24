/**
 * 宿主侧 Context 形状(结构化镜像,模式与 dsh-better-sidebar-controller 一致):
 * 类型基座是 @deepseek-ai/cordis 的 Context,本插件用到的服务成员用 intersection
 * 合并(不用 declare module 重声明,避免与 DSH 自身的接口增强冲突 TS2717)。
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { SkillRegistration } from '@deepseek-ai/dsh-skill';
import type { SettingsConfigValue } from './plugin/config.ts';
/** 本插件使用的工具注册表服务面。 */
export interface ToolsService {
    register(tool: ToolDefinition): () => void;
}
/** 本插件使用的 skill 注册表服务面(ctx.skills 由 @deepseek-ai/dsh-skill 提供)。 */
export interface SkillsService {
    register(skill: SkillRegistration): () => void;
}
/** 已发布的会话行(权威 cwd 在 header 上)。 */
export interface SessionHeader {
    cwd?: string;
}
/** 本插件使用的会话存储服务面。 */
export interface SessionsService {
    get(sessionId: string): {
        header?: SessionHeader;
    } | undefined;
}
/** 本插件宿主侧看到的 Context。 */
export interface StructuredDocumentContextShape {
    sessionController?: import('./session-directory.ts').SessionDirectoryContext['sessionController'];
    tools: ToolsService;
    skills: SkillsService;
    sessions: SessionsService;
    logger?: {
        warn?(message: string): void;
        info?(message: string): void;
        error?(message: string): void;
    };
}
/** 设置命名空间 owner 的读取面(本插件只读实时解析值,不 watch)。 */
export interface SettingsScopeFace<T> {
    /** 当前解析值:schema 默认 → 组装 base → 用户层。 */
    get(): T;
}
/**
 * 本插件使用的设置服务面 —— `@deepseek-ai/dsh-settings` 的结构镜像。
 *
 * 只声明确实用到的 `register`,`settings` 因此是**软依赖**:不进入口 `inject`。
 * 不 import 该包,避免把宿主设置服务变成必需依赖(peer 未安装时仍可编译)。
 *
 * `base` 的键收紧为设置 schema 的字段名、值放宽为 unknown:宿主 provider 会把
 * `base` 与用户层合并后交给 schema 校验(dsh-settings 的 `resolve`),所以值的
 * 合法性由 schema 判定;但键必须在命名空间内 —— `currentFile` 因此无法被误传
 * 进设置命名空间(那是只属于组装层的集成接缝)。
 */
export interface SettingsServiceFace {
    register(ns: string, schema: unknown, options: {
        base?: Partial<Record<keyof SettingsConfigValue, unknown>>;
        applies?: 'live' | 'restart';
    }): SettingsScopeFace<SettingsConfigValue>;
}
/**
 * `ctx.inject(['settings'], sctx => …)` 回调收到的子 context:
 * 设置服务在场时才回调,缺服务时回调不发生。
 */
export interface SettingsConsumerContext {
    settings?: SettingsServiceFace;
    effect(fn: () => (() => void) | void, label?: string): unknown;
}
export type Context = CordisContext & StructuredDocumentContextShape;
