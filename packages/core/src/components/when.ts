import { getReactiveRuntime, toValue } from '../reactive'
import { com, getHostContext } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type PropValue, type HostContext, type HostHooks } from '../types'

/**
 * when 组件配置
 */
export interface WhenConfig<Host, N = unknown> {
  condition: PropValue<boolean>
  then: () => Mountable<Host>
  else?: () => Mountable<Host>

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<Host, N>
}

/**
 * when 组件 - 条件渲染
 *
 * 条件为真时挂载 then 分支，为假时挂载 else 分支（可选）
 * 条件变化时会销毁旧分支、创建新分支
 *
 * @example
 * // 基础用法
 * when({
 *   condition: isLoggedIn,
 *   then: () => UserPanel(),
 *   else: () => LoginForm()
 * })
 *
 * // 简化用法（无 else 分支）
 * when({
 *   condition: showDetails,
 *   then: () => DetailsPanel()
 * })
 */
export const when = com(
  <Host = unknown, N = unknown>(
    config: WhenConfig<Host, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // 宿主上下文：com 挂载时已压栈。优先用 ctx.hooks，config.hooks 作为显式 fallback。
      const ctx = getHostContext() as HostContext<Host, N> | undefined
      const hooks = ctx?.hooks ?? config.hooks

      // 定位标记：分支内容始终插在标记之前（有界宿主保证）。
      // 无标记能力时退化为直接追加到宿主末尾。
      let marker: N | undefined
      if (hooks?.createMarker && hooks.insert) {
        marker = hooks.createMarker(host, MARKERS.WHEN_START)
        hooks.insert(host, marker, null)
      }

      let currentUnmount: (() => void) | undefined
      let currentBranch: 'then' | 'else' | null = null

      // 清理当前分支
      const cleanup = () => {
        if (currentUnmount) {
          currentUnmount()
          currentUnmount = undefined
        }
        currentBranch = null
      }

      // 挂载分支
      const mountBranch = (branch: 'then' | 'else') => {
        const factory = branch === 'then' ? config.then : config.else
        if (!factory) return

        // 有界宿主：子树的所有追加都落在标记之前。
        // 无 boundedHost 能力时直接使用宿主（位置不精确但功能正确）。
        const targetHost =
          marker && hooks?.boundedHost ? hooks.boundedHost(host, marker) : host

        const mountableChild = factory()
        if (!mountableChild) return
        currentUnmount = mountableChild(targetHost)
        currentBranch = branch
      }

      // 监听条件变化（由 com 自动清理）
      // toValue 统一处理 getter / Ref / computed / 普通值，
      // getter 在 watch 内执行以支持依赖追踪
      const conditionSource: () => boolean = () => toValue(config.condition)

      runtime.watch(
        conditionSource,
        (value) => {
          const targetBranch = value ? 'then' : 'else'

          // 如果分支没变，不需要做任何事
          if (currentBranch === targetBranch) return

          // 如果目标分支不存在（比如没有 else），清理即可
          if (targetBranch === 'else' && !config.else) {
            cleanup()
            return
          }

          // 清理旧分支，挂载新分支
          cleanup()
          mountBranch(targetBranch)
        },
        { immediate: true }
      )

      return () => {
        cleanup()
        if (marker && hooks?.detach) {
          hooks.detach(marker)
        }
      }
    }
  }
)
