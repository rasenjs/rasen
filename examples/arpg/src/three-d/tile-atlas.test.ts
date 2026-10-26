/**
 * The atlas packer, tested on the arithmetic.
 *
 * The property that matters is that no two pictures overlap and every one lands
 * inside its page; a wrong pack shows up as art bleeding into its neighbour,
 * which is easy to miss by eye and impossible to miss here.
 */

import { describe, expect, it } from 'vitest'
import { packAtlas, type AtlasRect } from './tile-atlas'

/** Whether two placed pictures overlap. */
function overlaps(a: AtlasRect, b: AtlasRect): boolean {
  if (a.page !== b.page) return false
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

describe('packAtlas', () => {
  it('places every picture inside its page and never overlapping', () => {
    const sizes = Array.from({ length: 400 }, (_, i) => ({
      width: 96 + (i % 5) * 32,
      height: 96 + (i % 7) * 32,
    }))
    const packed = packAtlas(sizes, 2048)
    expect(packed.rects).toHaveLength(sizes.length)
    for (const rect of packed.rects) {
      const page = packed.pages[rect.page]
      expect(page).toBeDefined()
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.y).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width).toBeLessThanOrEqual(page.width)
      expect(rect.y + rect.height).toBeLessThanOrEqual(page.height)
    }
    for (let i = 0; i < packed.rects.length; i += 1) {
      for (let j = i + 1; j < packed.rects.length; j += 1) {
        expect(overlaps(packed.rects[i], packed.rects[j]), `pictures ${i} and ${j}`).toBe(false)
      }
    }
  })

  it('keeps the pages within the size it was given', () => {
    const sizes = Array.from({ length: 200 }, () => ({ width: 128, height: 256 }))
    const packed = packAtlas(sizes, 1024)
    for (const page of packed.pages) {
      expect(page.width).toBeLessThanOrEqual(1024)
      expect(page.height).toBeLessThanOrEqual(1024)
    }
    // 200 pictures of 128x256 cannot fit in one 1024x1024 page.
    expect(packed.pages.length).toBeGreaterThan(1)
  })

  it('keeps the rectangles in input order, whatever order it packed in', () => {
    const sizes = [
      { width: 64, height: 512 },
      { width: 64, height: 64 },
      { width: 64, height: 256 },
    ]
    const packed = packAtlas(sizes, 1024)
    expect(packed.rects[0].height).toBe(512)
    expect(packed.rects[1].height).toBe(64)
    expect(packed.rects[2].height).toBe(256)
  })

  it('uses one page when everything fits', () => {
    const packed = packAtlas([{ width: 100, height: 100 }, { width: 100, height: 100 }], 2048)
    expect(packed.pages).toHaveLength(1)
    expect(packed.pages[0].width).toBeLessThanOrEqual(2048)
  })

  it('handles nothing to pack', () => {
    const packed = packAtlas([], 2048)
    expect(packed.pages).toHaveLength(0)
    expect(packed.rects).toHaveLength(0)
  })

  it('clamps a picture larger than a page instead of throwing mid-bake', () => {
    const packed = packAtlas([{ width: 4000, height: 4000 }], 512)
    expect(packed.rects[0].width).toBe(512)
    expect(packed.rects[0].height).toBe(512)
    expect(packed.pages[0].width).toBeLessThanOrEqual(512)
  })
})
