/**
 * com - 组件包装器
 *
 * 用于包裹组件的 setup 函数，自动管理 effectScope。
 * 在 mount 阶段创建 effectScope，所有 watch 在其内执行，
 * unmount 时自动调用 scope.stop() 清理所有副作用。
 *
 * @example
 * ```typescript
 * // 同步组件
 * const Counter = com((props: { initial: number }) => {
 *   const count = ref(props.initial)
 *   return (host) => {
 *     watch(count, (v) => { ... }) // 自动清理
 *     return () => { ... }
 *   }
 * })
 *
 * // 异步组件
 * const AsyncComp = com(async (props) => {
 *   const data = await fetchData()
 *   return (host) => {
 *     watch(data, (v) => { ... }) // 自动清理
 *     return () => { ... }
 *   }
 * })
 * ```
 */

import { getReactiveRuntime } from './reactive'

/**
 * 同步组件包装器
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com<C extends (...args: any[]) => any>(component: C): C

/**
 * 实现
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function com(component: (...args: any[]) => any): typeof component {
  return (...args: unknown[]) => {
    const scope = getReactiveRuntime().effectScope()

    let result: unknown
    scope.run(() => {
      result = component(...args)
    })

    // 异步组件
    if (result instanceof Promise) {
      return result.then((mount) => wrapMount(mount as MountFn, scope))
    }

    // 同步组件
    return wrapMount(result as MountFn, scope)
  }
}

type MountFn = (host: unknown) => (() => void) | undefined
type Scope = { run: <T>(fn: () => T) => T | undefined; stop: () => void }

function wrapMount(mount: MountFn, scope: Scope) {
  return (host: unknown) => {
    let unmount: (() => void) | undefined
    scope.run(() => {
      unmount = mount(host)
    })

    const wrappedUnmount = () => {
      scope.stop()
      unmount?.()
    }

    // 保留 node 属性
    if (unmount && 'node' in unmount) {
      ;(wrappedUnmount as unknown as { node: unknown }).node = (
        unmount as unknown as { node: unknown }
      ).node
    }

    return wrappedUnmount
  }
}
