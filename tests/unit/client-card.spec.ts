/**
 * F011 设置卡外观对齐宿主卡片(浏览器半边,无 DOM 渲染器)。
 *
 * 本仓库客户端测试环境是 node,没有 jsdom / react-dom / react-test-renderer,也不为
 * 测试新增依赖。断言分两条互补路径:
 *
 * 1. **真实状态流**——用 `tests/unit/hook-runtime.ts` 的极简 hook 运行时挂载组件,
 *    点击头部按钮、编辑草稿、再收起,验证 `aria-expanded` 翻转、主体显隐,以及
 *    **收起后草稿仍在**(必须经过真实组件状态才可信)。
 * 2. **结构/样式配方断言**——把元素树拍平后核对 chrome、头部文案、三行控件类型与
 *    标签、覆盖徽标文案;样式数值按 config-ui.md §8 的配方逐条核对。
 */
import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createElement, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { SettingsCard, apply } from '../../src/client/index.tsx'
import { mount } from './hook-runtime.ts'

/** 一个拍平后的宿主元素。 */
interface Flat {
  tag: string
  props: Record<string, unknown>
  /** 该元素子树的纯文本。 */
  text: string
}

/** 取 children 数组。 */
function childArray(node: ReactNode): ReactNode[] {
  if (Array.isArray(node)) return node as ReactNode[]
  return node === null || node === undefined || typeof node === 'boolean' ? [] : [node]
}

/** 子树纯文本(文案断言用)。 */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const element = node as ReactElement & { props?: { children?: ReactNode } }
  return element.props === undefined ? '' : textOf(element.props.children)
}

/** 展开元素树:函数组件被调用(无 hook 的展示型组件),宿主标签各记一条。 */
function walk(node: ReactNode, sink: Flat[]): void {
  for (const child of childArray(node)) {
    if (child === null || child === undefined || typeof child === 'boolean') continue
    if (typeof child === 'string' || typeof child === 'number') continue
    if (Array.isArray(child)) { walk(child, sink); continue }
    const element = child as ReactElement & { props: Record<string, unknown> }
    const type = element.type as unknown
    if (typeof type === 'function') { walk((type as (p: unknown) => ReactNode)(element.props), sink); continue }
    if (typeof type === 'symbol') { walk(element.props.children as ReactNode, sink); continue }
    sink.push({ tag: String(type), props: element.props, text: textOf(element.props.children as ReactNode) })
    walk(element.props.children as ReactNode, sink)
  }
}

/** 展开整棵树。 */
function flatten(root: ReactNode): Flat[] {
  const sink: Flat[] = []
  walk(root, sink)
  return sink
}

/** 按条件找第一个元素。 */
function find(nodes: Flat[], predicate: (node: Flat) => boolean): Flat | undefined {
  return nodes.find(predicate)
}

/** 按 className 片段找元素。 */
function byClass(nodes: Flat[], fragment: string): Flat | undefined {
  return find(nodes, node => String(node.props.className ?? '').includes(fragment))
}

/** 假 settingsScope:可控快照 + 记录 mutate。 */
function makeScope(overrides: {
  user?: Record<string, unknown>
  base?: Record<string, unknown>
  value?: Record<string, unknown>
  writable?: boolean
} = {}): {
  scope: {
    getSnapshot(): unknown
    subscribe(listener: () => void): () => void
    mutate(ops: readonly unknown[], expectedRevision?: number): Promise<void>
  }
  mutations: Array<{ ops: readonly unknown[], revision: number | undefined }>
} {
  const mutations: Array<{ ops: readonly unknown[], revision: number | undefined }> = []
  const snapshot = {
    status: 'ready',
    value: overrides.value ?? { defaultProfile: 'meeting', autoSave: true, maxUndoSteps: 100 },
    base: overrides.base ?? {},
    user: overrides.user ?? {},
    revision: 7,
    writable: overrides.writable ?? true,
  }
  return {
    mutations,
    scope: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      mutate: (ops, expectedRevision) => { mutations.push({ ops, revision: expectedRevision }); return Promise.resolve() },
    },
  }
}

/** 当前渲染树(已拍平)。 */
function nodesOf(renderer: { tree: ReactElement | null }): Flat[] {
  return flatten(renderer.tree)
}

/** 用真实状态流挂载卡片(默认收起)。 */
function mountCard(scope: unknown): ReturnType<typeof mount> {
  const bound = scope as never
  return mount(() => SettingsCard({ scope: bound }))
}

/** 首屏(收起态)结构:同样经 hook 运行时,拿到真实的 hooks 首渲染结果。 */
function renderInitial(scope: unknown): Flat[] {
  return nodesOf(mountCard(scope))
}

/** 等一帧让 setState 排的重渲染跑完。 */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('F011 卡片 chrome 与折叠头部', () => {
  it('注册的 slot / key 与宿主设置命名空间一致(跨半边一致性)', async () => {
    // 浏览器半边不 import 宿主常量(纯度门禁),因此这里对照宿主侧常量断言。
    const { SETTINGS_NAMESPACE } = await import('../../src/plugin/config.ts')
    const registered: Array<{ name: string, key: string }> = []
    let boundNamespace = ''
    const ctx = {
      slots: {
        inject: (_name: string, callback: () => void) => { callback() },
        register: (spec: { name: string, key: string }, _component: unknown) => { registered.push(spec); return () => {} },
      },
      inject: (deps: string[], callback: (sctx: unknown) => void) => {
        if (deps.includes('settingsScope')) {
          callback({ settingsScope: { bind: (spec: { namespace: string }) => { boundNamespace = spec.namespace; return makeScope().scope } } })
        }
        return { then: () => {} }
      },
    }
    apply(ctx as never)
    expect(registered).toHaveLength(1)
    expect(registered[0]!.name).toBe('settings.plugin.item')
    // key 必须是宿主注册的命名空间,否则设置页永不派发这张卡片。
    expect(registered[0]!.key).toBe(SETTINGS_NAMESPACE)
    expect(registered[0]!.key).toBe('dsh-structured-document')
    expect(boundNamespace).toBe(SETTINGS_NAMESPACE)
  })

  it('外框是 section,头部是带 type=button 的按钮', () => {
    const nodes = renderInitial(makeScope().scope)
    const section = find(nodes, node => node.tag === 'section')
    expect(section).toBeDefined()
    expect(String(section!.props.className)).toContain('dsd-card')

    const header = byClass(nodes, 'dsd-head')
    expect(header).toBeDefined()
    expect(header!.tag).toBe('button')
    expect(header!.props.type).toBe('button')
  })

  it('默认收起:aria-expanded=false 且不渲染主体', () => {
    const nodes = renderInitial(makeScope().scope)
    expect(byClass(nodes, 'dsd-head')!.props['aria-expanded']).toBe(false)
    expect(byClass(nodes, 'dsd-body')).toBeUndefined()
  })

  it('点击头部展开:aria-expanded=true,主体出现且 id 等于头部 aria-controls', async () => {
    const renderer = mountCard(makeScope().scope)
    const header = byClass(nodesOf(renderer), 'dsd-head')!
    const controls = header.props['aria-controls']
    expect(typeof controls).toBe('string')
    expect(String(controls)).not.toBe('')

    // 点一下头部 → 展开。
    ;(header.props.onClick as () => void)()
    await settle()

    const after = nodesOf(renderer)
    const openedHeader = byClass(after, 'dsd-head')!
    const body = byClass(after, 'dsd-body')!
    expect(openedHeader.props['aria-expanded']).toBe(true)
    expect(body.props.id).toBe(controls)
  })

  it('头部显示插件名、版本号与副标题', () => {
    const header = byClass(renderInitial(makeScope().scope), 'dsd-head')!
    expect(header.text).toContain('结构化文档')
    // 版本号来自构建期注入的 __DSD_VERSION__;未注入(直接跑源码)时为占位串。
    expect(header.text).toMatch(/v\d+\.\d+\.\d+/)
    expect(header.text).toContain('默认场景模板')
  })

  it('版本号不在源码里硬编码,由构建期从 package.json 注入', async () => {
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
    const client = await readFile(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    const build = await readFile(new URL('../../tsdown.config.ts', import.meta.url), 'utf8')
    // 客户端源码不得出现与包版本相同的字面量(否则发版必然漂移)。
    expect(client).not.toContain(`'${pkg.version}'`)
    expect(client).not.toContain(`"${pkg.version}"`)
    // 构建配置从 package.json 读取版本并 define 注入。
    expect(build).toContain('__DSD_VERSION__')
    expect(build).toContain('package.json')
    // 升级包版本后，实际客户端产物仍需显示同一个构建期版本。
    const bundle = await readFile(new URL('../../lib/client.js', import.meta.url), 'utf8')
    expect(bundle).toContain(JSON.stringify(pkg.version))
  })
})

describe('F011 覆盖状态徽标随用户层变化', () => {
  it('用户层无字段时显示「继承组装层」', () => {
    const badge = byClass(renderInitial(makeScope({ user: {} }).scope), 'dsd-badge')
    expect(badge).toBeDefined()
    expect(badge!.text).toContain('继承组装层')
  })

  it('用户层出现字段时显示「用户覆盖」', () => {
    const badge = byClass(renderInitial(makeScope({ user: { maxUndoSteps: 5 } }).scope), 'dsd-badge')
    expect(badge!.text).toContain('用户覆盖')
  })

  it('覆盖判定看字段是否出现在用户层,不比较值(F010 语义不变)', () => {
    const badge = byClass(renderInitial(makeScope({
      base: { defaultProfile: 'meeting' },
      user: { defaultProfile: 'meeting' },
    }).scope), 'dsd-badge')
    expect(badge!.text).toContain('用户覆盖')
  })
})

describe('F011 三行控件与标签', () => {
  /** 展开后的元素列表。 */
  async function expandedNodes(scope: unknown): Promise<Flat[]> {
    const renderer = mountCard(scope)
    ;(byClass(nodesOf(renderer), 'dsd-head')!.props.onClick as () => void)()
    await settle()
    return nodesOf(renderer)
  }

  it('三行各有一个标签(标签 + 说明)', async () => {
    const nodes = await expandedNodes(makeScope().scope)
    const labels = nodes.filter(node => String(node.props.className ?? '') === 'dsd-label')
    expect(labels.map(node => node.text)).toEqual(['默认场景模板', '自动保存', '撤销栈深度'])
    const hints = nodes.filter(node => String(node.props.className ?? '').startsWith('dsd-hint'))
    expect(hints.length).toBeGreaterThanOrEqual(3)
  })

  it('默认场景模板:下拉,选项为会议纪要 / 项目管理 / 思路整理', async () => {
    const nodes = await expandedNodes(makeScope().scope)
    const select = find(nodes, node => node.props.id === 'dsd-profile')
    expect(select).toBeDefined()
    expect(select!.tag).toBe('select')
    const options = nodes.filter(node => node.tag === 'option').map(node => node.text)
    expect(options).toEqual(['会议纪要', '项目管理', '思路整理'])
  })

  it('自动保存:switch 角色开关,aria-checked 反映当前值', async () => {
    const on = find(await expandedNodes(makeScope().scope), node => node.props.id === 'dsd-autosave')
    expect(on).toBeDefined()
    expect(on!.props.role).toBe('switch')
    expect(on!.props['aria-checked']).toBe(true)

    const off = find(await expandedNodes(
      makeScope({ value: { defaultProfile: 'meeting', autoSave: false, maxUndoSteps: 100 } }).scope,
    ), node => node.props.id === 'dsd-autosave')
    expect(off!.props['aria-checked']).toBe(false)
  })

  it('撤销栈深度:数字输入,最小 1', async () => {
    const undo = find(await expandedNodes(makeScope().scope), node => node.props.id === 'dsd-undo')
    expect(undo).toBeDefined()
    expect(undo!.tag).toBe('input')
    expect(undo!.props.type).toBe('number')
    expect(undo!.props.min).toBe(1)
    expect(undo!.props.step).toBe(1)
    expect(undo!.props.value).toBe('100')
  })

  it('切换自动保存会暂存草稿并更新 aria-checked', async () => {
    const scope = makeScope()
    const renderer = mountCard(scope.scope)
    ;(byClass(nodesOf(renderer), 'dsd-head')!.props.onClick as () => void)()
    await settle()

    const toggle = find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!
    ;(toggle.props.onClick as () => void)()
    await settle()

    const after = find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!
    expect(after.props['aria-checked']).toBe(false)
    // 草稿尚未落盘:没有 mutate 调用。
    expect(scope.mutations).toHaveLength(0)
  })

  it('控件在行内右对齐:行 flex,标签列 flex:1 且控件 flex:none(样式配方)', async () => {
    const client = await readFile(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    // 行:flex + align-items:center + gap:12px + padding:12px 0。
    expect(client).toMatch(/\.dsd-row\{display:flex;align-items:center;gap:12px;padding:12px 0\}/)
    // 行间分隔线:相邻行加 border-top(宿主用 .5px)。
    expect(client).toMatch(/\.dsd-row\+\.dsd-row\{border-top:\.5px solid var\(--dsw-alias-border-l2/)
    // 标签列 column + flex:1 + min-width:0(窄宽度不重叠)。
    expect(client).toMatch(/\.dsd-label-box\{display:flex;flex-direction:column;flex:1;gap:3px;min-width:0\}/)
    // 控件 flex:none(右对齐,不被标签挤走)。
    expect(client).toMatch(/\.dsd-input\{flex:none/)
    expect(client).toMatch(/\.dsd-switch\{flex:none/)
    // 窄宽度兜底:输入框限宽,不溢出。
    expect(client).toMatch(/\.dsd-input\{[^}]*max-width:40%/)
    // 卡片 chrome 以**宿主真实数值**为准:.5px + border-l4 + radius:16px。
    expect(client).toMatch(/\.dsd-card\{display:block;min-width:0;border:\.5px solid var\(--dsw-alias-border-l4/)
    expect(client).toMatch(/\.dsd-card\{[^}]*border-radius:16px/)
    // 展开态:bg-layer-2 + border-color 用 label-dimmed。
    expect(client).toMatch(/\.dsd-card-open\{background:var\(--dsw-alias-bg-layer-2[^}]*border-color:var\(--dsw-alias-label-dimmed/)
    expect(client).toMatch(/\.dsd-body\{border-top:\.5px solid var\(--dsw-alias-border-l2[^}]*margin:0 16px;padding-bottom:8px\}/)
    // 头部:flex + gap:12px + padding:14px 16px。
    expect(client).toMatch(/\.dsd-head\{[^}]*display:flex;align-items:center;gap:12px;padding:14px 16px\}/)
    // chevron 展开旋转 180°。
    expect(client).toMatch(/\.dsd-chevron-open\{transform:rotate\(180deg\)\}/)
  })
})

describe('F011 保存与放弃在右下角操作行', () => {
  it('操作行在主体内,含放弃修改与保存按钮', async () => {
    const scope = makeScope()
    const renderer = mountCard(scope.scope)
    ;(byClass(nodesOf(renderer), 'dsd-head')!.props.onClick as () => void)()
    await settle()

    const footer = byClass(nodesOf(renderer), 'dsd-footer')
    expect(footer).toBeDefined()
    expect(footer!.text).toContain('放弃修改')
    expect(footer!.text).toContain('保存')
  })

  it('保存按钮提交带 revision 栅栏的 mutation(F010 保存模型不变)', async () => {
    const scope = makeScope()
    const renderer = mountCard(scope.scope)
    ;(byClass(nodesOf(renderer), 'dsd-head')!.props.onClick as () => void)()
    await settle()
    // 暂存一次编辑使卡片变 dirty。
    ;(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props.onClick as () => void)()
    await settle()

    const save = byClass(nodesOf(renderer), 'dsd-save')!
    expect(save.props.disabled).toBe(false)
    ;(save.props.onClick as () => void)()
    await settle()

    expect(scope.mutations).toHaveLength(1)
    expect(scope.mutations[0]!.revision).toBe(7)
    expect(scope.mutations[0]!.ops).toEqual([{ op: 'set', path: ['autoSave'], value: false }])
  })

  it('操作行样式:border-top + justify-content:flex-end + gap:8px + padding:12px 0 4px', async () => {
    const client = await readFile(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).toMatch(/\.dsd-footer\{display:flex;justify-content:flex-end;align-items:center;gap:8px;border-top:\.5px solid var\(--dsw-alias-border-l2[^}]*padding:12px 0 4px\}/)
  })
})

describe('F011 收起不丢草稿、组件保持挂载', () => {
  it('编辑草稿 → 收起 → 再展开,草稿仍在(组件未被卸载)', async () => {
    const scope = makeScope()
    const renderer = mountCard(scope.scope)
    const header = () => byClass(nodesOf(renderer), 'dsd-head')!

    // 展开并改一个字段(自动保存 true → false)。
    ;(header().props.onClick as () => void)()
    await settle()
    ;(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props.onClick as () => void)()
    await settle()
    expect(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props['aria-checked']).toBe(false)

    // 收起:主体消失,头部仍在。
    ;(header().props.onClick as () => void)()
    await settle()
    expect(header().props['aria-expanded']).toBe(false)
    expect(byClass(nodesOf(renderer), 'dsd-body')).toBeUndefined()

    // 再展开:草稿仍在(未被收起清掉)。
    ;(header().props.onClick as () => void)()
    await settle()
    expect(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props['aria-checked']).toBe(false)
    // 收起期间没有发生任何写入。
    expect(scope.mutations).toHaveLength(0)
  })

  it('放弃修改清空草稿并回到已存值', async () => {
    const scope = makeScope()
    const renderer = mountCard(scope.scope)
    ;(byClass(nodesOf(renderer), 'dsd-head')!.props.onClick as () => void)()
    await settle()
    ;(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props.onClick as () => void)()
    await settle()

    ;(byClass(nodesOf(renderer), 'dsd-discard')!.props.onClick as () => void)()
    await settle()
    expect(find(nodesOf(renderer), node => node.props.id === 'dsd-autosave')!.props['aria-checked']).toBe(true)
    expect(scope.mutations).toHaveLength(0)
  })
})

describe('F011 客户端纯度与主题令牌', () => {
  it('卡片 chrome 以宿主 PluginCard 的真实数值为准(.5px + border-l4 + radius:16px)', async () => {
    const client = await readFile(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    const card = /\.dsd-card\{([^}]*)\}/.exec(client)?.[1] ?? ''
    // 与宿主 PluginCard.module.css 的 .card 规则逐项一致。
    expect(card).toContain('border:.5px solid var(--dsw-alias-border-l4,')
    expect(card).toContain('background:var(--dsw-alias-bg-layer-3,')
    expect(card).toContain('border-radius:16px')
    // 展开态:bg-layer-2 + border-color:label-dimmed。
    const open = /\.dsd-card-open\{([^}]*)\}/.exec(client)?.[1] ?? ''
    expect(open).toContain('background:var(--dsw-alias-bg-layer-2,')
    expect(open).toContain('border-color:var(--dsw-alias-label-dimmed,')
    // 不得残留市场近似值(1px + border-l2 + radius:12px)。
    expect(card).not.toContain('border:1px')
    expect(card).not.toContain('border-radius:12px')
    expect(card).not.toContain('--dsw-alias-border-l2')
  })

  it('不 import 宿主设置插件的值(纯度门禁),只用真实存在的 dsw-alias 令牌', async () => {
    const client = await readFile(new URL('../../src/client/index.tsx', import.meta.url), 'utf8')
    expect(client).not.toMatch(/^import\s+(?!type)[^\n]*@deepseek-ai\//m)
    // 只用已核实的令牌,且都带兜底值。兜底值取自 dsh-client-ui-theme 的实际定义。
    const allowed = new Set([
      '--dsw-alias-border-l4', '--dsw-alias-border-l2', '--dsw-alias-label-dimmed',
      '--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-3', '--dsw-alias-label-primary',
      '--dsw-alias-label-secondary', '--dsw-alias-label-tertiary', '--dsw-alias-label-error',
      '--dsw-alias-brand-primary',
    ])
    const used = [...client.matchAll(/var\((--dsw-alias-[a-z0-9-]+)/g)].map(match => match[1]!)
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) expect(allowed.has(token), `未核实的令牌:${token}`).toBe(true)
    // 每个 var() 都带兜底值。
    expect([...client.matchAll(/var\(--dsw-alias-[a-z0-9-]+\)/g)]).toEqual([])
  })
})
