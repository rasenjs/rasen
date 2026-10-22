/**
 * `.cof` — the classic Diablo II character animation definition.
 *
 * A COF names the layers one character animation is built from and stores, for
 * every frame, the order those layers are drawn in. The sprites themselves sit
 * next to it as `.dcc` files, one directory per layer (`hd`, `tr`, `lg`, `ra`,
 * `la`, `rh`, `lh`, `sh`, `s1`, `s2`, `s3`).
 *
 * ## Layout
 *
 * ```
 * 0x00 u8   layerCount
 * 0x01 u8   framesPerDirection
 * 0x02 u8   directions
 * 0x03 u8   constant 0x14 (20) on 853 of the 854 files in the package; unknown
 * 0x04 u16  \
 * 0x06 u16  / unknown
 * 0x08 i32  \
 * 0x0c i32  |  unknown. Read as two pairs they look like the animation's
 * 0x10 i32  |  bounding box (left, right) and (top, bottom) — the first is
 * 0x14 i32  /  always below the second — but the sprite bodies are compressed
 *             so that could not be checked against the frames.
 * 0x18 u32  unknown, a multiple of 8 that varies per animation (256, 128, 80,
 *           216, ...), plausibly a speed or duration
 * 0x1c u8   unknown, 0..3
 * 0x1d      layerCount records of 9 bytes, see below
 *           then `framesPerDirection - 1` bytes of unknown meaning: all zero in
 *           493 files, otherwise carrying a single 1 or 2, which reads like a
 *           per-frame marker
 *           then `framesPerDirection * directions` rows of `layerCount` bytes:
 *           the layer draw order of one frame each
 * ```
 *
 * A layer record:
 *
 * ```
 * +0 u8   unknown, 1 on 7,215 of the 7,236 records of the package, 0 on the
 *         records the writer left blank (21 of them, all final records)
 * +1 u8   unknown, 1 on 7,207 records, 0 on 29
 * +2 u8   unknown, 0 on every record but one, which carries 87 and reads as
 *         corruption
 * +3 u8   unknown, 0 on 5,047 records and 5 on the other 2,188 — 5 on every
 *         record of some classes, so it looks like a per file flag
 * +4 name 4 bytes, NUL terminated weapon class: hth, 1hs, 1ht, 2hs, 2ht, 1js,
 *         1jt, 1ss, 1st, bow, xbw, stf, ht1, ht2
 * +8 u8   the layer's slot, see LAYER_SLOTS
 * ```
 *
 * The record holds no pixel offset: the sprites carry their own anchor in each
 * DCC frame, which is why `CofLayer.offsetX`/`offsetY` are always 0.
 *
 * ## Verification
 *
 * None of the above comes from documentation. The decisive arithmetic is that
 * the file is exactly
 *
 * ```
 * 29 + 9 * layerCount + (framesPerDirection - 1)
 *    + framesPerDirection * directions * layerCount  bytes
 * ```
 *
 * and that holds for 853 of the 854 COFs in the package — the exception is
 * `am/cof/amblxbow.cof`, 72 bytes of high entropy data whose name is also the
 * only one that is not `class + mode + 3-letter weapon`. `tools/verify-cof.ts`
 * re-runs that check together with two more:
 *
 * - every row of the draw order table is a permutation of the same set of
 *   `layerCount` slots, and
 * - the slot byte of the layer records is a permutation of exactly that set.
 *
 * The second one is what pins the meaning of the byte down: a byte that is a
 * permutation of the drawn slots of the very same file can only be the slot of
 * the record it belongs to. The *last* record is a sentinel: its byte is 0 in
 * 849 of the 853 files (in 219 of those 0 is also the slot it means) and in the
 * other 4 it repeats the byte of an earlier record. Either way the slot it
 * means is the one drawn slot no other record claims, which is the only value
 * that keeps the table a permutation — and taking it that way makes all 853
 * files consistent.
 */

/** The character layer directories, in slot order, shared with the `.dcc` tree. */
export const LAYER_SLOTS = [
  'hd',
  'tr',
  'lg',
  'ra',
  'la',
  'rh',
  'lh',
  'sh',
  's1',
  's2',
  's3',
] as const

export type LayerSlot = (typeof LAYER_SLOTS)[number]

export interface CofLayer {
  /** No per-layer offset is stored; the DCC frames carry their own anchor. */
  offsetX: number
  offsetY: number
  /** The weapon class the layer's `.dcc` files are stored under. */
  name: string
  /** Index into {@link LAYER_SLOTS}: which layer of the body this record is. */
  slot: number
  dir: LayerSlot
}

export interface CofFile {
  /** The COF's own file name without the `.cof` extension, e.g. `baa11hs`. */
  name?: string
  /** Byte 3 of the header. Unknown meaning, 20 on every file but one. */
  version: number
  /** In slot order, not in the order the records appear in the file. */
  layers: readonly CofLayer[]
  framesPerDirection: number
  directions: number
  /**
   * The draw order of every frame: `framesPerDirection * directions` entries of
   * `layers.length` slot ids each. Each row is a permutation of the drawn slots.
   */
  layerOrders: readonly (readonly number[])[]
}

const HEADER_SIZE = 29
const LAYER_RECORD_SIZE = 9
const LAYER_NAME_OFFSET = 4
const LAYER_NAME_SIZE = 4
const LAYER_SLOT_OFFSET = 8

function readName(bytes: Uint8Array, at: number): string {
  const end = Math.min(at + LAYER_NAME_SIZE, bytes.length)
  let text = ''
  for (let i = at; i < end; i += 1) {
    if (bytes[i] === 0) break
    text += String.fromCharCode(bytes[i])
  }
  return text
}

export function parseCof(bytes: Uint8Array, name?: string): CofFile {
  if (bytes.length < HEADER_SIZE) throw new Error('cof: too short for a header')
  const layerCount = bytes[0]
  const framesPerDirection = bytes[1]
  const directions = bytes[2]
  if (layerCount === 0 || framesPerDirection === 0 || directions === 0) {
    throw new Error(
      `cof: empty animation (${layerCount} layers, ${framesPerDirection} frames, ${directions} directions)`,
    )
  }

  const tableEnd = HEADER_SIZE + layerCount * LAYER_RECORD_SIZE
  const orderCount = framesPerDirection * directions
  const bodyStart = bytes.length - orderCount * layerCount
  if (bodyStart < tableEnd) {
    throw new Error(
      `cof: ${layerCount} layers and ${orderCount} frames do not fit in ${bytes.length} bytes`,
    )
  }

  const layerOrders: number[][] = []
  let drawn: number[] | null = null
  for (let i = 0; i < orderCount; i += 1) {
    const at = bodyStart + i * layerCount
    const row = Array.from(bytes.subarray(at, at + layerCount))
    const unique = new Set(row)
    if (unique.size !== layerCount) {
      throw new Error(`cof: draw order ${i} repeats a layer (${row.join(',')})`)
    }
    if (drawn === null) drawn = [...unique].sort((a, b) => a - b)
    else if (unique.size !== drawn.length || drawn.some((slot) => !unique.has(slot))) {
      throw new Error(`cof: draw order ${i} draws a different set of layers`)
    }
    layerOrders.push(row)
  }
  // `drawn` cannot be null here: orderCount and layerCount are both non-zero.
  const drawnSlots = drawn ?? []

  const slots: number[] = []
  const claimed = new Set<number>()
  for (let k = 0; k < layerCount - 1; k += 1) {
    const slot = bytes[HEADER_SIZE + k * LAYER_RECORD_SIZE + LAYER_SLOT_OFFSET]
    slots.push(slot)
    claimed.add(slot)
  }
  const unclaimed = drawnSlots.filter((slot) => !claimed.has(slot))
  const lastAt = HEADER_SIZE + (layerCount - 1) * LAYER_RECORD_SIZE + LAYER_SLOT_OFFSET
  slots.push(unclaimed.length === 1 ? unclaimed[0] : bytes[lastAt])

  const layers: CofLayer[] = []
  for (let k = 0; k < layerCount; k += 1) {
    const at = HEADER_SIZE + k * LAYER_RECORD_SIZE
    const slot = slots[k]
    layers.push({
      offsetX: 0,
      offsetY: 0,
      name: readName(bytes, at + LAYER_NAME_OFFSET),
      slot,
      dir: LAYER_SLOTS[slot] ?? 'hd',
    })
  }
  layers.sort((a, b) => a.slot - b.slot)

  return {
    ...(name === undefined ? {} : { name }),
    version: bytes[3],
    layers,
    framesPerDirection,
    directions,
    layerOrders,
  }
}

/** The layer of a COF for a slot id, or null when the animation omits it. */
export function cofLayer(cof: CofFile, slot: number): CofLayer | null {
  return cof.layers.find((layer) => layer.slot === slot) ?? null
}
