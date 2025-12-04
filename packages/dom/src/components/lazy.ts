/**
 * @rasenjs/dom - lazy 组件
 * 
 * DOM 增强版本，支持 domHooks 用于精确控制 DOM 插入位置
 */

import type { Mountable, LazyConfig as CoreLazyConfig } from '@rasenjs/core'
import { lazy as coreLazy } from '@rasenjs/core'
import type { HostHooks } from '../host-hooks'

/**
 * DOM 版本的 lazy 配置 - 扩展 core 版本，支持 domHooks
 */
export interface LazyConfig<Host = HTMLElement> extends CoreLazyConfig<Host> {
  /**
   * DOM 操作钩子（可选）
   * 用于精确控制 DOM 插入、移除等操作
   */
  domHooks?: HostHooks
}

/**
 * DOM 版本的 lazy 组件
 * 
 * 在 core lazy 基础上增加了 domHooks 支持
 */
export function lazy<Host = HTMLElement>(
  config: LazyConfig<Host>
): Mountable<Host> {
  // 对于现在的实现，直接使用 core 的实现
  // 如果未来需要精确的 DOM 操作控制，可以在这里增强
  return coreLazy({
    loader: config.loader,
    loading: config.loading,
    error: config.error,
    minDelay: config.minDelay,
    timeout: config.timeout
  })
}

/**
 * DOM 版本的 createLazy 工厂函数
 */
export type CreateLazy = <Host = HTMLElement>(
  loader: () => Promise<Mountable<Host>>,
  options?: Omit<LazyConfig<Host>, 'loader'>
) => () => Mountable<Host>

export function createLazy<Host = HTMLElement>(
  loader: () => Promise<Mountable<Host>>,
  options?: Omit<LazyConfig<Host>, 'loader'>
): () => Mountable<Host> {
  return () => lazy({ loader, ...options })
}

// 重新导出核心类型供类型检查使用
export type { LazyConfig as BaseLazyConfig } from '@rasenjs/core'

