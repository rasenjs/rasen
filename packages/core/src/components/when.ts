import { getReactiveRuntime, unrefValue } from '../reactive'
import { com } from '../com'
import { type Mountable, type PropValue } from '../types'

/**
 * 宿主操作钩子 - 全部可选，与 each 保持一致
 * 不提供时 when 仍能正确工作，只是没有位置精确控制
 */
export interface WhenHostHooks<Host = unknown, N = unknown> {
  /** 创建标记节点，用于定位插入位置 (receives host to ensure correct document context) */
  createMarker?: (host: Host, content: string) => N
  /** 将标记节点添加到宿主 */
  appendMarker?: (host: Host, marker: N) => void
  /** 在指定位置之前插入节点 */
  insertBefore?: (host: Host, node: N, before: N | null) => void
  /** 移除节点 */
  removeNode?: (node: N) => void
  /** 从 mount 结果中捕获节点 */
  captureNode?: (callback: (node: N) => void) => Host
  /** 创建批量插入的 fragment */
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  /** 清理标记节点 */
  removeMarker?: (marker: N) => void
}

/**
 * when 组件配置
 */
export interface WhenConfig<Host, N = unknown> {
  condition: PropValue<boolean>
  then: () => Mountable<Host>
  else?: () => Mountable<Host>

  // 可选的宿主操作钩子
  createMarker?: (host: Host, content: string) => N
  appendMarker?: (host: Host, marker: N) => void
  insertBefore?: (host: Host, node: N, before: N | null) => void
  removeNode?: (node: N) => void
  captureNode?: (callback: (node: N) => void) => Host
  createFragment?: () => {
    host: Host
    flush: (host: Host, before: N | null) => void
  }
  removeMarker?: (marker: N) => void
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

      // 创建标记（可选）
      const marker = config.createMarker?.(host, 'w')
      if (marker && config.appendMarker) {
        config.appendMarker(host, marker)
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

        let targetHost = host

        // 如果有 marker 和 insertBefore，创建代理 host
        // 使用真正的 Proxy 透传所有宿主属性（ownerDocument 等），
        // 只拦截 appendChild / insertBefore 重定向到 insertBefore(node, marker)。
        if (marker && config.insertBefore) {
          targetHost = new Proxy(host as object, {
            get(target, prop, receiver) {
              if (prop === 'appendChild') {
                return (node: N) => {
                  config.insertBefore!(host, node, marker)
                  return node
                }
              }
              if (prop === 'insertBefore') {
                return (node: N, ref: N | null) => {
                  config.insertBefore!(host, node, ref || marker)
                  return node
                }
              }
              return Reflect.get(target, prop, receiver)
            },
          }) as Host
        }

        const mountableChild = factory()
        if (!mountableChild) return
        currentUnmount = mountableChild(targetHost)
        currentBranch = branch
      }

      // 监听条件变化（由 com 自动清理）
      // 如果 condition 是函数，直接作为 getter 传递以支持依赖追踪
      // 否则通过 unrefValue 处理 Ref/computed
      const conditionSource: () => boolean =
        typeof config.condition === 'function'
          ? config.condition
          : () => unrefValue(config.condition)

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
        if (marker && config.removeMarker) {
          config.removeMarker(marker)
        }
      }
    }
  }
)
