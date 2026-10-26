/**
 * Turning the world's 2D art into placements the depth buffer can order.
 *
 * Two things have to hold for the picture not to change when art moves into the
 * 3D canvas: each quad must cover the same pixels the 2D layer drew, and its
 * depth must be measured the same way the models' is. Both are pinned here,
 * because either going wrong looks like a rendering bug somewhere else.
 */

import { describe, expect, it } from 'vitest'
import { propArt, viewDepthAt, wallArt, type SheetGeometry } from './world-quads'
import type { PropSlot } from '../game'
import type { WallCell } from '../world'

/** A stand-in texture page: only its size matters here. */
function page(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function wallCell(overrides: Partial<WallCell['art']> & { x?: number; y?: number } = {}): WallCell {
  const { x = 10, y = 10, ...art } = overrides
  return {
    x,
    y,
    art: {
      canvas: page(320, 256),
      frameX: 0,
      frameY: 0,
      orientation: 0,
      ...art,
    },
  } as WallCell
}

const GEOMETRY: SheetGeometry = { frameWidth: 72, frameHeight: 104, columns: 6 }

function propSlot(overrides: Partial<PropSlot> = {}): PropSlot {
  return {
    kind: 'prop',
    active: true,
    image: page(432, 104),
    x: 10,
    y: 10,
    frame: 0,
    scale: 1,
    ...overrides,
  } as PropSlot
}

describe('wallArt', () => {
  it('covers the rectangle the 2D layer drew', () => {
    // Tile (10, 10) projects to (0, 800); a wall's picture is centred on the
    // tile's diamond (half a tile is 80 x 40 px) and then nudged by the block's
    // own frame offset.
    const art = wallArt([wallCell({ frameX: -4, frameY: -8 })])
    expect(art).toHaveLength(1)
    expect(art[0].rect).toEqual({ x: -84, y: 752, width: 320, height: 256 })
  })

  it('takes its size from the atlas crop when there is one', () => {
    const art = wallArt([wallCell({ crop: { x: 512, y: 128, width: 160, height: 96 } })])
    expect(art[0].rect.width).toBe(160)
    expect(art[0].rect.height).toBe(96)
    expect(art[0].crop).toEqual({ x: 512, y: 128, width: 160, height: 96 })
  })

  it('stands on the face its orientation names, not the tile centre', () => {
    // 1 is the -X face, 2 the +X face: same tile, half a tile apart in depth.
    const left = wallArt([wallCell({ orientation: 1 })])[0]
    const right = wallArt([wallCell({ orientation: 2 })])[0]
    expect(left.foot).toEqual({ x: 9.5, z: 10 })
    expect(right.foot).toEqual({ x: 10.5, z: 10 })
  })

  it('drops art with no pixels to show', () => {
    expect(wallArt([wallCell({ crop: { x: 0, y: 0, width: 0, height: 0 } })])).toHaveLength(0)
  })
})

describe('propArt', () => {
  it('sits bottom-centre on its tile, scaled', () => {
    // toScreen(10, 10) = (0, 800), so a 72 x 104 frame at scale 2 spans
    // x -72..72 and its bottom edge lands on y = 800.
    const art = propArt([propSlot({ scale: 2 })], GEOMETRY)
    expect(art[0].rect).toEqual({ x: -72, y: 592, width: 144, height: 208 })
    expect(art[0].foot).toEqual({ x: 10, z: 10 })
  })

  it('crops the frame out of the sheet', () => {
    const art = propArt([propSlot({ frame: 3 })], GEOMETRY)
    expect(art[0].crop).toEqual({ x: 3 * 72, y: 0, width: 72, height: 104 })
  })

  it('wraps onto the next row of the sheet', () => {
    const art = propArt([propSlot({ frame: 7 })], GEOMETRY)
    expect(art[0].crop).toEqual({ x: 72, y: 104, width: 72, height: 104 })
  })

  it('skips slots the pool is not using', () => {
    expect(propArt([propSlot({ active: false })], GEOMETRY)).toHaveLength(0)
  })
})

describe('viewDepthAt', () => {
  // Eye on the (+X, +Y, +Z) diagonal, looking at the origin — the game's
  // camera direction. Its distance is sqrt(3) * 7.
  const camera = { x: 7, y: 7, z: 7, zoom: 1, target: { x: 0, y: 0, z: 0 } } as const

  it('measures the camera distance at the target', () => {
    // The models' fragments get their depth from the view matrix, so art at the
    // target must read exactly the eye-to-target distance or the two disagree
    // and art floats in front of the geometry it stands on.
    expect(viewDepthAt(0, 0, camera)).toBeCloseTo(Math.hypot(7, 7, 7), 6)
  })

  it('counts a tile nearer the camera as nearer', () => {
    expect(viewDepthAt(20, 20, camera)).toBeLessThan(viewDepthAt(0, 0, camera))
    expect(viewDepthAt(0, 0, camera)).toBeLessThan(viewDepthAt(-20, -20, camera))
  })

  it('is flat along the screen horizontal', () => {
    // x + z is the axis the camera looks down, so tiles that differ only across
    // it are equidistant — which is why the 2D layer could sort by x + z.
    expect(viewDepthAt(12, 8, camera)).toBeCloseTo(viewDepthAt(8, 12, camera), 6)
  })
})
