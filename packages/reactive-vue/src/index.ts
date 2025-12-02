/**
 * Vue Reactivity 适配器
 * 将 Vue 的响应式系统适配到 Rasen
 * 
 * 使用 @vue/reactivity 而非完整的 vue 包，减小包体积
 */

import {
  watch as vueWatch,
  effectScope as vueEffectScope,
  ref as vueRef,
  computed as vueComputed,
  unref as vueUnref,
  isRef
} from '@vue/reactivity'
import type { ReactiveRuntime } from '@rasenjs/core'

/**
 * 创建 Vue 响应式运行时
 */
export function createReactiveRuntime(): ReactiveRuntime {
  return {
    watch: (source: any, callback: any, options: any) => {
      return vueWatch(source, callback, options) as any
    },

    effectScope: () => {
      return vueEffectScope() as any
    },

    ref: ((value: any) => {
      return vueRef(value) as any
    }) as any,

    computed: ((getter: any) => {
      return vueComputed(getter) as any
    }) as any,

    unref: <T>(value: T | unknown): T => {
      // 检查是否是 getter 函数
      if (typeof value === 'function') {
        return (value as () => T)()
      }
      return (isRef(value) ? vueUnref(value) : value) as T
    },

    isRef: (value: unknown): boolean => {
      return isRef(value)
    }
  }
}
