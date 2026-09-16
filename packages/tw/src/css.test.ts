import { describe, expect, it } from 'vitest'
import { convertValue, cssToStyle, kebabToCamel } from './css'

describe('kebabToCamel()', () => {
  it('converts kebab-case to camelCase', () => {
    expect(kebabToCamel('padding-top')).toBe('paddingTop')
    expect(kebabToCamel('row-gap')).toBe('rowGap')
    expect(kebabToCamel('border-top-left-radius')).toBe('borderTopLeftRadius')
    expect(kebabToCamel('display')).toBe('display')
  })
})

describe('convertValue()', () => {
  it('converts px to numbers', () => {
    expect(convertValue('16px')).toBe(16)
    expect(convertValue('0')).toBe(0)
    expect(convertValue('1.5')).toBe(1.5)
  })

  it('converts rem to px', () => {
    expect(convertValue('2rem')).toBe(32)
  })

  it('expands 3-digit hex', () => {
    expect(convertValue('#fff')).toBe('#ffffff')
    expect(convertValue('#3b82f6')).toBe('#3b82f6')
  })

  it('evaluates calc() to a px number', () => {
    expect(convertValue('calc(100% - 20px)')).toBe(80)
    expect(convertValue('calc(1rem - 4px)')).toBe(12)
  })

  it('strips quotes and !important', () => {
    expect(convertValue('"Menlo"')).toBe('Menlo')
    expect(convertValue('16px !important')).toBe(16)
  })

  it('keeps non-numeric values as strings', () => {
    expect(convertValue('flex')).toBe('flex')
    expect(convertValue('rgba(0,0,0,0.5)')).toBe('rgba(0,0,0,0.5)')
  })
})

describe('cssToStyle()', () => {
  it('parses class rules into style objects', () => {
    const map = cssToStyle(`
      .p-4 { padding: 16px; }
      .flex { display: flex; }
      .text-lg { font-size: 18px; color: #3b82f6; }
    `)
    expect(map.get('p-4')).toEqual({ padding: 16 })
    expect(map.get('flex')).toEqual({ display: 'flex' })
    expect(map.get('text-lg')).toEqual({ fontSize: 18, color: '#3b82f6' })
  })

  it('keeps aggregate keys as-is (expanded later by mergeStyles)', () => {
    const map = cssToStyle(`.p-4 { padding: 16px; margin: 8px; }`)
    expect(map.get('p-4')).toEqual({ padding: 16, margin: 8 })
  })

  it('skips prefixed and custom properties', () => {
    const map = cssToStyle(`.x { -webkit-transform: none; --accent: #fff; color: red; }`)
    expect(map.get('x')).toEqual({ color: 'red' })
  })

  it('skips rules with no supported declarations', () => {
    const map = cssToStyle(`.empty { --only-var: 1; }`)
    expect(map.has('empty')).toBe(false)
  })
})