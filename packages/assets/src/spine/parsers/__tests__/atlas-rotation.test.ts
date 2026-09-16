import { describe, it, expect } from 'vitest'
import { parseSpineAtlas, computeRegionLocal, type AtlasRegion } from '../atlas'

/** Build a minimal atlas text around one region entry.
 *
 * NOTE: the parser (like real NIKKE/Spine exports) does NOT put blank lines
 * between regions — a blank line ENDS the current page. Regions are separated
 * purely by name lines. */
function atlasFor(regionLines: string, pageSize = '2048,2048'): string {
  return [
    'page.png',
    `size:${pageSize}`,
    'filter:Linear,Linear',
    'pma:true',
    regionLines,
    ''
  ].join('\n')
}

describe('atlas parser — rotated region UVs', () => {
  it('90° rotation swaps width/height into the far UV corner', () => {
    // On-page rect for 90° is (height × width): u2 = x + h, v2 = y + w.
    const atlas = parseSpineAtlas(atlasFor('r\nbounds:1024,1024,251,131\nrotate:90'))
    const r = atlas.regions.r!
    expect(r.degrees).toBe(90)
    expect(r.u2).toBeCloseTo((1024 + 131) / 2048)
    expect(r.v2).toBeCloseTo((1024 + 251) / 2048)
    expect(r.u2).toBeLessThanOrEqual(1)
    expect(r.v2).toBeLessThanOrEqual(1)
  })

  it('270° rotation swaps width/height into the far UV corner (regression: c223 texture glitch)', () => {
    // Real-world case from the NIKKE c223 atlas: acc_03_npc
    // bounds:1844,1207,251,131 + rotate:270. Without the swap, u2 = 1.023
    // exceeded the page and every fragment of the region sampled outside
    // the texture (visible glitch while animating).
    const atlas = parseSpineAtlas(atlasFor('acc_03_npc\nbounds:1844,1207,251,131\nrotate:270'))
    const r = atlas.regions.acc_03_npc!
    expect(r.degrees).toBe(270)
    expect(r.u2).toBeCloseTo((1844 + 131) / 2048) // 0.964…, NOT (1844+251)/2048 = 1.023
    expect(r.v2).toBeCloseTo((1207 + 251) / 2048)
    expect(r.u2).toBeLessThanOrEqual(1)
    expect(r.v2).toBeLessThanOrEqual(1)
  })

  it('180° and 0° rotations keep the stored width/height (in-bounds)', () => {
    // Two regions back-to-back — real exports separate regions by name
    // lines only (a blank line would start a new page).
    const regionLines = ['r180\nbounds:1500,1000,400,300\nrotate:180', 'r0\nbounds:0,0,400,300'].join('\n')
    const atlas = parseSpineAtlas(atlasFor(regionLines))
    const r180 = atlas.regions.r180!
    expect(r180.u2).toBeCloseTo(1900 / 2048)
    expect(r180.v2).toBeCloseTo(1300 / 2048)
    const r0 = atlas.regions.r0!
    expect(r0.u2).toBeCloseTo(400 / 2048)
    expect(r0.v2).toBeCloseTo(300 / 2048)
  })
})

describe('computeRegionLocal — rotated UV corner order', () => {
  const pageW = 2048
  const pageH = 2048

  function region(degrees: number): AtlasRegion {
    // A square region at a known spot so the corner math is easy to read.
    const atlas = parseSpineAtlas(
      atlasFor(`r\nbounds:1024,1024,128,128\nrotate:${degrees === 0 ? '' : degrees}`.trim())
    )
    return atlas.regions.r!
  }

  it('0° maps bl→(u,v2), tl→(u,v), tr→(u2,v), br→(u2,v2)', () => {
    const { uvs } = computeRegionLocal(
      { width: 128, height: 128 } as never,
      region(0)
    )
    const r = region(0)
    expect(uvs[0]).toBeCloseTo(r.u)
    expect(uvs[1]).toBeCloseTo(r.v2)
    expect(uvs[2]).toBeCloseTo(r.u)
    expect(uvs[3]).toBeCloseTo(r.v)
    expect(uvs[4]).toBeCloseTo(r.u2)
    expect(uvs[5]).toBeCloseTo(r.v)
    expect(uvs[6]).toBeCloseTo(r.u2)
    expect(uvs[7]).toBeCloseTo(r.v2)
  })

  it('270° maps bl→(u2,v), tl→(u,v), tr→(u,v2), br→(u2,v2) — mirrored from MeshAttachment 270 mapping', () => {
    const r = region(270)
    const { uvs } = computeRegionLocal(
      { width: 128, height: 128 } as never,
      r
    )
    // bl
    expect(uvs[0]).toBeCloseTo(r.u2)
    expect(uvs[1]).toBeCloseTo(r.v)
    // tl
    expect(uvs[2]).toBeCloseTo(r.u)
    expect(uvs[3]).toBeCloseTo(r.v)
    // tr
    expect(uvs[4]).toBeCloseTo(r.u)
    expect(uvs[5]).toBeCloseTo(r.v2)
    // br
    expect(uvs[6]).toBeCloseTo(r.u2)
    expect(uvs[7]).toBeCloseTo(r.v2)
    // All corners inside the page.
    for (const uv of uvs) expect(uv).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < uvs.length; i += 2) expect(uvs[i]).toBeLessThanOrEqual(1)
    for (let i = 1; i < uvs.length; i += 2) expect(uvs[i]).toBeLessThanOrEqual(1)
    void pageW
    void pageH
  })
})
