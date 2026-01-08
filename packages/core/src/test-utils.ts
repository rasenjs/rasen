/**
 * 通用响应式系统测试套件
 * 用于测试不同响应式运行时的兼容性
 */

import { describe, it, expect, vi } from 'vitest'
import type { ReactiveRuntime } from './reactive'

/**
 * 运行响应式系统标准测试
 */
export function runReactiveRuntimeTests(
  name: string,
  createRuntime: () => ReactiveRuntime
) {
  describe(name, () => {
    describe('ref', () => {
      it('should create a reactive reference', () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        expect(count.value).toBe(0)
        
        count.value = 5
        expect(count.value).toBe(5)
      })
    })

    describe('computed', () => {
      it('should create a computed value', () => {
        const runtime = createRuntime()
        const count = runtime.ref(10)
        const doubled = runtime.computed(() => count.value * 2)
        
        expect(doubled.value).toBe(20)
        
        count.value = 15
        expect(doubled.value).toBe(30)
      })
    })

    describe('watch', () => {
      it('should watch changes to a signal', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()
        
        runtime.watch(() => count.value, callback)
        
        count.value = 5
        
        // Wait for async callback
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1)
        // Only check first two parameters (Vue watch passes a third onCleanup parameter)
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(5)
        expect(firstCall[1]).toBe(0)
      })

      it('should call callback immediately when immediate is true', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(10)
        const callback = vi.fn()
        
        runtime.watch(() => count.value, callback, { immediate: true })
        
        await new Promise(resolve => setTimeout(resolve, 10))
        
        // Only check first two parameters
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(10)
        // Vue's immediate watch oldValue is undefined, Signals is current value
        expect([10, undefined]).toContain(firstCall[1])
      })

      it('should stop watching when stop is called', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()
        
        const stop = runtime.watch(() => count.value, callback)
        
        count.value = 5
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1)
        
        stop()
        
        count.value = 10
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalledTimes(1) // Should not be called again
      })

      it('should track multiple dependencies', async () => {
        const runtime = createRuntime()
        const a = runtime.ref(1)
        const b = runtime.ref(2)
        const callback = vi.fn()
        
        runtime.watch(() => a.value + b.value, callback)
        
        a.value = 10
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(callback).toHaveBeenCalledTimes(1)
        // Only check first two parameters
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
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()
        
        runtime.watch(() => count.value, callback)
        
        count.value = 5
        await new Promise(resolve => setTimeout(resolve, 10))
        
        expect(callback).toHaveBeenCalled()
      })
    })

    describe('effectScope', () => {
      it('should collect and cleanup watch effects', () => {
        const runtime = createRuntime()
        let watchCallCount = 0

        const scope = runtime.effectScope()
        
        scope.run(() => {
          const count = runtime.ref(0)
          
          runtime.watch(() => count.value, () => {
            watchCallCount++
          }, { immediate: true })
          
          expect(watchCallCount).toBe(1)
        })

        scope.stop()
        
        const result = scope.run(() => 'should not execute')
        expect(result).toBeUndefined()
      })

      it('should cleanup multiple watches', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()
        const watchCount = 10
        
        scope.run(() => {
          for (let i = 0; i < watchCount; i++) {
            const state = runtime.ref(i)
            runtime.watch(() => state.value, () => {})
          }
        })
        
        scope.stop()
        
        const isActive = scope.run(() => true)
        expect(isActive).toBeUndefined()
      })

      it('should support nested scopes', () => {
        const runtime = createRuntime()
        let outerWatchCalled = false
        let innerWatchCalled = false

        const outerScope = runtime.effectScope()
        
        outerScope.run(() => {
          const outerRef = runtime.ref(0)
          runtime.watch(() => outerRef.value, () => {
            outerWatchCalled = true
          }, { immediate: true })

          expect(outerWatchCalled).toBe(true)

          const innerScope = runtime.effectScope()
          innerScope.run(() => {
            const innerRef = runtime.ref(0)
            runtime.watch(() => innerRef.value, () => {
              innerWatchCalled = true
            }, { immediate: true })
            
            expect(innerWatchCalled).toBe(true)
          })
          
          innerScope.stop()
        })

        outerScope.stop()
      })

      it('should not collect new effects after stop', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()
        
        scope.run(() => {
          const ref1 = runtime.ref(0)
          runtime.watch(() => ref1.value, () => {})
        })

        scope.stop()

        const result = scope.run(() => {
          const ref2 = runtime.ref(0)
          runtime.watch(() => ref2.value, () => {})
          return 'executed'
        })

        expect(result).toBeUndefined()
      })

      it('should handle multiple stop() calls safely', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()
        
        scope.run(() => {
          const ref = runtime.ref(0)
          runtime.watch(() => ref.value, () => {})
        })

        scope.stop()
        scope.stop()
        scope.stop()

        expect(true).toBe(true)
      })
    })

    describe('unref and isRef', () => {
      it('should unref a ref', () => {
        const runtime = createRuntime()
        const count = runtime.ref(10)
        expect(runtime.unref(count)).toBe(10)
      })

      it('should unref a computed', () => {
        const runtime = createRuntime()
        const count = runtime.ref(10)
        const doubled = runtime.computed(() => count.value * 2)
        expect(runtime.unref(doubled)).toBe(20)
      })

      it('should return plain value as-is', () => {
        const runtime = createRuntime()
        expect(runtime.unref(42)).toBe(42)
        expect(runtime.unref('hello')).toBe('hello')
      })

      it('should detect ref', () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        expect(runtime.isRef(count)).toBe(true)
      })

      it('should detect computed as ref', () => {
        const runtime = createRuntime()
        const doubled = runtime.computed(() => 0)
        expect(runtime.isRef(doubled)).toBe(true)
      })

      it('should not detect plain values as ref', () => {
        const runtime = createRuntime()
        expect(runtime.isRef(42)).toBe(false)
        expect(runtime.isRef('hello')).toBe(false)
        expect(runtime.isRef(null)).toBe(false)
        expect(runtime.isRef(undefined)).toBe(false)
        expect(runtime.isRef({})).toBe(false)
      })
    })
  })
}
