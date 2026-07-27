/**
 * com - 组件包装器
 *
 * 生产路径：创建 effectScope，mount，返回 unmount
 * 开发路径：额外实例追踪 + HMR clean remount（__DEV__=false 时被 DCE）
 */

import { getReactiveRuntime } from './reactive'
import { hmrState, getRegistryEntry, setRegistryEntry } from './hmr'

export type MountFn = (host: unknown) => (() => void) | undefined
export type Scope = { run: <T>(fn: () => T) => T | undefined; stop: () => void }

declare const __DEV__: boolean | undefined

export function wrapMount(mount: MountFn, scope: Scope) {
  return (host: unknown) => {
    let unmount: (() => void) | undefined
    scope.run(() => { unmount = mount(host) })
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
  const instances = new Map<symbol, { host: unknown; args: unknown[]; unmount: (() => void) | null }>()

  const wrapper = function (this: unknown, ...args: any[]) {
    const entry = getRegistryEntry(key)
    if (entry?._consumed) return () => {}

    const uid = Symbol(key)
    const inst: { host: unknown; args: unknown[]; unmount: (() => void) | null } = { host: null, args, unmount: null }
    instances.set(uid, inst)

    const result = impl(...inst.args)

    if (result instanceof Promise) {
      return result.then((mountFn) => {
        const scope = getReactiveRuntime().effectScope()
        let mUnmount: (() => void) | undefined
        scope.run(() => { mUnmount = (mountFn as MountFn)(inst.host) })
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
  scope.run(() => { mountUnmount = mountFn(inst.host) })
  return () => { mountUnmount?.(); scope.stop() }
}
