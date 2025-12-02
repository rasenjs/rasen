/**
 * modifier-chain 工具测试
 */

import { describe, it, expect } from 'vitest'
import {
  createModifierChain,
  createFlagPlugin,
  createValuePlugin,
  createAccumulatorPlugin,
  type ModifierPlugin
} from './modifier-chain'

describe('modifier-chain', () => {
  // ============================================
  // 插件创建测试
  // ============================================

  describe('createFlagPlugin', () => {
    it('应该创建一个标志插件', () => {
      const plugin = createFlagPlugin('prevent')
      expect(plugin.name).toBe('prevent')

      const result = plugin.apply({})
      expect(result).toEqual({ prevent: true })
    })

    it('应该保留已有的 options', () => {
      const plugin = createFlagPlugin('stop')
      const result = plugin.apply({ existing: 'value' })
      expect(result).toEqual({ existing: 'value', stop: true })
    })
  })

  describe('createValuePlugin', () => {
    it('应该创建一个值插件', () => {
      const plugin = createValuePlugin('debounce', 300)
      expect(plugin.name).toBe('debounce')

      const result = plugin.apply({})
      expect(result).toEqual({ debounce: 300 })
    })

    it('应该支持任意类型的值', () => {
      const plugin = createValuePlugin('config', { a: 1, b: 2 })
      const result = plugin.apply({})
      expect(result).toEqual({ config: { a: 1, b: 2 } })
    })
  })

  describe('createAccumulatorPlugin', () => {
    it('应该创建一个累积插件', () => {
      const plugin = createAccumulatorPlugin('keys', 'enter')
      expect(plugin.name).toBe('keys')

      const result = plugin.apply({})
      expect(result).toEqual({ keys: ['enter'] })
    })

    it('应该累积多个值', () => {
      const plugin1 = createAccumulatorPlugin('modifiers', 'ctrl')
      const plugin2 = createAccumulatorPlugin('modifiers', 'shift')

      let result = plugin1.apply({})
      result = plugin2.apply(result)

      expect(result).toEqual({ modifiers: ['ctrl', 'shift'] })
    })
  })

  // ============================================
  // 修饰器链测试
  // ============================================

  describe('createModifierChain', () => {
    const preventPlugin = createFlagPlugin('prevent')
    const stopPlugin = createFlagPlugin('stop')
    const capturePlugin = createFlagPlugin('capture')

    it('应该创建一个修饰器链', () => {
      const chain = createModifierChain([preventPlugin, stopPlugin])
      expect(chain).toBeDefined()
      expect(typeof chain).toBe('function')
    })

    it('应该支持链式调用', () => {
      const chain = createModifierChain([preventPlugin, stopPlugin])
      const modified = chain.prevent.stop
      expect(modified.options).toEqual({ prevent: true, stop: true })
    })

    it('应该支持终结调用', () => {
      const chain = createModifierChain([preventPlugin, stopPlugin])
      const handler = () => {}
      const result = chain.prevent.stop(handler)

      expect(result.target).toBe(handler)
      expect(result.options).toEqual({ prevent: true, stop: true })
    })

    it('应该支持空括号调用', () => {
      const chain = createModifierChain([preventPlugin, stopPlugin])
      const result = chain.prevent().stop()
      expect(result.options).toEqual({ prevent: true, stop: true })
    })

    it('应该支持自定义终结器', () => {
      const finalizer = (target: () => void, options: object) => {
        return { fn: target, opts: options, processed: true }
      }

      const chain = createModifierChain([preventPlugin], finalizer)
      const handler = () => {}
      const result = chain.prevent(handler)

      expect(result).toEqual({
        fn: handler,
        opts: { prevent: true },
        processed: true
      })
    })

    it('应该支持多个插件组合', () => {
      const chain = createModifierChain([
        preventPlugin,
        stopPlugin,
        capturePlugin
      ])
      const result = chain.prevent.stop.capture(() => {})

      expect(result.options).toEqual({
        prevent: true,
        stop: true,
        capture: true
      })
    })

    it('应该支持参数对象', () => {
      const chain = createModifierChain([preventPlugin])
      const result = chain.prevent({ custom: 'value' })

      expect(result.options).toEqual({ prevent: true, custom: 'value' })
    })

    it('应该支持终结时传参', () => {
      const chain = createModifierChain([preventPlugin])
      const handler = () => {}
      const result = chain.prevent(handler, { extra: 123 })

      expect(result.target).toBe(handler)
      expect(result.options).toEqual({ prevent: true, extra: 123 })
    })

    it('options 属性应该返回当前累积的选项', () => {
      const chain = createModifierChain([preventPlugin, stopPlugin])
      expect(chain.options).toEqual({})
      expect(chain.prevent.options).toEqual({ prevent: true })
      expect(chain.prevent.stop.options).toEqual({ prevent: true, stop: true })
    })
  })

  // ============================================
  // 自定义插件测试
  // ============================================

  describe('自定义插件', () => {
    it('应该支持自定义插件实现', () => {
      const customPlugin: ModifierPlugin<'custom', { customValue: number }> = {
        name: 'custom',
        apply: (options) => ({ ...options, customValue: 42 })
      }

      const chain = createModifierChain([customPlugin])
      const result = chain.custom(() => {})

      expect(result.options).toEqual({ customValue: 42 })
    })

    it('应该支持复杂的插件逻辑', () => {
      let counter = 0
      const counterPlugin: ModifierPlugin<'count', { count: number }> = {
        name: 'count',
        apply: (options) => ({ ...options, count: ++counter })
      }

      const chain = createModifierChain([counterPlugin])
      
      chain.count(() => {})
      const result1 = chain.count(() => {})
      
      expect((result1.options as { count: number }).count).toBe(2)
    })
  })

  // ============================================
  // 边界情况测试
  // ============================================

  describe('边界情况', () => {
    it('应该处理空插件列表', () => {
      const chain = createModifierChain([])
      const handler = () => {}
      const result = chain(handler)

      expect(result.target).toBe(handler)
      expect(result.options).toEqual({})
    })

    it('访问不存在的插件应该返回 undefined', () => {
      const chain = createModifierChain([createFlagPlugin('a')])
      // @ts-expect-error - 测试不存在的属性
      expect(chain.nonexistent).toBeUndefined()
    })

    it('应该正确处理 Symbol 属性', () => {
      const chain = createModifierChain([createFlagPlugin('a')])
      // @ts-expect-error - 测试 Symbol 属性
      expect(chain[Symbol.toStringTag]).toBeUndefined()
    })
  })
})
