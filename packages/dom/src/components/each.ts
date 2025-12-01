import { eachImpl, type MountFunction } from '@rasenjs/core'

/**
 * DOM 优化版 each 组件
 *
 * 在 core 的 each 基础上，提供 DOM 特定优化：
 * - 使用 Comment 节点作为标记
 * - 使用 DocumentFragment 批量插入
 * - 支持节点移动（insertBefore）
 */

/**
 * each 组件 - 简化版本
 * @param items 响应式数组或返回数组的函数
 * @param render 渲染函数，接收 item 和 index
 */
export function each<T>(
  items: (() => T[]) | { value: T[] } | T[],
  render: (item: T, index: number) => MountFunction<HTMLElement>
): MountFunction<HTMLElement>

/**
 * each 组件 - 完整配置版本
 */
export function each<T>(config: {
  items: () => T[]
  getKey?: (item: T, index: number) => string | number
  render: (item: T, index: number) => MountFunction<HTMLElement>
}): MountFunction<HTMLElement>

export function each<T>(
  configOrItems:
    | {
        items: () => T[]
        getKey?: (item: T, index: number) => string | number
        render: (item: T, index: number) => MountFunction<HTMLElement>
      }
    | (() => T[])
    | { value: T[] }
    | T[],
  render?: (item: T, index: number) => MountFunction<HTMLElement>
): MountFunction<HTMLElement> {
  // 简化版本
  if (render) {
    let itemsGetter: () => T[]

    if (typeof configOrItems === 'function') {
      itemsGetter = configOrItems
    } else if (
      typeof configOrItems === 'object' &&
      configOrItems !== null &&
      'value' in configOrItems
    ) {
      itemsGetter = () => (configOrItems as { value: T[] }).value
    } else {
      itemsGetter = () => configOrItems as T[]
    }

    return eachImpl<T, HTMLElement, Node>({
      items: itemsGetter,
      getKey: defaultGetKey,
      render,
      ...domHooks
    })
  }

  // 完整配置版本
  const config = configOrItems as {
    items: () => T[]
    getKey?: (item: T, index: number) => string | number
    render: (item: T, index: number) => MountFunction<HTMLElement>
  }

  return eachImpl<T, HTMLElement, Node>({
    items: config.items,
    getKey: config.getKey ?? defaultGetKey,
    render: config.render,
    ...domHooks
  })
}

/**
 * 默认 getKey 实现
 */
function defaultGetKey<T>(item: T, _index: number): string | number {
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>
    if ('id' in obj) return obj.id as string | number
    if ('key' in obj) return obj.key as string | number
  }
  return String(item)
}

/**
 * DOM 宿主操作钩子
 */
const domHooks = {
  // 创建标记节点
  createMarker: () => document.createComment('') as Node,

  // 将标记添加到宿主
  appendMarker: (host: HTMLElement, marker: Node) => {
    host.appendChild(marker)
  },

  // 在指定位置之前插入节点
  insertBefore: (host: HTMLElement, node: Node, before: Node | null) => {
    host.insertBefore(node, before)
  },

  // 移除节点
  removeNode: (node: Node) => {
    node.parentNode?.removeChild(node)
  },

  // 创建 DocumentFragment 用于批量插入
  createFragment: () => {
    const fragment = document.createDocumentFragment()
    return {
      host: fragment as unknown as HTMLElement,
      flush: (host: HTMLElement, before: Node | null) => {
        host.insertBefore(fragment, before)
      }
    }
  },

  // 移除标记节点
  removeMarker: (marker: Node) => {
    marker.parentNode?.removeChild(marker)
  },

  // 捕获节点
  captureNode: (callback: (node: Node) => void): HTMLElement => {
    let captured = false
    return {
      appendChild: (node: Node) => {
        if (!captured) {
          callback(node)
          captured = true
        }
        // 实际的 appendChild 由 fragment 或 host 处理
      },
      insertBefore: (node: Node, _ref: Node | null) => {
        if (!captured) {
          callback(node)
          captured = true
        }
      }
    } as unknown as HTMLElement
  }
}
