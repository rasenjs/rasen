/**
 * Vue Composition API 适配器
 * 将 Vue 的响应式系统适配到 Rasen
 */

import {
  watch as vueWatch,
  effectScope as vueEffectScope,
  ref as vueRef,
  computed as vueComputed,
  unref as vueUnref,
  isRef
} from 'vue'
import type { ReactiveRuntime } from '@rasenjs/core'

/**
 * 创建 Vue 响应式运行时
 */
export function createVueRuntime(): ReactiveRuntime {
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
      // Vue 提供了 isRef 来准确判断
      return (isRef(value) ? vueUnref(value) : value) as T
    },

    isRef: (value: unknown): boolean => {
      return isRef(value)
    }
  }
}
