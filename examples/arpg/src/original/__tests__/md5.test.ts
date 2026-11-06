import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { md5Hex } from '@rasenjs/assets'

/**
 * The reader verifies every RomFS entry against the manifest's MD5, so a broken
 * MD5 would reject correct game files. Checked against Node's own implementation
 * — the reference for correctness is not our own code.
 */
describe('md5', () => {
  const vectors = [
    '',
    'a',
    'abc',
    'message digest',
    'abcdefghijklmnopqrstuvwxyz',
    'The quick brown fox jumps over the lazy dog',
  ]

  it('matches RFC 1321 test vectors', () => {
    expect(md5Hex(new TextEncoder().encode(''))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex(new TextEncoder().encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('agrees with node:crypto across lengths and boundaries', () => {
    for (const text of vectors) {
      const bytes = new TextEncoder().encode(text)
      expect(md5Hex(bytes)).toBe(createHash('md5').update(bytes).digest('hex'))
    }
    // 55/56/64/65 bytes cross the padding and block boundaries.
    for (const length of [54, 55, 56, 57, 63, 64, 65, 127, 128, 1000]) {
      const bytes = new Uint8Array(length)
      for (let i = 0; i < length; i++) bytes[i] = (i * 37 + 11) & 0xff
      expect(md5Hex(bytes)).toBe(createHash('md5').update(bytes).digest('hex'))
    }
  })
})
