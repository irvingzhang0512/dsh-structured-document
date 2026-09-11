/**
 * 端到端:SKILL 随插件自动安装验证。
 *
 * 用真实 cordis Context + 真实 @deepseek-ai/dsh-skill 的 SkillRegistry 挂载本插件
 * (与 DSH 宿主相同的挂载方式:对象插件 { name/inject/Config/apply }),
 * 验证:
 *   1. 插件挂载后 skill 立即出现在 ctx.skills 目录(model 可见);
 *   2. ctx.skills.get 能取到完整 SKILL.md 正文与元数据;
 *   3. 14 个工具随同一插件一并注册;
 *   4. 插件卸载(dispose)时 skill 与工具一并自动注销——无残留、无单独卸载步骤。
 */
import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import SkillRegistry, { isSkillName } from '@deepseek-ai/dsh-skill'
import * as plugin from '../../src/index.ts'

/** 最小 tools 服务(与 dsh-tools ToolRegistry 的 register 契约对齐)。 */
class FakeTools extends Service {
  readonly registered = new Map<string, { name: string }>()
  constructor(ctx: Context) {
    super(ctx, 'tools')
  }
  register(tool: { name: string }): () => void {
    this.registered.set(tool.name, tool)
    return () => {
      this.registered.delete(tool.name)
    }
  }
}

/** 最小 sessions 服务(插件只防御式读取)。 */
class FakeSessions extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }
  get(_id: string): undefined {
    return undefined
  }
}

async function mountHost() {
  const ctx = new Context()
  const tools = new FakeTools(ctx)
  new FakeSessions(ctx)
  new SkillRegistry(ctx)
  // 与 DSH 宿主一致:对象插件 + Config 校验;await 确保 fiber 完全启动。
  const fiber = ctx.plugin(plugin as never, {
    defaultProfile: 'meeting',
    autoSave: true,
    currentFile: '',
    maxUndoSteps: 100,
  })
  await fiber
  return { ctx, tools, fiber }
}

describe('SKILL 随插件自动安装', () => {
  it('插件挂载后 skill 出现在 ctx.skills 目录,无需任何额外步骤', async () => {
    const { ctx } = await mountHost()
    try {
      expect(isSkillName('structured-document')).toBe(true)
      const skills = await ctx.skills.list()
      const skill = skills.find((entry) => entry.name === 'structured-document')
      expect(skill, 'skill 应已注册进全局目录').toBeDefined()
      expect(skill!.source).toBe('bundled')
      expect(skill!.whenToUse).toBeTruthy()
      expect(skill!.invocation.modelInvocable).toBe(true)

      const loaded = await ctx.skills.get('structured-document')
      expect(loaded).toBeDefined()
      expect(loaded!.content).toContain('@last_created')
      expect(loaded!.content).toContain('MULTIPLE_NODES_FOUND')
    } finally {
      await (ctx as unknown as { destroy(): Promise<void> }).destroy?.()
    }
  })

  it('14 个工具与 skill 同一插件同一生命周期', async () => {
    const { ctx, tools } = await mountHost()
    try {
      expect(tools.registered.size).toBe(14)
      expect(tools.registered.has('structured_document')).toBe(false)
    } finally {
      await (ctx as unknown as { destroy(): Promise<void> }).destroy?.()
    }
  })

  it('插件卸载时 skill 与工具一并自动注销', async () => {
    const { ctx, tools, fiber } = await mountHost()
    await fiber.dispose()
    const skills = await ctx.skills.list()
    expect(skills.find((entry) => entry.name === 'structured-document')).toBeUndefined()
    expect(tools.registered.size).toBe(0)
  })
})
