/**
 * @rasenjs/rn-dom — Shared utility tests
 */

import { describe, it, expect } from 'vitest'
import { parseCSS, normalizeEventName, isEvent, applyStylePatch } from '../utils'

describe('parseCSS', () => {
  it('parses a simple CSS string', () => {
    expect(parseCSS('color: red; font-size: 16')).toEqual({
      color: 'red',
      fontSize: 16,
    })
  })

  it('parses numeric values', () => {
    expect(parseCSS('flex: 1; opacity: 0.5')).toEqual({ flex: 1, opacity: 0.5 })
  })

  it('keeps non-numeric string values as strings', () => {
    expect(parseCSS('display: flex')).toEqual({ display: 'flex' })
  })

  it('handles vendor-prefixed properties', () => {
    expect(parseCSS('-webkit-line-clamp: 2')).toEqual({ WebkitLineClamp: 2 })
  })

  it('returns empty object for empty input', () => {
    expect(parseCSS('')).toEqual({})
  })

  it('skips malformed declarations', () => {
    expect(parseCSS('color')).toEqual({})
  })

  it('handles missing semicolon at end', () => {
    expect(parseCSS('color: red')).toEqual({ color: 'red' })
  })
})

describe('normalizeEventName', () => {
  it('passes through onTouchEnd', () => {
    expect(normalizeEventName('onTouchEnd')).toBe('onTouchEnd')
  })

  it('maps click to onTouchEnd (RN alias)', () => {
    expect(normalizeEventName('onclick')).toBe('onTouchEnd')
    expect(normalizeEventName('onClick')).toBe('onTouchEnd')
  })

  it('maps ontouchend to onTouchEnd', () => {
    expect(normalizeEventName('ontouchend')).toBe('onTouchEnd')
  })

  it('maps oninput to onChange', () => {
    expect(normalizeEventName('oninput')).toBe('onChange')
    expect(normalizeEventName('onInput')).toBe('onChange')
  })

  it('handles on: prefix', () => {
    expect(normalizeEventName('on:click')).toBe('onClick')
    expect(normalizeEventName('on:submit')).toBe('onSubmit')
  })

  it('uppercases first letter after on', () => {
    expect(normalizeEventName('onscroll')).toBe('onScroll')
    expect(normalizeEventName('onfocus')).toBe('onFocus')
  })
})

describe('isEvent', () => {
  it('returns true for on-prefixed keys', () => {
    expect(isEvent('onClick')).toBe(true)
    expect(isEvent('onTouchEnd')).toBe(true)
    expect(isEvent('onChange')).toBe(true)
  })

  it('returns false for non-event keys', () => {
    expect(isEvent('style')).toBe(false)
    expect(isEvent('class')).toBe(false)
    expect(isEvent('on')).toBe(false)
    expect(isEvent('o')).toBe(false)
  })

  it('checks char codes correctly', () => {
    // on = charCode 111, 110
    expect(isEvent('onSomething')).toBe(true)
    expect(isEvent('on123')).toBe(true)
  })
})

describe('applyStylePatch', () => {
  it('sets new style properties', () => {
    const setProperty = vi.fn()
    const removeProperty = vi.fn()
    applyStylePatch(setProperty, removeProperty, null, { color: 'red', fontSize: 16 })
    expect(setProperty).toHaveBeenCalledWith('color', 'red')
    expect(setProperty).toHaveBeenCalledWith('fontSize', 16)
    expect(removeProperty).not.toHaveBeenCalled()
  })

  it('removes old style properties not in new', () => {
    const setProperty = vi.fn()
    const removeProperty = vi.fn()
    applyStylePatch(setProperty, removeProperty, { color: 'red', fontSize: 16 }, { color: 'blue' })
    expect(removeProperty).toHaveBeenCalledWith('fontSize')
    expect(setProperty).toHaveBeenCalledWith('color', 'blue')
  })

  it('handles string CSS for prev', () => {
    const setProperty = vi.fn()
    const removeProperty = vi.fn()
    applyStylePatch(setProperty, removeProperty, 'color: red; font-size: 16', {})
    expect(removeProperty).toHaveBeenCalledWith('color')
    expect(removeProperty).toHaveBeenCalledWith('fontSize')
  })

  it('handles null prev', () => {
    const setProperty = vi.fn()
    const removeProperty = vi.fn()
    applyStylePatch(setProperty, removeProperty, null, { opacity: 1 })
    expect(setProperty).toHaveBeenCalledWith('opacity', 1)
    expect(removeProperty).not.toHaveBeenCalled()
  })

  it('handles null next', () => {
    const setProperty = vi.fn()
    const removeProperty = vi.fn()
    applyStylePatch(setProperty, removeProperty, { color: 'red' }, null)
    expect(removeProperty).toHaveBeenCalledWith('color')
    expect(setProperty).not.toHaveBeenCalled()
  })
})
