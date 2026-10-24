/**
 * 场景模板(Profile):为文档提供角色(Role)与属性(Properties)的推荐范围。
 *
 * V0.1 内置三类模板(requirements.md 第 5、9 章):
 *   meeting   会议纪要
 *   project   项目管理
 *   thinking  思路整理
 *
 * 每个模板额外内置通用角色 note(笔记)作为默认角色:从既有 Markdown 解析出的
 * 节点在没有明确角色依据时一律记为 note,保证任意结构化文档都能无损装载。
 */
import type { ProfileDefinition } from '../model/types.ts';
/** 会议纪要模板(meeting)。 */
export declare const MEETING_PROFILE: ProfileDefinition;
/** 项目管理模板(project)。 */
export declare const PROJECT_PROFILE: ProfileDefinition;
/** 思路整理模板(thinking)。 */
export declare const THINKING_PROFILE: ProfileDefinition;
/** 全部内置模板。 */
export declare const BUILTIN_PROFILES: readonly ProfileDefinition[];
/** 按模板 ID 取模板;不存在返回 undefined。 */
export declare function getProfile(id: string): ProfileDefinition | undefined;
/** 规范化模板 ID:兼容中文别名(会议纪要/项目管理/思路整理)。 */
export declare function normalizeProfileId(id: string): string | undefined;
/** 取模板;模板不存在抛 INVALID_OPERATION(模板是文档的配置,不存在属于配置错误)。 */
export declare function requireProfile(id: string): ProfileDefinition;
