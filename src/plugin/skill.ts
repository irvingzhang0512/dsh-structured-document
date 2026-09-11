/**
 * SKILL.md 装载与注册:插件挂载时把包内 skills/structured-document/SKILL.md
 * 注册为 bundled skill(ctx.skills.register),让模型通过 skill 系统学会
 * 用中文自然语言调用本插件的结构化文档工具。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { Context } from '../context-types.ts'

/** 解析后的 skill 文件。 */
export interface LoadedSkill {
  name: string
  description: string
  whenToUse?: string
  content: string
  path: string
  resourceBase: string
}

/** 定位包内 SKILL.md(兼容 lib/index.js 与 src 直跑两种布局)。 */
export function locateSkillFile(): string | null {
  try {
    const require = createRequire(import.meta.url)
    const pkgJson = require.resolve('../package.json')
    return join(dirname(pkgJson), 'skills', 'structured-document', 'SKILL.md')
  } catch {
    // createRequire 解析失败(如打包内联):退回 import.meta.url 相对定位。
    try {
      const here = fileURLToPath(import.meta.url)
      // <pkg>/dist/index.js 或 <pkg>/src/plugin/skill.ts 都向上回溯到包根。
      let dir = dirname(here)
      for (let i = 0; i < 4; i += 1) {
        const candidate = join(dir, 'skills', 'structured-document', 'SKILL.md')
        try {
          readFileSync(candidate, 'utf8')
          return candidate
        } catch {
          dir = dirname(dir)
        }
      }
      return null
    } catch {
      return null
    }
  }
}

/** 极简 YAML frontmatter 解析(name/description/when-to-use 三个键)。 */
function parseFrontmatter(raw: string): { data: Record<string, string>, body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (match === null) return { data: {}, body: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.trim())
    if (kv !== null) data[kv[1]] = kv[2].trim()
  }
  return { data, body: raw.slice(match[0].length) }
}

/** 读取并解析 SKILL.md;文件缺失或损坏返回 null(不阻断插件挂载)。 */
export function loadSkill(): LoadedSkill | null {
  const path = locateSkillFile()
  if (path === null) return null
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  const { data, body } = parseFrontmatter(raw)
  const name = typeof data.name === 'string' && data.name !== '' ? data.name : 'structured-document'
  const description = typeof data.description === 'string' && data.description !== ''
    ? data.description
    : '用中文自然语言读取、定位、修改和重组结构化文档(会议纪要 / 项目管理 / 思路整理)。'
  return {
    name,
    description,
    whenToUse: data['when-to-use'] !== undefined && data['when-to-use'] !== '' ? data['when-to-use'] : undefined,
    content: body.trim() + '\n',
    path,
    resourceBase: dirname(path),
  }
}

/** 把 SKILL.md 注册到 ctx.skills;失败只告警不抛错。 */
export function registerSkill(ctx: Context): void {
  const skill = loadSkill()
  if (skill === null) {
    ctx.logger?.warn?.('[dsh-structured-document] 未找到 skills/structured-document/SKILL.md,跳过 skill 注册。')
    return
  }
  try {
    ctx.skills.register({
      name: skill.name,
      description: skill.description,
      ...(skill.whenToUse !== undefined ? { whenToUse: skill.whenToUse } : {}),
      content: skill.content,
      source: 'bundled',
      path: skill.path,
      resourceBase: { kind: 'directory', path: skill.resourceBase },
    })
  } catch (error) {
    ctx.logger?.warn?.(`[dsh-structured-document] skill 注册失败:${error instanceof Error ? error.message : String(error)}`)
  }
}
