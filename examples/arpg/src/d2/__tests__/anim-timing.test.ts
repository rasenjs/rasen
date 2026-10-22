import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  advanceWalk,
  ANIMDATA_RECORD_BYTES,
  animDataFromDocument,
  cycleSeconds,
  FLAT_RATE_PER_SECOND,
  frameFraction,
  frameFromRate,
  frameIndexOf,
  framesElapsed,
  GAME_FRAMES_PER_SECOND,
  parseAnimData,
  SPEED_SCALE,
  strideFor,
  timingFor,
  tokenForAnimationKey,
  unlistedTiming,
  type AnimDataDocument,
} from '../anim-timing'

/**
 * These tests are the evidence for the structure documented at the top of
 * `anim-timing.ts`.
 *
 * Two halves, and they check different things on purpose:
 *
 * - the **synthetic** half builds `AnimData.D2` byte by byte, so the block structure,
 *   the field offsets, the duplicate rows and the error cases are pinned to bytes
 *   rather than to a memory of what the file looked like; and
 * - the **real** half reads the export off disk — no fixture — and asserts the numbers
 *   the module produces for animations whose answers are known from the art
 *   (`AMNUHTH` is 8 frames at half rate, `AMWLHTH` 8 frames at full rate), which is the
 *   claim the whole app rests on.
 */

function exportDirectory(): string {
  let directory = resolve(process.cwd())
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, 'public', 'original')
    if (existsSync(join(candidate, 'animdata.json'))) return candidate
    const nested = join(directory, 'examples', 'arpg', 'public', 'original')
    if (existsSync(join(nested, 'animdata.json'))) return nested
    directory = dirname(directory)
  }
  throw new Error('the exported animation timing table is missing: run export-animdata.ts first')
}

const EXPORT_DIRECTORY = exportDirectory()

function realDocument(): AnimDataDocument {
  return JSON.parse(
    readFileSync(join(EXPORT_DIRECTORY, 'animdata.json'), 'utf8'),
  ) as AnimDataDocument
}

/** Builds one 160-byte record. The tail is what the caller passes. */
function record(token: string, frames: number, speed: number, tail: number[] = []): Uint8Array {
  const bytes = new Uint8Array(ANIMDATA_RECORD_BYTES)
  for (let i = 0; i < token.length && i < 8; i++) bytes[i] = token.charCodeAt(i)
  bytes[8] = frames & 0xff
  bytes[9] = (frames >> 8) & 0xff
  bytes[12] = speed & 0xff
  bytes[13] = (speed >> 8) & 0xff
  for (let i = 0; i < tail.length; i++) bytes[16 + i] = tail[i]
  return bytes
}

/** A file of `[count, records...]` blocks, in the game's own layout. */
function file(blocks: Array<[number, Uint8Array[]]>): Uint8Array {
  const parts: Uint8Array[] = []
  for (const [count, records] of blocks) {
    const header = new Uint8Array(4)
    header[0] = count & 0xff
    header[1] = (count >> 8) & 0xff
    parts.push(header, ...records)
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

describe('parsing AnimData.D2', () => {
  it('reads a block as a count followed by that many records', () => {
    const data = parseAnimData(
      file([
        [2, [record('AMNUHTH', 8, 128), record('AMWLHTH', 8, 256)]],
        [1, [record('0ANU1HS', 12, 256)]],
      ]),
    )
    expect(data.blockCounts).toEqual([2, 1])
    expect([...data.records.keys()]).toEqual(['AMNUHTH', 'AMWLHTH', '0ANU1HS'])
    expect(data.records.get('AMNUHTH')).toMatchObject({ frames: 8, speed: 128, block: 0 })
    expect(data.records.get('0ANU1HS')).toMatchObject({ frames: 12, speed: 256, block: 1 })
    expect(data.records.get('AMNUHTH')?.rate).toBeCloseTo(0.5, 10)
  })

  it('keeps the first row of a token the file states twice, and the rest beside it', () => {
    const data = parseAnimData(
      file([[2, [record('MINUHTH', 1, 256), record('MINUHTH', 8, 256)]]]),
    )
    expect(data.records.get('MINUHTH')?.frames).toBe(1)
    expect(data.duplicates.get('MINUHTH')?.map((row) => row.frames)).toEqual([1, 8])
  })

  it('keeps a non-zero tail verbatim and ignores an empty one', () => {
    const data = parseAnimData(
      file([
        [2, [record('ZPA1HTH', 14, 200, [0, 0, 0, 0, 0, 0, 0, 1]), record('AMNUHTH', 8, 128)]],
      ]),
    )
    expect(data.uninterpreted.get('ZPA1HTH')).toBe('0000000000000001'.padEnd(2 * 144, '0'))
    expect(data.uninterpreted.has('AMNUHTH')).toBe(false)
  })

  it('refuses a block whose count runs past the end of the file', () => {
    const bytes = file([[1, [record('AMNUHTH', 8, 128)]]])
    bytes[0] = 4
    expect(() => parseAnimData(bytes)).toThrow(/claims 4 records/)
  })

  it('refuses a tail too short to be another block', () => {
    const bytes = file([[1, [record('AMNUHTH', 8, 128)]]])
    const padded = new Uint8Array([...bytes, 0, 0, 0])
    expect(() => parseAnimData(padded)).toThrow(/block 1 header runs past the end/)
  })

  it('refuses a record with no token at all', () => {
    expect(() => parseAnimData(file([[1, [record('', 1, 256)]]]))).toThrow(/empty token/)
  })

  it('round-trips through the exported document, duplicates included', () => {
    const original = parseAnimData(
      file([
        [1, [record('AMNUHTH', 8, 128, [0, 2])]],
        [2, [record('MINUHTH', 1, 256), record('MINUHTH', 8, 256)]],
      ]),
    )
    const document: AnimDataDocument = {
      blockCounts: original.blockCounts,
      records: Object.fromEntries(
        [...original.records].map(([token, row]) => [
          token,
          { frames: row.frames, speed: row.speed },
        ]),
      ),
      duplicates: Object.fromEntries(
        [...original.duplicates].map(([token, rows]) => [
          token,
          rows.map((row) => ({ frames: row.frames, speed: row.speed })),
        ]),
      ),
      uninterpreted: Object.fromEntries(original.uninterpreted),
    }
    const back = animDataFromDocument(document)
    expect(back.blockCounts).toEqual(original.blockCounts)
    expect(back.records.get('AMNUHTH')).toMatchObject({ frames: 8, speed: 128 })
    expect(back.duplicates.get('MINUHTH')?.map((row) => row.frames)).toEqual([1, 8])
    expect(back.uninterpreted.get('AMNUHTH')).toBe(original.uninterpreted.get('AMNUHTH'))
  })
})

describe('animation keys', () => {
  it('reduces an actor key to the table token, upper case', () => {
    expect(tokenForAnimationKey('chars/am/nu/hth')).toBe('AMNUHTH')
    expect(tokenForAnimationKey('monsters/0a/run/1hs'.replace('/run/', '/rn/'))).toBe('0ARN1HS')
    expect(tokenForAnimationKey('monsters/8a/a1/1hs')).toBe('8AA11HS')
  })

  it('declines a key the table cannot have a record for', () => {
    expect(tokenForAnimationKey('missiles/arrow')).toBeNull()
    expect(tokenForAnimationKey('overlays/extra/teethexplode')).toBeNull()
    expect(tokenForAnimationKey('chars/am/nu')).toBeNull()
  })
})

describe('the clock', () => {
  const neutral = { token: 'AMNUHTH', frames: 8, speed: 128, block: 0, rate: 0.5 }
  const walk = { token: 'AMWLHTH', frames: 8, speed: 256, block: 0, rate: 1 }

  it('advances one frame per game frame at speed 256, and half that at 128', () => {
    expect(GAME_FRAMES_PER_SECOND).toBe(25)
    expect(framesElapsed(walk, 0.2)).toBeCloseTo(5, 10)
    expect(framesElapsed(neutral, 0.2)).toBeCloseTo(2.5, 10)
  })

  it('takes a game frame to be 1/25 s, so a 20-frame cast is 0.8 s', () => {
    const cast = { token: 'AMSC1HS', frames: 20, speed: 256, block: 0, rate: 1 }
    expect(cycleSeconds(cast)).toBeCloseTo(0.8, 10)
    expect(cycleSeconds(neutral)).toBeCloseTo(0.64, 10)
  })

  it('wraps a frame index over the drawn sheet, and never goes out of range', () => {
    expect(frameIndexOf(0, walk)).toBe(0)
    expect(frameIndexOf(7.99, walk)).toBe(7)
    expect(frameIndexOf(8, walk)).toBe(0)
    expect(frameIndexOf(8.5, walk)).toBe(0)
    expect(frameIndexOf(-1, walk)).toBe(7)
    expect(frameIndexOf(3, walk, 5)).toBe(3)
    expect(frameIndexOf(7, walk, 5)).toBe(2)
  })

  it('carries the fraction of the frame, which is what a tick-locked driver passes on', () => {
    expect(frameFraction(2.5)).toBeCloseTo(0.5, 10)
    expect(frameFraction(-0.25)).toBeCloseTo(0.75, 10)
  })

  it('freezes an animation whose record states speed 0 rather than dividing by it', () => {
    const frozen = { token: 'R7DDHTH', frames: 1, speed: 0, block: 0, rate: 0 }
    expect(cycleSeconds(frozen)).toBe(Number.POSITIVE_INFINITY)
    expect(framesElapsed(frozen, 100)).toBe(0)
    expect(frameIndexOf(framesElapsed(frozen, 100), frozen)).toBe(0)
  })

  it('takes a rate from a table that states one without a unit, as frames a second', () => {
    expect(frameFromRate(FLAT_RATE_PER_SECOND, 0)).toBe(0)
    expect(frameFromRate(FLAT_RATE_PER_SECOND, 0.5)).toBe(8)
    expect(frameFromRate(FLAT_RATE_PER_SECOND, -1)).toBe(0)
  })

  it('falls back to the table\'s modal rate for an animation it does not list', () => {
    const timing = unlistedTiming(6)
    expect(timing.speed).toBe(SPEED_SCALE)
    expect(framesElapsed(timing, 0.2)).toBeCloseTo(5, 10)
    expect(frameIndexOf(framesElapsed(timing, 0.2), timing)).toBe(5)
  })
})

describe('the walk cycle', () => {
  const walk = { token: 'AMWLHTH', frames: 8, speed: 256, block: 0, rate: 1 }

  it('advances exactly one cycle per stride', () => {
    const stride = strideFor(walk, 4.1)
    expect(stride).toBeCloseTo(4.1 * 0.32, 10)
    let phase = 0
    phase = advanceWalk(phase, walk, stride, 4.1)
    expect(phase).toBeCloseTo(8, 10)
    expect(frameIndexOf(phase, walk)).toBe(0)
    phase = advanceWalk(phase, walk, stride / 2, 4.1)
    expect(frameIndexOf(phase, walk)).toBe(4)
  })

  it('keeps step with the movement rather than with the clock', () => {
    // One cycle is 0.32 s, so at 2 units a second a stride is 0.64 units and a unit of
    // travel is one and a half cycles: 12 frames, which is frame 4 of the eight. The
    // phase follows the ground covered, not the seconds spent covering it.
    const stride = strideFor(walk, 2)
    expect(stride).toBeCloseTo(0.64, 10)
    const phase = advanceWalk(0, walk, 1, 2)
    expect(phase).toBeCloseTo(12.5, 10)
    expect(frameIndexOf(phase, walk)).toBe(4)
  })

  it('leaves the phase alone when nothing moved, or when there is no cycle', () => {
    expect(advanceWalk(3, walk, 0, 4.1)).toBe(3)
    const frozen = { token: 'X', frames: 8, speed: 0, block: 0, rate: 0 }
    expect(advanceWalk(3, frozen, 1, 4.1)).toBe(3)
    expect(advanceWalk(3, walk, 1, 0)).toBe(3)
  })
})

describe('the game\'s own table, as exported', () => {
  const data = animDataFromDocument(realDocument())

  it('has the block structure the reader implements, end to end', () => {
    expect(data.blockCounts).toHaveLength(256)
    expect(data.blockCounts.reduce((sum, count) => sum + count, 0)).toBe(3661)
    expect(data.records.size).toBe(3631)
    expect([...data.duplicates.values()].reduce((n, rows) => n + rows.length - 1, 0)).toBe(30)
  })

  it('states 256 as its modal speed, which is the scale the clock divides by', () => {
    const counts = new Map<number, number>()
    for (const row of data.records.values()) {
      counts.set(row.speed, (counts.get(row.speed) ?? 0) + 1)
    }
    const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    expect(modal[0]).toBe(SPEED_SCALE)
  })

  it('agrees with the art: the Amazon idles at half rate and walks at full rate', () => {
    const neutral = timingFor(data, 'chars/am/nu/hth')
    const walk = timingFor(data, 'chars/am/wl/hth')
    expect(neutral).toMatchObject({ token: 'AMNUHTH', frames: 8, speed: 128 })
    expect(walk).toMatchObject({ token: 'AMWLHTH', frames: 8, speed: 256 })
    // 8 frames at half of a frame per game frame is a 0.64 s loop; the walk is 0.32 s.
    expect(cycleSeconds(neutral!)).toBeCloseTo(0.64, 6)
    expect(cycleSeconds(walk!)).toBeCloseTo(0.32, 6)
  })

  it('has no record for the art the package ships without one', () => {
    // The export has 8 actor animations AnimData.D2 does not list; the module must
    // answer null for them rather than inventing a rate.
    expect(timingFor(data, 'monsters/ed/nu/hth')).toBeNull()
  })
})
