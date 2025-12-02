/**
 * TC39 Signals 适配器
 * 将 TC39 Signals 提案的响应式系统适配到 Rasen
 */

import { Signal } from 'signal-polyfill'
import type { ReactiveRuntime, Ref, ReadonlyRef } from '@rasenjs/core'

// 创建单例运行时（延迟初始化）
let runtime: ReactiveRuntime | undefined

/**
 * 创建 Signals 响应式运行时
 */
export function createSignalsRuntime(): ReactiveRuntime {
  return {
    watch: (source, callback, options) => {
      let oldValue: any = undefined
      let isFirstRun = true
      let stopped = false

      // 创建一个 Computed 作为 effect
      const effect = new Signal.Computed(() => {
        if (stopped) return
        
        const newValue = source()
        
        if (!isFirstRun) {
          callback(newValue, oldValue)
        } else if (options?.immediate) {
          // immediate 选项时，第一次 oldValue 也是当前值
          callback(newValue, newValue)
        }
        
        if (isFirstRun) {
          isFirstRun = false
        }
        
        oldValue = newValue
        return newValue
      })

      // 创建 Watcher 监听 effect
      const watcher = new Signal.subtle.Watcher(() => {
        // 延迟执行，避免在通知阶段读取 signal
        queueMicrotask(() => {
          if (!stopped) {
            // 先执行 effect
            effect.get()
            // 如果还没停止，继续监听
            if (!stopped) {
              watcher.watch(effect)
            }
          }
        })
      })

      // 监听 effect 本身
      watcher.watch(effect)
      
      // 初次执行，建立依赖关系并触发 immediate 回调
      effect.get()
      // 初次执行后也需要重新监听
      watcher.watch(effect)

      // 返回停止函数
      return () => {
        stopped = true
        watcher.unwatch(effect)
      }
    },

    effectScope: () => {
      // Signals 没有 effectScope 概念，创建一个简单的容器
      const cleanups: (() => void)[] = []
      let isActive = true

      return {
        run: <T>(fn: () => T): T | undefined => {
          if (!isActive) return undefined
          return fn()
        },
        stop: () => {
          isActive = false
          cleanups.forEach(cleanup => cleanup())
          cleanups.length = 0
        }
      }
    },

    ref: <T>(value: T): Ref<T> => {
      const signal = new Signal.State(value)
      return {
        get value() {
          return signal.get()
        },
        set value(newValue: T) {
          signal.set(newValue)
        }
      }
    },

    computed: <T>(getter: () => T): ReadonlyRef<T> => {
      const signal = new Signal.Computed(getter)
      return {
        get value() {
          return signal.get()
        }
      }
    },

    unref: <T>(value: T | Ref<T> | ReadonlyRef<T> | (() => T)): T => {
      // 检查是否是 getter 函数（但排除 Ref 对象，因为它们也有 value）
      if (typeof value === 'function') {
        // 执行 getter 函数
        return (value as () => T)()
      }
      // 检查是否有 value 属性（Ref 或 ReadonlyRef）
      if (value && typeof value === 'object' && 'value' in value) {
        return (value as Ref<T>).value
      }
      return value as T
    },

    isRef: (value: unknown): boolean => {
      // TC39 Signals 检查是否有 value 属性
      return value !== null && typeof value === 'object' && 'value' in value
    }
  }
}

// 获取或创建单例运行时
function getRuntime(): ReactiveRuntime {
  if (!runtime) {
    runtime = createSignalsRuntime()
  }
  return runtime
}

/**
 * 便捷的 ref 函数
 */
export function ref<T>(value: T): Ref<T> {
  return getRuntime().ref(value)
}

/**
 * 便捷的 computed 函数
 */
export function computed<T>(getter: () => T): ReadonlyRef<T> {
  return getRuntime().computed(getter)
}

/**
 * 便捷的 watch 函数
 */
export function watch<T>(
  source: () => T,
  callback: (newValue: T, oldValue: T) => void,
  options?: { immediate?: boolean }
): () => void {
  return getRuntime().watch(source, callback, options)
}

/**
 * 便捷的 unref 函数
 */
export function unref<T>(value: T | Ref<T> | ReadonlyRef<T>): T {
  return getRuntime().unref(value)
}

/**
 * 便捷的 isRef 函数
 */
export function isRef(value: unknown): boolean {
  return getRuntime().isRef(value)
}
