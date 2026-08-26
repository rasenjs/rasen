/**
 * 通用响应式系统测试套件
 * 用于测试不同响应式运行时的兼容性
 *
 * 契约成员：ref / setValue / unref / isRef / effectScope / subscribe。
 * （watch 与 computed 已移出接口——用户业务直接使用所选响应式库的原生 API。）
 */

import { describe, it, expect, vi } from 'vitest'
import type { ReactiveRuntime } from './reactive'

/** 等待异步投递（兼容同步与微任务批处理两种适配器时序） */
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

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
        expect(runtime.unref(count)).toBe(0)

        runtime.setValue(count, 5)
        expect(runtime.unref(count)).toBe(5)
      })
    })

    describe('subscribe', () => {
      it('should deliver changes but not the initial value', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()

        runtime.subscribe(() => runtime.unref(count), callback)

        // 初始值不回调（调用方自行读取初值写入）
        await tick()
        expect(callback).not.toHaveBeenCalled()

        runtime.setValue(count, 5)
        await tick()

        expect(callback).toHaveBeenCalledTimes(1)
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(5)
        expect(firstCall[1]).toBe(0)
      })

      it('should skip callbacks when the value is unchanged', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()

        runtime.subscribe(() => runtime.unref(count), callback)

        runtime.setValue(count, 5)
        await tick()
        expect(callback).toHaveBeenCalledTimes(1)

        // 等值写入不触发（Object.is 门控）
        runtime.setValue(count, 5)
        await tick()
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should never fire for static getters (no reactive deps)', async () => {
        const runtime = createRuntime()
        const item = { label: 'Static' }
        const callback = vi.fn()

        // 普通对象属性读取收集不到任何依赖——静态零订阅契约
        runtime.subscribe(() => item.label, callback)

        item.label = 'Changed'
        await tick()
        expect(callback).not.toHaveBeenCalled()
      })

      it('should stop when stop is called', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()

        const stop = runtime.subscribe(() => runtime.unref(count), callback)

        runtime.setValue(count, 5)
        await tick()
        expect(callback).toHaveBeenCalledTimes(1)

        stop()

        runtime.setValue(count, 10)
        await tick()
        expect(callback).toHaveBeenCalledTimes(1) // Should not be called again
      })

      it('should track multiple dependencies', async () => {
        const runtime = createRuntime()
        const a = runtime.ref(1)
        const b = runtime.ref(2)
        const callback = vi.fn()

        runtime.subscribe(() => runtime.unref(a) + runtime.unref(b), callback)

        runtime.setValue(a, 10)
        await tick()
        expect(callback).toHaveBeenCalledTimes(1)
        const firstCall = callback.mock.calls[0]
        expect(firstCall[0]).toBe(12)
        expect(firstCall[1]).toBe(3)

        runtime.setValue(b, 20)
        await tick()
        expect(callback).toHaveBeenCalledTimes(2)
        const secondCall = callback.mock.calls[1]
        expect(secondCall[0]).toBe(30)
        expect(secondCall[1]).toBe(12)
      })
    })

    describe('runtime integration', () => {
      it('should work with runtime.subscribe', async () => {
        const runtime = createRuntime()
        const count = runtime.ref(0)
        const callback = vi.fn()

        runtime.subscribe(() => runtime.unref(count), callback)

        runtime.setValue(count, 5)
        await tick()

        expect(callback).toHaveBeenCalled()
      })
    })

    describe('effectScope', () => {
      it('should return the run result while active', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()

        const result = scope.run(() => 'value')
        expect(result).toBe('value')
      })

      it('should not execute after stop', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()

        scope.run(() => {})
        scope.stop()

        const result = scope.run(() => 'should not execute')
        expect(result).toBeUndefined()
      })

      it('should support nested scopes', () => {
        const runtime = createRuntime()

        const outerScope = runtime.effectScope()
        outerScope.run(() => {
          const innerScope = runtime.effectScope()
          innerScope.run(() => 'inner')
          innerScope.stop()
        })
        outerScope.stop()

        expect(true).toBe(true)
      })

      it('should handle multiple stop() calls safely', () => {
        const runtime = createRuntime()
        const scope = runtime.effectScope()

        scope.run(() => {})
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

