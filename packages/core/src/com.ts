/**
 * com - 组件包装器
 *
 * 生产路径：创建 effectScope，mount，返回 unmount
 * 开发路径：额外实例追踪 + HMR clean remount（__DEV__=false 时被 DCE）
 */

import { getReactiveRuntime } from './reactive'
import { hmrState, getRegistryEntry, setRegistryEntry } from './hmr'
import type { HostContext } from './host-context'

export type MountFn = (host: unknown) => (() => void) | undefined
export type Scope = { run: <T>(fn: () => T) => T | undefined; stop: () => void }

declare const __DEV__: boolean | undefined

// ── HostContext 作用域栈 ────────────────────────────────────────────────
// 由 com 内部托管：挂载时压栈（继承或覆盖），mount 执行后弹出。
// 子组件在父 mount 的同步递归中挂载，自动读到栈顶 = 父上下文。
// 不暴露给用户——结构性组件（each/when）通过 useHostContext() 获取，
// 桥接组件（canvas）通过 provideHostContext() 覆盖子树上下文。
const ctxStack: Array<HostContext | undefined> = []

/**
 * 获取当前生效的宿主上下文（挂载期间调用）
 * 供结构性组件（each/when/match）内部使用，用户无需感知。
 */
export function getHostContext(): HostContext | undefined {
  return ctxStack.length ? ctxStack[ctxStack.length - 1] : undefined
}

/**
 * 在指定上下文中执行 fn（压栈/还原）
 * 供桥接组件（如 canvas 切换宿主能力）覆盖子树上下文。
 */
export function provideHostContext<T, H = unknown, N = unknown>(
  ctx: HostContext<H, N> | undefined,
  fn: () => T
): T {
  ctxStack.push(ctx as HostContext | undefined)
  try {
    return fn()
  } finally {
    ctxStack.pop()
  }
}

export function wrapMount(mount: MountFn, scope: Scope) {
  return (host: unknown) => {
    // 生效上下文 = 继承栈顶（挂载时同步捕获）
    const effective = getHostContext()
    let unmount: (() => void) | undefined
    provideHostContext(effective, () => {
      scope.run(() => { unmount = mount(host) })
    })
    const wrappedUnmount = () => { unmount?.(); scope.stop() }
    if (unmount && 'node' in unmount) {
      ;(wrappedUnmount as unknown as { node: unknown }).node = (
        unmount as unknown as { node: unknown }
      ).node
    }
    return wrappedUnmount
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com<C extends (...args: any[]) => any>(component: C): C

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com(component: (...args: any[]) => any): typeof component {
  // 生产路径（__DEV__ 显式设为 false 时 esbuild DCE）
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return (...args: unknown[]) => {
      const scope = getReactiveRuntime().effectScope()
      let result: unknown
      scope.run(() => { result = component(...args) })
      if (result instanceof Promise) {
        return result.then((mount) => wrapMount(mount as MountFn, scope))
      }
      return wrapMount(result as MountFn, scope)
    }
  }

  // ================================================================
  // 开发路径
  // HMR 未激活时退化到普通 mount（无实例追踪）
  // HMR 激活时启用实例追踪 + remount
  // ================================================================
  if (!hmrState.active) {
    // 首次加载，HMR 未激活：普通 mount
    return (...args: unknown[]) => {
      const scope = getReactiveRuntime().effectScope()
      let result: unknown
      scope.run(() => { result = component(...args) })
      if (result instanceof Promise) {
        return result.then((mount) => wrapMount(mount as MountFn, scope))
      }
      return wrapMount(result as MountFn, scope)
    }
  }

  // HMR 激活：实例追踪 + remount
  const ctx = hmrState.stack[hmrState.stack.length - 1]
  const key = `${ctx.id}#${ctx.nextIndex++}`

  const existing = getRegistryEntry(key)
  if (existing) {
    existing.impl = component
    for (const [uid, inst] of existing.instances) {
      if (inst.host === null) { existing.instances.delete(uid); continue }
      if (inst.unmount) inst.unmount()
      inst.unmount = null
      try {
        const result = component(...inst.args)
        if (result instanceof Promise) {
          result.then((mountFn) => { inst.unmount = doMount(inst, mountFn as MountFn) })
        } else {
          inst.unmount = doMount(inst, result as MountFn)
        }
      } catch (e) {
        console.error(`[rasen/hot] Error remounting ${key}:`, e)
      }
    }
    ;(existing)._consumed = true
    return existing.wrapper
  }

  const impl = component
  const instances = new Map<symbol, { host: unknown; ctx?: HostContext; args: unknown[]; unmount: (() => void) | null }>()

  const wrapper = function (this: unknown, ...args: any[]) {
    const entry = getRegistryEntry(key)
    if (entry?._consumed) return () => {}

    const uid = Symbol(key)
    const inst: { host: unknown; ctx?: HostContext; args: unknown[]; unmount: (() => void) | null } = { host: null, args, unmount: null }
    instances.set(uid, inst)

    const result = impl(...inst.args)

    if (result instanceof Promise) {
      return result.then((mountFn) => {
        const scope = getReactiveRuntime().effectScope()
        let mUnmount: (() => void) | undefined
        provideHostContext(getHostContext(), () => {
          scope.run(() => { mUnmount = (mountFn as MountFn)(inst.host) })
        })
        inst.unmount = () => { mUnmount?.(); scope.stop() }
        return () => { inst.unmount?.(); instances.delete(uid) }
      })
    }

    const mountable = (host: unknown) => {
      inst.host = host
      try { inst.unmount = doMount(inst, result as MountFn) } catch (e) {
        console.error(`[rasen/hot] Error mounting ${key}:`, e)
      }
      return () => { inst.unmount?.(); instances.delete(uid) }
    }
    return mountable
  }

  setRegistryEntry(key, { impl, wrapper, instances })
  return wrapper as typeof component
}

function doMount(inst: { host: unknown; unmount: (() => void) | null }, mountFn: MountFn): (() => void) | null {
  const scope = getReactiveRuntime().effectScope()
  let mountUnmount: (() => void) | undefined
  provideHostContext(getHostContext(), () => {
    scope.run(() => { mountUnmount = mountFn(inst.host) })
  })
  return () => { mountUnmount?.(); scope.stop() }
}
