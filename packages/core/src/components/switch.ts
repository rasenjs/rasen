import { getReactiveRuntime } from '../reactive'
import { com } from '../com'
import { type Mountable, type PropValue } from '../types'

/**
 * 宿主操作钩子 - 与 when/each 保持一致
 */
export interface SwitchHostHooks<Host = unknown, N = unknown> {
  /** 创建标记节点，用于定位插入位置 */
  createMarker?: () => N
  /** 将标记节点添加到宿主 */
  appendMarker?: (host: Host, marker: N) => void
  /** 在指定位置之前插入节点 */
  insertBefore?: (host: Host, node: N, before: N | null) => void
  /** 移除标记节点 */
  removeMarker?: (marker: N) => void
}

/**
 * switch 组件配置
 */
export interface SwitchConfig<
  Host,
  K extends string = string,
  N = unknown
> extends SwitchHostHooks<Host, N> {
  /** 响应式的值，用于匹配 cases */
  value: PropValue<K | null | undefined>

  /** 分支映射：key -> 组件工厂 */
  cases: Partial<Record<K, (key: K) => Mountable<Host>>>

  /** 默认分支（无匹配时） */
  default?: () => Mountable<Host>

  /**
   * 是否缓存已创建的分支
   * - false（默认）：切换时销毁旧分支
   * - true：保留已创建的分支，切换时只隐藏/显示（需要平台支持）
   */
  cache?: boolean
}

/**
 * switch 组件 - 多分支条件渲染
 *
 * 根据 value 的值匹配对应的 case 分支进行渲染。
 * 只有在 value 实际变化时才会切换分支，性能优化。
 *
 * @example
 * // 基础用法
 * switch({
 *   value: () => currentTab,
 *   cases: {
 *     home: () => HomeView(),
 *     profile: () => ProfileView(),
 *     settings: () => SettingsView(),
 *   },
 *   default: () => NotFoundView()
 * })
 *
 * // 路由场景
 * switch({
 *   value: () => router.current?.key,
 *   cases: {
 *     home: () => HomePage(),
 *     user: (key) => UserPage({ key }),
 *   },
 *   default: () => NotFound()
 * })
 */
export const switchCase = com(
  <Host = unknown, K extends string = string, N = unknown>(
    config: SwitchConfig<Host, K, N>
  ): Mountable<Host> => {
    return (host: Host) => {
      const runtime = getReactiveRuntime()

      // 创建标记（可选）
      const marker = config.createMarker?.()
      if (marker && config.appendMarker) {
        config.appendMarker(host, marker)
      }

      // 使用 Symbol 标记"未初始化"状态
      const UNINITIALIZED = Symbol('uninitialized')

      // 当前活跃的 key（用 Symbol 区分"未初始化"和 undefined）
      let currentKey: K | null | undefined | typeof UNINITIALIZED =
        UNINITIALIZED
      // 当前分支的卸载函数
      let currentUnmount: (() => void) | void

      // 清理当前分支
      const cleanup = () => {
        if (currentUnmount) {
          currentUnmount()
          currentUnmount = undefined
        }
      }

      // 挂载分支
      const mountBranch = (key: K | null | undefined) => {
        // 获取对应的工厂函数
        let factory:
          | ((key: K) => Mountable<Host>)
          | (() => Mountable<Host>)
          | undefined

        if (key != null && config.cases[key]) {
          factory = config.cases[key]
        } else if (config.default) {
          factory = config.default
        }

        if (!factory) return

        let targetHost = host

        // 如果有 marker 和 insertBefore，创建代理 host
        if (marker && config.insertBefore) {
          targetHost = {
            appendChild: (node: N) => {
              config.insertBefore!(host, node, marker)
              return node
            },
            insertBefore: (node: N, ref: N | null) => {
              config.insertBefore!(host, node, ref || marker)
              return node
            }
          } as unknown as Host
        }

        // 创建并挂载组件
        const mountable =
          key != null && config.cases[key]
            ? (factory as (key: K) => Mountable<Host>)(key)
            : (factory as () => Mountable<Host>)()

        currentUnmount = mountable(targetHost)
      }

      // 解包 PropValue
      const unref = <T>(value: PropValue<T>): T => {
        if (typeof value === 'function') {
          return (value as () => T)()
        }
        if (value && typeof value === 'object' && 'value' in value) {
          return (value as { value: T }).value
        }
        return value as T
      }

      // 监听 value 变化（由 com 自动清理）
      runtime.watch(
        () => unref(config.value),
        (newKey) => {
          // 如果 key 没变，不需要做任何事（性能优化的关键）
          if (currentKey === newKey) return

          // 清理旧分支
          cleanup()

          // 更新 currentKey
          currentKey = newKey

          // 挂载新分支
          mountBranch(newKey)
        },
        { immediate: true }
      )

      return () => {
        cleanup()
        if (marker && config.removeMarker) {
          config.removeMarker(marker)
        }
      }
    }
  }
)

// 别名：match（更函数式的命名）
export { switchCase as match }
