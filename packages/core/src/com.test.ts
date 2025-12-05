/**
 * com 组件包装器测试 - 内存泄漏检测
 * 
 * 通过验证 cleanup 函数被正确调用来检测内存泄漏
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { setReactiveRuntime, getReactiveRuntime } from './reactive'
import { createReactiveRuntime } from '@rasenjs/reactive-signals'
import { com } from './com'

describe('com - 内存泄漏检测', () => {
  beforeEach(() => {
    setReactiveRuntime(createReactiveRuntime())
  })

  it('单个组件创建和销毁应该调用 cleanup', () => {
    let cleanupCalled = false
    
    const Component = com(() => {
      const runtime = getReactiveRuntime()
      const count = runtime.ref(0)
      
      return (_host: unknown) => {
        runtime.watch(() => count.value, () => {})
        
        return () => {
          cleanupCalled = true
        }
      }
    })

    const mountable = Component()
    const unmount = mountable({})
    
    expect(cleanupCalled).toBe(false)
    unmount()
    expect(cleanupCalled).toBe(true)
  })

  it('多个组件创建和销毁都应该调用各自的 cleanup', () => {
    const cleanupFlags: boolean[] = []
    
    const Component = com((index: number) => {
      const runtime = getReactiveRuntime()
      const value = runtime.ref(index)
      
      return (_host: unknown) => {
        runtime.watch(() => value.value, () => {})
        
        return () => {
          cleanupFlags[index] = true
        }
      }
    })

    const count = 100
    const unmounts: Array<() => void> = []
    
    for (let i = 0; i < count; i++) {
      cleanupFlags[i] = false
      const mountable = Component(i)
      const unmount = mountable({})
      unmounts.push(unmount)
    }

    // 验证所有 cleanup 都未调用
    expect(cleanupFlags.every(f => f === false)).toBe(true)
    
    // 销毁所有组件
    unmounts.forEach(unmount => unmount())
    
    // 验证所有 cleanup 都被调用
    expect(cleanupFlags.every(f => f === true)).toBe(true)
  })

  it('组件内多个 watch 应该通过 scope 自动清理', () => {
    let userCleanupCalled = false
    
    const Component = com(() => {
      const runtime = getReactiveRuntime()
      // 创建多个响应式状态
      const states = Array.from({ length: 10 }, (_, i) => runtime.ref(i))
      
      return (_host: unknown) => {
        // 为每个状态创建 watch - 由 scope 自动管理
        states.forEach(state => {
          runtime.watch(() => state.value, () => {})
        })
        
        return () => {
          userCleanupCalled = true
        }
      }
    })

    const mountable = Component()
    const unmount = mountable({})
    
    expect(userCleanupCalled).toBe(false)
    unmount()
    expect(userCleanupCalled).toBe(true)
    // scope.stop() 会自动清理所有 watch
  })

  it('嵌套组件树应该正确清理', () => {
    const cleanupLog: string[] = []
    
    const LeafComponent = com((id: string) => {
      const runtime = getReactiveRuntime()
      const value = runtime.ref(id)
      
      return (_host: unknown) => {
        runtime.watch(() => value.value, () => {})
        
        return () => {
          cleanupLog.push(`leaf-${id}`)
        }
      }
    })

    const ContainerComponent = com((childCount: number) => {
      const runtime = getReactiveRuntime()
      const state = runtime.ref(0)
      
      return (_host: unknown) => {
        runtime.watch(() => state.value, () => {})
        
        // 创建子组件
        const childUnmounts: Array<() => void> = []
        for (let i = 0; i < childCount; i++) {
          const childMountable = LeafComponent(`child-${i}`)
          const childUnmount = childMountable({})
          childUnmounts.push(childUnmount)
        }
        
        return () => {
          cleanupLog.push('container')
          childUnmounts.forEach(unmount => unmount())
        }
      }
    })

    const childCount = 5
    const mountable = ContainerComponent(childCount)
    const unmount = mountable({})

    expect(cleanupLog.length).toBe(0)
    unmount()
    
    // 容器 cleanup 应该被调用
    expect(cleanupLog).toContain('container')
    // 所有子组件 cleanup 应该被调用
    for (let i = 0; i < childCount; i++) {
      expect(cleanupLog).toContain(`leaf-child-${i}`)
    }
    expect(cleanupLog.length).toBe(childCount + 1)
  })

  it('循环创建销毁大量组件不应累积错误', () => {
    const cycles = 10
    const instancesPerCycle = 100
    
    for (let cycle = 0; cycle < cycles; cycle++) {
      const cleanupFlags = new Array(instancesPerCycle).fill(false)
      
      const Component = com((id: number) => {
        const runtime = getReactiveRuntime()
        const items = Array.from({ length: 10 }, (_, i) => runtime.ref(i))
        
        return (_host: unknown) => {
          // 监听所有项
          items.forEach(item => {
            runtime.watch(() => item.value, () => {})
          })
          
          return () => {
            cleanupFlags[id] = true
          }
        }
      })

      const unmounts: Array<() => void> = []
      
      for (let i = 0; i < instancesPerCycle; i++) {
        const mountable = Component(i)
        const unmount = mountable({})
        unmounts.push(unmount)
      }
      
      // 销毁所有
      unmounts.forEach(unmount => unmount())
      
      // 每轮循环后验证清理
      expect(cleanupFlags.every(f => f === true)).toBe(true)
    }
  })

  it('部分销毁组件不应影响其他组件', () => {
    const cleanupFlags = new Array(100).fill(false)
    
    const Component = com((id: number) => {
      const runtime = getReactiveRuntime()
      const state = runtime.ref(id)
      const doubled = runtime.computed(() => state.value * 2)
      
      return (_host: unknown) => {
        runtime.watch(() => state.value, () => {})
        runtime.watch(() => doubled.value, () => {})
        
        return () => {
          cleanupFlags[id] = true
        }
      }
    })

    const unmounts: Array<() => void> = []
    
    for (let i = 0; i < 100; i++) {
      const mountable = Component(i)
      const unmount = mountable({})
      unmounts.push(unmount)
    }

    // 销毁偶数索引的组件
    for (let i = 0; i < 100; i += 2) {
      unmounts[i]()
      expect(cleanupFlags[i]).toBe(true)
    }

    // 验证奇数索引还未清理
    for (let i = 1; i < 100; i += 2) {
      expect(cleanupFlags[i]).toBe(false)
    }

    // 销毁剩余组件
    for (let i = 1; i < 100; i += 2) {
      unmounts[i]()
    }

    // 全部清理完成
    expect(cleanupFlags.every(f => f === true)).toBe(true)
  })

  it('setup 阶段和 mount 阶段的 watch 都应该通过 scope 清理', () => {
    let cleanupCalled = false
    
    const Component = com(() => {
      const runtime = getReactiveRuntime()
      const setupState = runtime.ref(0)
      
      // setup 阶段创建 watch - scope.stop() 会清理
      runtime.watch(() => setupState.value, () => {})
      
      return (_host: unknown) => {
        const mountState = runtime.ref(10)
        
        // mount 阶段创建 watch - scope.stop() 也会清理
        runtime.watch(() => mountState.value, () => {})
        
        return () => {
          cleanupCalled = true
        }
      }
    })

    const mountable = Component()
    const unmount = mountable({})

    expect(cleanupCalled).toBe(false)
    unmount()
    expect(cleanupCalled).toBe(true)
  })

  it('异步组件应该正确清理', async () => {
    let cleanupCalled = false
    
    const AsyncComponent = com(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const runtime = getReactiveRuntime()
      const data = runtime.ref({ value: 42 })
      const processed = runtime.computed(() => data.value.value * 2)
      
      return (_host: unknown) => {
        runtime.watch(() => data.value, () => {})
        runtime.watch(() => processed.value, () => {})
        
        return () => {
          cleanupCalled = true
        }
      }
    })

    const mountablePromise = AsyncComponent()
    const mountable = await mountablePromise
    const unmount = mountable({})

    expect(cleanupCalled).toBe(false)
    unmount()
    expect(cleanupCalled).toBe(true)
  })

  it('极限压力测试 - 5000 个组件', () => {
    const count = 5000
    const cleanupFlags = new Array(count).fill(false)
    
    const StressComponent = com((id: number) => {
      const runtime = getReactiveRuntime()
      const states = Array.from({ length: 10 }, (_, i) => runtime.ref(id * 10 + i))
      
      return (_host: unknown) => {
        states.forEach(state => {
          runtime.watch(() => state.value, () => {})
        })
        
        return () => {
          cleanupFlags[id] = true
        }
      }
    })

    const unmounts: Array<() => void> = []

    for (let i = 0; i < count; i++) {
      const mountable = StressComponent(i)
      const unmount = mountable({})
      unmounts.push(unmount)
    }

    unmounts.forEach(unmount => unmount())

    expect(cleanupFlags.every(f => f === true)).toBe(true)
  })
})
