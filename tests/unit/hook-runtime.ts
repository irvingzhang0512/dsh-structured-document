/**
 * 极小的 React hook 运行时(仅测试用,不引入任何依赖)。
 *
 * 本仓库客户端测试环境是 node,没有 jsdom / react-dom / react-test-renderer,也不为
 * 测试新增依赖。但 F011 的关键断言(头部 `aria-expanded` 翻转、收起后草稿仍在)必须
 * 经过真实的组件状态流才可信,所以这里实现一个够用的 dispatcher:
 *
 * - `useState`:按调用顺序存在组件的 hook 槽里,`setState` 触发一次重渲染;
 * - `useEffect`:首渲染后按依赖数组浅比较决定是否执行(清理函数在下一次执行前调用);
 * - `useId`:返回稳定且随实例递增的 id(断言 `aria-controls` 关联用)。
 *
 * React 只要求 `ReactCurrentDispatcher.current` 指向一个实现了这些方法的对象;元素
 * 仍由真实的 `react` 包创建,JSX 形态与运行时一致。
 */
import React, { createElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

/** 一个已挂载的测试渲染器。 */
export interface TestRenderer {
  /** 当前渲染出的元素树。 */
  readonly tree: ReactElement | null
  /** 触发一次重渲染(会按依赖比较决定是否跑 effect)。 */
  render(): void
  /** 卸载:调用仍挂载的 effect 清理函数。 */
  unmount(): void
}

/** hook 槽位(按调用顺序)。 */
interface HookSlot {
  kind: 'state' | 'effect' | 'id'
  value?: unknown
  deps?: readonly unknown[]
  cleanup?: (() => void) | void
}

/** 依赖数组浅比较。 */
function sameDeps(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (a === undefined || b === undefined) return false
  if (a.length !== b.length) return false
  return a.every((item, index) => Object.is(item, b[index]))
}

/** monomorphic 的 React dispatcher 替身。 */
interface Dispatcher {
  useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void]
  useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]): void
  useId(): string
  useCallback<T>(fn: T, deps: readonly unknown[]): T
  useMemo<T>(factory: () => T, deps: readonly unknown[]): T
  useRef<T>(initial: T): { current: T }
}

let idCounter = 0

/**
 * 挂载一个组件并返回可控渲染器。
 * @param Component - 无 props 的组件(需要传参时用闭包包一层)。
 * @returns 渲染器。
 */
export function mount(Component: () => ReactNode): TestRenderer {
  const slots: HookSlot[] = []
  let cursor = 0
  let tree: ReactElement | null = null
  let scheduled = false
  const id = `test-${++idCounter}`

  const instance = {
    get tree() { return tree },
    render,
    unmount,
  }

  const dispatcher: Dispatcher = {
    useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void] {
      const index = cursor++
      let slot = slots[index]
      if (slot === undefined) {
        slot = { kind: 'state', value: typeof initial === 'function' ? (initial as () => S)() : initial }
        slots[index] = slot
      }
      const setState = (value: S | ((prev: S) => S)): void => {
        const prev = slot!.value as S
        slot!.value = typeof value === 'function' ? (value as (p: S) => S)(prev) : value
        // 组件外调用 setState 时排一次重渲染(与 React 的批处理语义等价)。
        if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; render() }) }
      }
      return [slot.value as S, setState]
    },
    useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]): void {
      const index = cursor++
      let slot = slots[index]
      if (slot === undefined) {
        slot = { kind: 'effect', deps: undefined, cleanup: undefined }
        slots[index] = slot
      }
      if (sameDeps(slot.deps, deps)) return
      slot.cleanup?.()
      slot.deps = deps
      slot.cleanup = effect()
    },
    useId(): string { cursor++; return id },
    useCallback<T>(fn: T, deps: readonly unknown[]): T {
      const index = cursor++
      let slot = slots[index]
      if (slot === undefined || !sameDeps(slot.deps, deps)) {
        slot = { kind: 'effect', value: fn, deps }
        slots[index] = slot
      }
      return slot.value as T
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
      const index = cursor++
      let slot = slots[index]
      if (slot === undefined || !sameDeps(slot.deps, deps)) {
        slot = { kind: 'effect', value: factory(), deps }
        slots[index] = slot
      }
      return slot.value as T
    },
    useRef<T>(initial: T): { current: T } {
      const index = cursor++
      let slot = slots[index]
      if (slot === undefined) { slot = { kind: 'effect', value: { current: initial } }; slots[index] = slot }
      return slot.value as { current: T }
    },
  }

  /** 安装 dispatcher:React 通过 internals 读取当前 dispatcher。 */
  function install(): () => void {
    const internals = (React as unknown as {
      __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: { ReactCurrentDispatcher?: { current: unknown } }
    }).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    const holder = internals?.ReactCurrentDispatcher
    if (holder === undefined) throw new Error('测试运行时:拿不到 ReactCurrentDispatcher')
    const previous = holder.current
    holder.current = dispatcher
    return () => { holder.current = previous }
  }

  function render(): void {
    cursor = 0
    const restore = install()
    try {
      // createElement 只构造元素、不执行组件;dispatcher 就位后手动调用组件函数,
      // 拿到真实的(带 props / children 的)元素树。
      tree = (Component as () => ReactNode)() as ReactElement | null
    } finally {
      restore()
    }
  }

  function unmount(): void {
    for (const slot of slots) slot.cleanup?.()
  }

  render()
  return instance
}

/** 供测试引用(避免未使用告警)。 */
export { createElement }
