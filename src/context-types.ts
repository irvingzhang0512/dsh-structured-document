/**
 * 宿主侧 Context 形状(结构化镜像,模式与 dsh-better-sidebar-controller 一致):
 * 类型基座是 @deepseek-ai/cordis 的 Context,本插件用到的服务成员用 intersection
 * 合并(不用 declare module 重声明,避免与 DSH 自身的接口增强冲突 TS2717)。
 */
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { SkillRegistration } from '@deepseek-ai/dsh-skill'

/** 本插件使用的工具注册表服务面。 */
export interface ToolsService {
  register(tool: ToolDefinition): () => void
}

/** 本插件使用的 skill 注册表服务面(ctx.skills 由 @deepseek-ai/dsh-skill 提供)。 */
export interface SkillsService {
  register(skill: SkillRegistration): () => void
}

/** 已发布的会话行(权威 cwd 在 header 上)。 */
export interface SessionHeader {
  cwd?: string
}

/** 本插件使用的会话存储服务面。 */
export interface SessionsService {
  get(sessionId: string): { header?: SessionHeader } | undefined
}

/** 本插件宿主侧看到的 Context。 */
export interface StructuredDocumentContextShape {
  tools: ToolsService
  skills: SkillsService
  sessions: SessionsService
  logger?: {
    warn?(message: string): void
    info?(message: string): void
    error?(message: string): void
  }
}

export type Context = CordisContext & StructuredDocumentContextShape
