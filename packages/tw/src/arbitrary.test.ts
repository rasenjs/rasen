import { describe, expect, it } from 'vitest'
import { parseArbitrary, parseLength, parseSize } from './arbitrary'

describe('parseLength()', () => {
  it('parses plain numbers, px, and rem', () => {
    expect(parseLength('10')).toBe(10)
    expect(parseLength('500px')).toBe(500)
    expect(parseLength('2rem')).toBe(32)
    expect(parseLength('0.5')).toBe(0.5)
  })

  it('returns null for non-lengths', () => {
    expect(parseLength('50%')).toBeNull()
    expect(parseLength('#fff')).toBeNull()
    expect(parseLength('auto')).toBeNull()
  })
})

describe('parseSize()', () => {
  it('parses lengths and percentages', () => {
    expect(parseSize('500px')).toBe(500)
    expect(parseSize('50%')).toBe('50%')
    expect(parseSize('auto')).toBeNull()
  })
})

describe('parseArbitrary()', () => {
  it('parses colors', () => {
    expect(parseArbitrary('bg-[#505050]')).toEqual({ backgroundColor: '#505050' })
    expect(parseArbitrary('text-[#ff0000]')).toEqual({ color: '#ff0000' })
    expect(parseArbitrary('border-[#123456]')).toEqual({ borderColor: '#123456' })
  })

  it('parses lengths', () => {
    expect(parseArbitrary('w-[500px]')).toEqual({ width: 500 })
    expect(parseArbitrary('h-[10rem]')).toEqual({ height: 160 })
    expect(parseArbitrary('min-w-[100px]')).toEqual({ minWidth: 100 })
    expect(parseArbitrary('max-h-[200px]')).toEqual({ maxHeight: 200 })
    expect(parseArbitrary('size-[100px]')).toEqual({ width: 100, height: 100 })
  })

  it('parses spacing', () => {
    expect(parseArbitrary('p-[10px]')).toEqual({
      paddingTop: 10,
      paddingRight: 10,
      paddingBottom: 10,
      paddingLeft: 10
    })
    expect(parseArbitrary('px-[8px]')).toEqual({ paddingLeft: 8, paddingRight: 8 })
    expect(parseArbitrary('mt-[12px]')).toEqual({ marginTop: 12 })
    expect(parseArbitrary('gap-[16px]')).toEqual({ gap: 16 })
  })

  it('disambiguates text and border by value type', () => {
    expect(parseArbitrary('text-[20px]')).toEqual({ fontSize: 20 })
    expect(parseArbitrary('border-[2px]')).toEqual({ borderWidth: 2 })
  })

  it('parses numbers and misc', () => {
    expect(parseArbitrary('opacity-[0.5]')).toEqual({ opacity: 0.5 })
    expect(parseArbitrary('flex-[2]')).toEqual({ flexGrow: 2, flexShrink: 2 })
    expect(parseArbitrary('font-[Menlo]')).toEqual({ fontFamily: 'Menlo' })
    expect(parseArbitrary('rounded-[8px]')).toEqual({ borderRadius: 8 })
  })

  it('decodes underscores to spaces', () => {
    expect(parseArbitrary('font-[ui_monospace]')).toEqual({ fontFamily: 'ui monospace' })
  })

  it('returns null for non-arbitrary tokens', () => {
    expect(parseArbitrary('flex')).toBeNull()
    expect(parseArbitrary('bg-blue-500')).toBeNull()
    expect(parseArbitrary('unknown-[10px]')).toBeNull()
  })
})