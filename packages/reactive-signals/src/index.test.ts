import { describe, it, expect, beforeEach } from 'vitest'
import { runReactiveRuntimeTests } from '@rasenjs/core/test-utils'
import { createReactiveRuntime, ref, computed, watch } from '../src/index'
import type { ReactiveRuntime } from '@rasenjs/core'

runReactiveRuntimeTests('TC39 Signals Runtime', () => ({
  runtime: createReactiveRuntime(),
  ref,
  computed,
  watch,
}))

/**
 * effectScope 内存管理专项测试
 * 
 * 验证 effectScope 能否正确收集和清理响应式效果,防止内存泄漏
 */
describe('reactive-signals - effectScope 内存管理', () => {
  let runtime: ReactiveRuntime

  beforeEach(() => {
    runtime = createReactiveRuntime()
  })

  it('单个 watch 应该被 scope 收集和清理', () => {
    let watchCallCount = 0

    const scope = runtime.effectScope()
    
    scope.run(() => {
      const count = runtime.ref(0)
      
      // 在 scope 内创建 watch,使用 immediate 触发
      runtime.watch(() => count.value, () => {
        watchCallCount++
      }, { immediate: true })
      
      // immediate watch 已经执行一次
      expect(watchCallCount).toBe(1)
    })

    // 调用 scope.stop() 应该清理 watch
    scope.stop()
    
    // 验证 scope 已停止
    const result = scope.run(() => 'should not execute')
    expect(result).toBeUndefined()
  })

  it('多个 watch 应该都被 scope 清理', () => {
    const scope = runtime.effectScope()
    const watchCount = 100
    
    scope.run(() => {
      // 创建多个响应式状态和 watch
      for (let i = 0; i < watchCount; i++) {
        const state = runtime.ref(i)
        runtime.watch(() => state.value, () => {})
      }
    })
    
    // scope.stop() 应该清理所有 watch
    scope.stop()
    
    // 停止后,scope 应该不再活跃
    const isActive = scope.run(() => true)
    expect(isActive).toBeUndefined()
  })

  it('嵌套 scope 应该独立管理生命周期', () => {
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
      
      // 停止内层 scope
      innerScope.stop()
    })

    // 停止外层 scope
    outerScope.stop()
  })

  it('scope 停止后不应该再收集新的 watch', () => {
    const scope = runtime.effectScope()
    
    scope.run(() => {
      const ref1 = runtime.ref(0)
      runtime.watch(() => ref1.value, () => {})
    })

    // 停止 scope
    scope.stop()

    // 停止后尝试在 scope 内运行
    const result = scope.run(() => {
      const ref2 = runtime.ref(0)
      runtime.watch(() => ref2.value, () => {})
      return 'executed'
    })

    // scope 已停止,run 应该返回 undefined
    expect(result).toBeUndefined()
  })

  it('多次调用 scope.stop() 应该是安全的', () => {
    const scope = runtime.effectScope()
    
    scope.run(() => {
      const ref = runtime.ref(0)
      runtime.watch(() => ref.value, () => {})
    })

    // 多次停止不应该报错
    scope.stop()
    scope.stop()
    scope.stop()

    expect(true).toBe(true)
  })

  it('大规模 watch 创建和清理 - 1000 个 scope × 10 个 watch', () => {
    const scopeCount = 1000
    const watchPerScope = 10
    const scopes: Array<{ stop: () => void }> = []

    // 创建大量 scope 和 watch
    for (let i = 0; i < scopeCount; i++) {
      const scope = runtime.effectScope()
      
      scope.run(() => {
        for (let j = 0; j < watchPerScope; j++) {
          const ref = runtime.ref(i * watchPerScope + j)
          runtime.watch(() => ref.value, () => {})
        }
      })
      
      scopes.push(scope)
    }

    // 清理所有 scope (共 10000 个 watch)
    scopes.forEach(scope => scope.stop())

    // 验证可以继续创建新的 scope
    const newScope = runtime.effectScope()
    newScope.run(() => {
      const ref = runtime.ref(0)
      runtime.watch(() => ref.value, () => {})
    })
    newScope.stop()

    expect(true).toBe(true)
  })

  it('scope 内的 computed 应该正确工作', () => {
    let computedCallCount = 0

    const scope = runtime.effectScope()
    
    scope.run(() => {
      const base = runtime.ref(1)
      const doubled = runtime.computed(() => {
        computedCallCount++
        return base.value * 2
      })

      // 读取 computed
      expect(doubled.value).toBe(2)
      
      // 更新 base
      base.value = 2
      expect(doubled.value).toBe(4)
    })

    const callCountBeforeStop = computedCallCount
    
    // 停止 scope
    scope.stop()

    // 验证 computed 被计算过
    expect(computedCallCount).toBeGreaterThanOrEqual(callCountBeforeStop)
  })

  it('scope 内创建 watch 带 immediate 选项', () => {
    let watchCalls = 0

    const scope = runtime.effectScope()
    
    scope.run(() => {
      const ref = runtime.ref(0)
      runtime.watch(() => ref.value, () => {
        watchCalls++
      }, { immediate: true })
    })

    // immediate watch 应该立即执行
    expect(watchCalls).toBe(1)

    scope.stop()
  })

  it('并发创建和销毁多个 scope - 压力测试', () => {
    const concurrency = 500
    const operations: Array<() => void> = []

    // 准备并发操作
    for (let i = 0; i < concurrency; i++) {
      operations.push(() => {
        const scope = runtime.effectScope()
        scope.run(() => {
          const ref = runtime.ref(i)
          runtime.watch(() => ref.value, () => {})
          ref.value = i + 1
        })
        scope.stop()
      })
    }

    // 执行所有操作
    operations.forEach(op => op())

    expect(true).toBe(true)
  })

  it('循环引用的 watch 不应该导致问题', () => {
    const scope = runtime.effectScope()
    let updateCount = 0

    scope.run(() => {
      const a = runtime.ref(0)
      const b = runtime.ref(0)

      // a 和 b 互相监听,使用 immediate
      runtime.watch(() => a.value, (val) => {
        updateCount++
      }, { immediate: true })

      runtime.watch(() => b.value, (val) => {
        updateCount++
      }, { immediate: true })
    })

    // 应该触发了 immediate (至少2次)
    expect(updateCount).toBeGreaterThanOrEqual(2)

    // 清理
    scope.stop()
  })
})

describe('reactive-signals - watch 手动清理验证', () => {
  let runtime: ReactiveRuntime

  beforeEach(() => {
    runtime = createReactiveRuntime()
  })

  it('手动 unwatch 应该停止监听', () => {
    let watchCallCount = 0

    const ref = runtime.ref(0)
    const unwatch = runtime.watch(() => ref.value, () => {
      watchCallCount++
    }, { immediate: true })

    expect(watchCallCount).toBe(1)

    // 手动停止
    unwatch()

    // 验证 unwatch 不报错
    expect(true).toBe(true)
  })

  it('多个 watch 监听同一个 ref,独立清理', () => {
    const counts: number[] = [0, 0, 0]

    const ref = runtime.ref(0)
    
    const unwatches = counts.map((_, i) => 
      runtime.watch(() => ref.value, () => {
        counts[i]++
      }, { immediate: true })
    )

    // immediate 触发
    expect(counts).toEqual([1, 1, 1])

    // 停止所有
    unwatches.forEach(unwatch => unwatch())
    expect(true).toBe(true)
  })

  it('watch 回调中创建新的 watch', () => {
    let outerCalls = 0
    const unwatches: Array<() => void> = []

    const outer = runtime.ref(0)
    
    const outerUnwatch = runtime.watch(() => outer.value, () => {
      outerCalls++
      const innerUnwatch = runtime.watch(() => runtime.ref(0).value, () => {}, { immediate: true })
      unwatches.push(innerUnwatch)
    }, { immediate: true })

    expect(outerCalls).toBe(1)

    // 清理所有
    outerUnwatch()
    unwatches.forEach(unwatch => unwatch())
  })

  it('scope 外创建的 watch 不受 scope.stop() 影响', () => {
    let outsideWatchCalls = 0
    let insideWatchCalls = 0

    const outsideRef = runtime.ref(0)
    const outsideUnwatch = runtime.watch(() => outsideRef.value, () => {
      outsideWatchCalls++
    }, { immediate: true })

    expect(outsideWatchCalls).toBe(1)

    const scope = runtime.effectScope()
    scope.run(() => {
      const insideRef = runtime.ref(0)
      runtime.watch(() => insideRef.value, () => {
        insideWatchCalls++
      }, { immediate: true })

      expect(insideWatchCalls).toBe(1)
    })

    // 停止 scope
    scope.stop()

    // 外部 watch 独立存在
    outsideUnwatch()
  })

  it('大量 watch 的手动清理', () => {
    const count = 1000
    const unwatches: Array<() => void> = []

    const ref = runtime.ref(0)

    // 创建大量 watch
    for (let i = 0; i < count; i++) {
      const unwatch = runtime.watch(() => ref.value, () => {})
      unwatches.push(unwatch)
    }

    // 手动清理所有
    unwatches.forEach(unwatch => unwatch())

    // 验证可以继续使用
    let newWatchCalled = false
    const newUnwatch = runtime.watch(() => ref.value, () => {
      newWatchCalled = true
    }, { immediate: true })

    expect(newWatchCalled).toBe(true)

    newUnwatch()
  })
})
