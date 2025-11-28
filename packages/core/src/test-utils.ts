/**
 * 通用响应式系统测试套件
 * 用于测试不同响应式运行时的兼容性
 */

import { describe, it, expect, vi } from 'vitest'
import type { ReactiveRuntime } from './reactive'

export interface TestableReactiveRuntime {
  runtime: ReactiveRuntime
  ref: <T>(value: T) => { value: T }
  computed: <T>(getter: () => T) => { readonly value: T }
  watch: (
    source: () => unknown,
    callback: (newValue: unknown, oldValue: unknown) => void,
    options?: { immediate?: boolean }
  ) => () => void
}

/**
 * 运行响应式系统标准测试
 */
export function runReactiveRuntimeTests(
  name: string,
  setup: () => TestableReactiveRuntime
) {
  describe(name, () => {
    describe('ref', () => {
      it('should create a reactive reference', () => {
        const { ref } = setup()
        const count = ref(0)
        expect(count.value).toBe(0)
        
        count.value = 5
        expect(count.value).toBe(5)
      })
    })

    describe('computed', () => {
      it('should create a computed value', () => {
        const { ref, computed } = setup()
        const count = ref(10)
        const doubled = computed(() => count.value * 2)
        
        expect(doubled.value).toBe(20)
        
        count.value = 15
        expect(doubled.value).toBe(30)
      })
    })

    describe('watch', () => {
      it('should watch changes to a signal', async () => {
        const { ref, watch } = setup()
        const count = ref(0)
        const callback = vi.fn()
        
        watch(() => count.value, callback)
        
        count.value = 5
        
        // Wait for async callback
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1)
        // 只检查前两个参数 (Vue watch 会传第三个 onCleanup 参数)
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(5)
        expect(firstCall[1]).toBe(0)
      })

      it('should call callback immediately when immediate is true', async () => {
        const { ref, watch } = setup()
        const count = ref(10)
        const callback = vi.fn()
        
        watch(() => count.value, callback, { immediate: true })
        
        await new Promise(resolve => setTimeout(resolve, 10))
        
        // 只检查前两个参数
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(10)
        // Vue 的 immediate watch oldValue 是 undefined,Signals 是当前值
        expect([10, undefined]).toContain(firstCall[1])
      })

      it('should stop watching when stop is called', async () => {
        const { ref, watch } = setup()
        const count = ref(0)
        const callback = vi.fn()
        
        const stop = watch(() => count.value, callback)
        
        count.value = 5
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1)
        
        stop()
        
        count.value = 10
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1) // Should not be called again
      })

      it('should track multiple dependencies', async () => {
        const { ref, watch } = setup()
        const a = ref(1)
        const b = ref(2)
        const callback = vi.fn()
        
        watch(() => a.value + b.value, callback)
        
        a.value = 10
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(callback).toHaveBeenCalledTimes(1)
        // 只检查前两个参数
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(12)
        expect(firstCall[1]).toBe(3)
        
        b.value = 20
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(callback).toHaveBeenCalledTimes(2)
        const secondCall = callback.mock.calls[1]
        expect(secondCall[0]).toBe(30)
        expect(secondCall[1]).toBe(12)
      })
    })

    describe('runtime integration', () => {
      it('should work with runtime.watch', async () => {
        const { runtime, ref } = setup()
        const count = ref(0)
        const callback = vi.fn()
        
        runtime.watch(() => count.value, callback)
        
        count.value = 5
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalled()
      })
    })
  })
}
