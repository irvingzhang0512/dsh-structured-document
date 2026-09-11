/**
 * SKILL.md 装载与注册测试(需求第 19、21 章):
 * - 插件能定位并解析包内 skills/structured-document/SKILL.md
 * - frontmatter 键(name/description/when-to-use)与正文完整
 * - registerSkill 以 bundled source 注册,注册失败不阻断挂载
 */
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { loadSkill, locateSkillFile, registerSkill } from '../../src/plugin/skill.ts'

class FakeSkillRegistry {
  readonly registered: Array<Record<string, unknown>> = []
  register(skill: Record<string, unknown>): () => void {
    this.registered.push(skill)
    return () => {
      const index = this.registered.indexOf(skill)
      if (index >= 0) this.registered.splice(index, 1)
    }
  }
}

describe('SKILL.md 装载', () => {
  it('能定位包内 skills/structured-document/SKILL.md', () => {
    const path = locateSkillFile()
    expect(path).not.toBeNull()
    expect(existsSync(path!)).toBe(true)
    expect(path!.replaceAll('\\', '/')).toContain('skills/structured-document/SKILL.md')
  })

  it('解析 frontmatter:name / description / when-to-use,正文包含指代映射', () => {
    const skill = loadSkill()
    expect(skill).not.toBeNull()
    expect(skill!.name).toBe('structured-document')
    expect(skill!.description).toContain('中文自然语言')
    expect(skill!.whenToUse).toBeTruthy()
    // 核心验收:中文指代映射与歧义规则必须写进正文。
    for (const keyword of ['@selected', '@last_edited', '@last_created', 'previous_sibling', 'occurrence', 'candidates', 'MULTIPLE_NODES_FOUND', 'undo']) {
      expect(skill!.content).toContain(keyword)
    }
    // 工具清单覆盖全部 14 个工具。
    for (const tool of ['get_document', 'get_outline', 'find_node', 'select_node', 'get_selected_node', 'add_node', 'update_node', 'delete_node', 'move_node', 'reorder_node', 'change_role', 'update_property', 'undo', 'save_document']) {
      expect(skill!.content).toContain(tool)
    }
  })
})

describe('registerSkill 注册', () => {
  it('以 bundled source 注册到 ctx.skills', () => {
    const fakeSkills = new FakeSkillRegistry()
    const ctx = {
      skills: fakeSkills,
      logger: { warn: () => {} },
    } as never
    registerSkill(ctx)
    expect(fakeSkills.registered).toHaveLength(1)
    const registered = fakeSkills.registered[0]!
    expect(registered.name).toBe('structured-document')
    expect(registered.source).toBe('bundled')
    expect(typeof registered.content).toBe('string')
    expect((registered.content as string).length).toBeGreaterThan(500)
    expect(registered.whenToUse).toBeTruthy()
  })
})
