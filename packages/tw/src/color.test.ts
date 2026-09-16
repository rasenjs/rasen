import { describe, expect, it } from 'vitest'
import { parseColor } from './color'

describe('parseColor()', () => {
  it('parses hex colors', () => {
    expect(parseColor('#3B82F6')).toEqual({ r: 59 / 255, g: 130 / 255, b: 246 / 255, a: 1 })
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseColor('#00000000')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('parses rgb() / rgba()', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
  })

  it('parses hsl() / hsla()', () => {
    expect(parseColor('hsl(0, 100%, 50%)')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
    expect(parseColor('hsla(120, 100%, 25%, 0.5)')).toEqual({ r: 0, g: 0.5, b: 0, a: 0.5 })
  })

  it('parses named colors', () => {
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor('red')).toEqual({ r: 1, g: 0, b: 0, a: 1 })
  })

  it('returns null for invalid input', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('not-a-color')).toBeNull()
    expect(parseColor('500px')).toBeNull()
  })
})