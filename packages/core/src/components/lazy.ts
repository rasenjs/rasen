/**
 * @rasenjs/core - lazy 组件 (框架无关版本)
 * 
 * 处理异步操作到 Mountable 的转换
 * 支持:
 * 1. 异步加载组件 - import('./Component').then(m => m.Component)
 * 2. 异步组件本身 - async function Component() { ... }
 */

import type { Mountable } from '../types'

/**
 * lazy 配置
 */
export interface LazyConfig<Host = unknown> {
  /**
   * 返回 Promise<Mountable> 的加载函数
   * 可以是:
   * - () => import('./Component').then(m => m.default)  [异步加载]
   * - async () => (host) => { ... }                      [异步组件]
   */
  loader: () => Promise<Mountable<Host>>
  
  /**
   * 加载中显示的组件（可选）
   */
  loading?: () => Mountable<Host>
  
  /**
   * 加载失败显示的组件（可选）
   */
  error?: (err: Error) => Mountable<Host>
  
  /**
   * 最小加载时间（ms），避免闪烁（可选，默认 0）
   */
  minDelay?: number
  
  /**
   * 超时时间（ms），超时视为加载失败（可选）
   */
  timeout?: number
}

/**
 * lazy 组件的内部状态
 */
interface LazyState<Host = unknown> {
  status: 'loading' | 'loaded' | 'error'
  component?: Mountable<Host>
  error?: Error
}

/**
 * lazy 组件 - 框架无关实现
 * 
 * 使用简单的状态管理处理 Promise 状态转换
 * 
 * @example
 * ```typescript
 * // 异步加载的组件
 * lazy({
 *   loader: () => import('./Dashboard').then(m => m.Dashboard),
 *   loading: () => div('Loading...'),
 *   error: (err) => div(`Error: ${err.message}`)
 * })
 * 
 * // 异步组件本身
 * async function Dashboard() {
 *   const data = await fetchData()
 *   return (host) => { ... }
 * }
 * 
 * lazy({
 *   loader: Dashboard,
 *   loading: () => div('Loading...'),
 *   error: (err) => div(`Error: ${err.message}`)
 * })
 * ```
 */
export function lazy<Host = unknown>(
  config: LazyConfig<Host>
): Mountable<Host> {
  const { loader, loading, error: errorHandler, minDelay = 0, timeout } = config
  
  // 创建响应式状态来追踪异步操作
  let state: LazyState<Host> = { status: 'loading' }
  let stateChangeCallbacks: Array<(state: LazyState<Host>) => void> = []
  
  const setState = (newState: LazyState<Host>) => {
    state = newState
    stateChangeCallbacks.forEach(cb => cb(newState))
  }
  
  // 启动加载
  const startTime = Date.now()
  
  let loadPromise = loader()
  
  // 添加超时处理
  if (timeout) {
    loadPromise = Promise.race([
      loadPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Lazy load timeout after ${timeout}ms`)), timeout)
      })
    ])
  }
  
  // 异步加载
  loadPromise
    .then(async (component: Mountable<Host>) => {
      // 确保最小加载时间（避免闪烁）
      const elapsed = Date.now() - startTime
      if (minDelay > 0 && elapsed < minDelay) {
        await new Promise(resolve => setTimeout(resolve, minDelay - elapsed))
      }
      
      setState({ status: 'loaded', component })
    })
    .catch((err: Error) => {
      setState({ status: 'error', error: err })
    })
  
  // 返回 Mountable 函数
  return (host: Host) => {
    // 初始挂载时显示 loading 状态
    let currentUnmount: (() => void) | void | undefined
    
    const updateView = () => {
      if (currentUnmount) {
        currentUnmount()
      }
      
      if (state.status === 'loaded' && state.component) {
        currentUnmount = state.component(host)
      } else if (state.status === 'error' && state.error) {
        if (errorHandler) {
          currentUnmount = errorHandler(state.error)(host)
        }
      } else if (state.status === 'loading') {
        if (loading) {
          currentUnmount = loading()(host)
        }
      }
    }
    
    // 初始更新
    updateView()
    
    // 监听状态变化
    const unsubscribe = (callback: (state: LazyState<Host>) => void) => {
      stateChangeCallbacks.push(callback)
      return () => {
        stateChangeCallbacks = stateChangeCallbacks.filter(cb => cb !== callback)
      }
    }
    
    const off = unsubscribe(updateView)
    
    return () => {
      off()
      if (currentUnmount) {
        currentUnmount()
      }
    }
  }
}

/**
 * 创建可复用的 lazy 组件工厂
 */
export type CreateLazy = <Host = unknown>(
  loader: () => Promise<Mountable<Host>>,
  options?: Omit<LazyConfig<Host>, 'loader'>
) => () => Mountable<Host>

/**
 * createLazy 工厂函数实现
 */
export function createLazy<Host = unknown>(
  loader: () => Promise<Mountable<Host>>,
  options?: Omit<LazyConfig<Host>, 'loader'>
): () => Mountable<Host> {
  return () => lazy({ loader, ...options })
}
