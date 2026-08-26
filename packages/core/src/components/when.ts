import { toValue, getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { MARKERS } from '../marker-constants'
import { type Mountable, type PropValue, type HostHooks } from '../types'

/**
 * when 组件配置
 */
export interface WhenConfig<N = unknown> {
  condition: PropValue<boolean>
  then: () => Mountable<N>
  else?: () => Mountable<N>

  /** 显式宿主钩子（缺省时从 HostContext 继承） */
  hooks?: HostHooks<N>
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
  <N = unknown>(
    config: WhenConfig<N>
  ): Mountable<N> => {
    return (node: N, mountHooks?: HostHooks<N>) => {
      const hooks = mountHooks ?? config.hooks
      const runtime = getReactiveRuntime()


      // 定位标记：分支内容始终插在标记之前（有界宿主保证）。
      // 无标记能力时退化为直接追加到宿主末尾。
      let marker: N | undefined
      if (hooks?.createMarker && hooks.insert) {
        marker = hooks.createMarker(node, MARKERS.WHEN_START)
        hooks.insert(node, marker, null)
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
          marker && hooks?.boundedHost ? hooks.boundedHost(node, marker) : node

        const mountableChild = factory()
        if (!mountableChild) return
        currentUnmount = mountableChild(targetHost, hooks)
        currentBranch = branch
      }

      // 监听条件变化（由 com 自动清理）
      // toValue 统一处理 getter / Ref / computed / 普通值，
      // getter 在订阅内执行以支持依赖追踪
      const conditionSource: () => boolean = () => toValue(config.condition)

      const syncBranch = () => {
        const value = conditionSource()
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
      }

      runtime.subscribe(conditionSource, syncBranch)

      // immediate 语义：以当前条件值同步执行一次分支决策
      syncBranch()

      return () => {
        cleanup()
        if (marker && hooks?.detach) {
          hooks.detach(marker)
        }
      }
    }
  }
)
