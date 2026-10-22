import { describe, expect, it } from 'vitest'
import { weaponModeOf } from '../game'

/** `weapons.txt` rows reduced to what the mode mapping reads. */
const base = (type: string, twoHanded = false): { type: string; twoHanded: boolean } => ({
  type,
  twoHanded,
})

describe('weaponModeOf', () => {
  it('maps the table type codes to their animation modes', () => {
    expect(weaponModeOf(base('swor'))).toBe('1hs')
    expect(weaponModeOf(base('jave'))).toBe('1ht')
    expect(weaponModeOf(base('bow', true))).toBe('bow')
    expect(weaponModeOf(base('xbow', true))).toBe('xbow')
    expect(weaponModeOf(base('staf', true))).toBe('stf')
    expect(weaponModeOf(base('spea', true))).toBe('2ht')
    expect(weaponModeOf(base('wand'))).toBe('1hs')
  })

  it('promotes a two-handed one-hander to the 2h swing', () => {
    expect(weaponModeOf(base('swor', true))).toBe('2hs')
    expect(weaponModeOf(base('axe', true))).toBe('2hs')
    // Inherently two-handed modes are not re-mapped.
    expect(weaponModeOf(base('bow', true))).toBe('bow')
    expect(weaponModeOf(base('spea', true))).toBe('2ht')
  })

  it('falls back to the one-handed swing for an unknown type', () => {
    expect(weaponModeOf(base(''))).toBe('1hs')
    expect(weaponModeOf(base('sock'))).toBe('1hs')
  })
})
