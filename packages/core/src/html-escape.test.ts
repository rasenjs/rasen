/**
 * The shared style serializer.
 *
 * `bindStyle` (DOM) accepts a style object whose values may be refs or getters
 * per declaration; the string renderer has to resolve exactly the same shapes,
 * so these cases mirror that contract.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useReactiveRuntime, createReactiveRuntime } from '@rasenjs/reactive-vue'
import { renderText, stringifyStyleInline } from './html-escape'

describe('@rasenjs/core - stringifyStyleInline', () => {
  it('should convert camelCase keys to kebab-case', () => {
    expect(stringifyStyleInline({ backgroundColor: 'blue', color: 'red' })).toBe(
      'background-color: blue; color: red'
    )
  })

  it('should stringify numbers', () => {
    expect(stringifyStyleInline({ fontSize: 16 })).toBe('font-size: 16')
  })

  it('should skip null and undefined values', () => {
    expect(
      stringifyStyleInline({ color: 'red', backgroundColor: null, top: undefined })
    ).toBe('color: red')
  })

  it('should resolve a getter value', () => {
    // A declaration bound to a condition must not serialize as function source.
    const visible = () => true
    expect(
      stringifyStyleInline({ opacity: () => (visible() ? '1' : '0') })
    ).toBe('opacity: 1')
  })

  describe('with a reactive runtime installed', () => {
    beforeEach(() => {
      useReactiveRuntime()
    })

    it('should resolve a ref value', () => {
      const runtime = createReactiveRuntime()
      const opacity = runtime.ref('0.5')
      expect(stringifyStyleInline({ opacity })).toBe('opacity: 0.5')
    })

    it('should resolve a ref on one key and keep another static', () => {
      const runtime = createReactiveRuntime()
      const opacity = runtime.ref(0)
      expect(
        stringifyStyleInline({ opacity, position: 'absolute' })
      ).toBe('opacity: 0; position: absolute')
    })
  })
})

describe('@rasenjs/core - renderText', () => {
  it('stringifies values and drops nullish / boolean noise', () => {
    expect(renderText('hi')).toBe('hi')
    expect(renderText(42)).toBe('42')
    expect(renderText(null)).toBe('')
    expect(renderText(undefined)).toBe('')
    expect(renderText(false)).toBe('')
  })

  it('throws on a function instead of printing its source', () => {
    // A function in a child position is a mountable. `String(fn)` would paint
    // the function's source into the page, which is how a hoisted
    // `{text({ content })}` / `{markdownBlock(x)}` used to look.
    const mountable = (host: unknown) => host
    expect(() => renderText(mountable)).toThrow(/renderText\(\) received a function/)
  })
})
