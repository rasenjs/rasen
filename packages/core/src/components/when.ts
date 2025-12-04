import { getReactiveRuntime, unrefValue } from '../reactive'
import { type Mountable, type PropValue } from '../types'

/**
 * 宿主操作钩子 - 全部可选，与 each 保持一致
 * 不提供时 when 仍能正确工作，只是没有位置精确控制
 */
export interface WhenHostHooks<Host = unknown, N = unknown> {
  /** 创建标记节点，用于定位插入位置 */
  createMarker?: () => N
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
  createMarker?: () => N
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
export function when<Host = unknown, N = unknown>(
  config: WhenConfig<Host, N>
): Mountable<Host> {
  return (host: Host) => {
    const runtime = getReactiveRuntime()

    // 创建标记（可选）
    const marker = config.createMarker?.()
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
      // 让子组件的 appendChild 变成 insertBefore(node, marker)
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

      const mountableChild = factory()
      if (!mountableChild) return
      currentUnmount = mountableChild(targetHost)
      currentBranch = branch
    }

    // 监听条件变化
    const stopWatch = runtime.watch(
      () => unrefValue(config.condition),
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
      stopWatch()
      cleanup()
      if (marker && config.removeMarker) {
        config.removeMarker(marker)
      }
    }
  }
}
