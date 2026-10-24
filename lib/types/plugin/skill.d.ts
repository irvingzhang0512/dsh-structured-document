import type { Context } from '../context-types.ts';
/** 解析后的 skill 文件。 */
export interface LoadedSkill {
    name: string;
    description: string;
    whenToUse?: string;
    content: string;
    path: string;
    resourceBase: string;
}
/** 定位包内 SKILL.md(兼容 lib/index.js 与 src 直跑两种布局)。 */
export declare function locateSkillFile(): string | null;
/** 读取并解析 SKILL.md;文件缺失或损坏返回 null(不阻断插件挂载)。 */
export declare function loadSkill(): LoadedSkill | null;
/** 把 SKILL.md 注册到 ctx.skills;失败只告警不抛错。 */
export declare function registerSkill(ctx: Context): void;
