/**
 * com - 组件包装器
 *
 * 组件工厂签名与普通函数一致：业务 props 从第一参数起。
 * 需要响应式能力的组件在 setup 内自行 getReactiveRuntime() 获取。
 *
 * 职责：为每次实例化创建 effectScope——setup 与 mount 阶段创建的
 * 订阅自动归入 scope，unmount 时一并 stop。
 *
 * 生产路径：创建 effectScope，mount，返回 unmount
 * 开发路径：额外实例追踪 + HMR clean remount（__DEV__=false 时被 DCE）
 */

import { getReactiveRuntime } from './reactive'
import { hmrState, getRegistryEntry, setRegistryEntry } from './hmr'
import type { HostHooks } from './host-context'

export type MountFn = (
  node: unknown,
  hooks: HostHooks | undefined
) => (() => void) | undefined
export type Scope = { run: <T>(fn: () => T) => T | undefined; stop: () => void }

declare const __DEV__: boolean | undefined

/**
 * wrapMount：把「mount 回调 + scope」适配成标准 Mountable 双参签名。
 * scope 生命周期由外层闭包持有，unmount 时一并 stop。
 */
export function wrapMount(mount: MountFn, scope: Scope) {
  return (node: unknown, hooks: HostHooks | undefined) => {
    let unmount: (() => void) | undefined
    scope.run(() => {
      unmount = mount(node, hooks)
    })
    return () => {
      unmount?.()
      scope.stop()
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com<C extends (...args: any[]) => any>(component: C): C {
  // 生产路径（__DEV__ 显式设为 false 时 esbuild DCE）
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return ((...args: unknown[]) => {
      const scope = getReactiveRuntime().effectScope()
      let result: unknown
      scope.run(() => {
        result = component(...args)
      })
      if (result instanceof Promise) {
        return result.then((mount) => wrapMount(mount as MountFn, scope))
      }
      return wrapMount(result as MountFn, scope)
    }) as C
  }

  // ================================================================
  // 开发路径
  // HMR 未激活时退化到普通 mount（无实例追踪）
  // HMR 激活时启用实例追踪 + remount
  // ================================================================
  if (!hmrState.active || hmrState.stack.length === 0) {
    return ((...args: unknown[]) => {
      const scope = getReactiveRuntime().effectScope()
      let result: unknown
      scope.run(() => {
        result = component(...args)
      })
      if (result instanceof Promise) {
        return result.then((mount) => wrapMount(mount as MountFn, scope))
      }
      return wrapMount(result as MountFn, scope)
    }) as C
  }

  // HMR 激活：实例追踪 + remount
  const ctx = hmrState.stack[hmrState.stack.length - 1]
  const key = `${ctx.id}#${ctx.nextIndex++}`

  const impl = component
  const instances = new Map<
    symbol,
    { node: unknown; hooks: HostHooks | undefined; args: unknown[]; unmount: (() => void) | null }
  >()

  const wrapper = function (this: unknown, ...args: any[]) {
    const entry = getRegistryEntry(key)
    if (entry?._consumed) return () => {}

    const uid = Symbol(key)
    const inst: {
      node: unknown
      hooks: HostHooks | undefined
      args: unknown[]
      unmount: (() => void) | null
    } = { node: null, hooks: undefined, args, unmount: null }
    instances.set(uid, inst)

    const result = impl(...inst.args)

    if (result instanceof Promise) {
      return result.then((mountFn) => {
        const scope = getReactiveRuntime().effectScope()
        let mUnmount: (() => void) | undefined
        scope.run(() => {
          mUnmount = (mountFn as MountFn)(inst.node, inst.hooks)
        })
        inst.unmount = () => {
          mUnmount?.()
          scope.stop()
        }
        return () => {
          inst.unmount?.()
          instances.delete(uid)
        }
      })
    }

    const mountable = (node: unknown, hooks: HostHooks | undefined) => {
      inst.node = node
      inst.hooks = hooks
      try {
        inst.unmount = doMount(inst, result as MountFn)
      } catch (e) {
        console.error(`[rasen/hot] Error mounting ${key}:`, e)
      }
      return () => {
        inst.unmount?.()
        instances.delete(uid)
      }
    }
    return mountable
  }

  setRegistryEntry(key, { impl, wrapper, instances })
  return wrapper as typeof component
}

function doMount(
  inst: { node: unknown; hooks: HostHooks | undefined; unmount: (() => void) | null },
  mountFn: MountFn
): (() => void) | null {
  const scope = getReactiveRuntime().effectScope()
  let mountUnmount: (() => void) | undefined
  scope.run(() => {
    mountUnmount = mountFn(inst.node, inst.hooks)
  })
  return () => {
    mountUnmount?.()
    scope.stop()
  }
}
