/**
 * How fast every animation plays: the game's own answer, from `AnimData.D2`.
 *
 * Before this module the app chose the drawn frame from a constant — `heroModeTime * 9`
 * for a hero, `elapsed * 8` for a monster, `walkPhase += dt * speed * 2.1` for both
 * while walking. None of those four numbers is in any file the game ships. This module
 * is the one place that turns *time* into a *frame*, and every number it uses is a
 * field of `global/AnimData.D2` or of the animation's own COF.
 *
 * ## The file's structure, established from its bytes
 *
 * `AnimData.D2` is not a flat array of records. It is a sequence of **blocks**, each
 * `u32 count` followed by `count` fixed-size records:
 *
 * ```
 * block 0        u32 = 54        block 0's record count
 * record 0       160 bytes       token[8], frames u32, speed u32, tail[144]
 * …
 * record 53      160 bytes
 * block 1        u32 = 58        the next block's record count
 * …
 * ```
 *
 * That reading is not a guess: the first record's token field begins at byte 4, and
 * walking `4 + count * 160` from each block header lands exactly on the next block's
 * count, byte for byte, to the end of the file. This build's copy is 586,784 bytes =
 * **256 blocks holding 3,661 rows, of which 3,631 are distinct tokens** (30 tokens
 * appear twice, see below), and the last row ends on the last byte. The export in
 * `public/original/animdata.json` keeps the 256 counts, so the layout is checkable
 * from the artifact and not only from this comment.
 *
 * The 160-byte record:
 *
 * | offset | size | field |
 * |---|---|---|
 * | 0 | 8 | the COF token, ASCII, NUL padded: `<unit><mode><weapon>` |
 * | 8 | 4 | `frames` — the animation's frame count per direction |
 * | 12 | 4 | `speed` — its rate, in 1/256 of a frame per game frame |
 * | 16 | 144 | a tail this module does **not** interpret, see below |
 *
 * ### What the blocks are
 *
 * They are not arbitrary: every row inside one block shares its unit, and the
 * unit codes run `0A`…`ZZ` — `monstats.txt`'s own `Code` column in upper case, which is
 * the same key `src/d2/anim-art.ts` files monster art under (`monsters/0a/…`). Blocks
 * carry 0 to 69 rows and 120 of the 256 are empty, which is what a table indexed by
 * unit *and* count-of-units looks like.
 *
 * ### The three fields, and how each was confirmed
 *
 * - **`token`** is `<unit 2><mode 2><weapon 3>`: `AMNUHTH` is the Amazon's neutral
 *   pose with bare hands, `0ARN1HS` the act-5 barbarian's run with a one-hand swing.
 *   The split is the same one `charanim.ts` reads out of a 7-character COF name, and
 *   the mode half is `plrmode.txt`/`monmode.txt`'s token verbatim.
 * - **`frames`** agrees with the COF it names. `AMNUHTH` says 8 and the COF
 *   `global/chars/am/cof/amnuhth.cof` holds 8 frames per direction; `AMDDHTH` says 1,
 *   which is what `dd` — the corpse, not the death — is in Diablo II. The export's
 *   verifier compares every record it has art for, so this is a test and not a claim.
 * - **`speed`** is the rate in units of 1/256 of a frame per game frame: 2,777 of the
 *   3,631 tokens are 256, which is one frame per game frame, and the field sorts by
 *   mode the way a rate has to. `TN`, the town's standing pose, is the *slowest* value
 *   in the file (mode 80 across 45 of its 105 rows), the walk is 256 and the neutral
 *   idle is 128. Read as a *period* instead — 256/speed game frames per animation
 *   frame — that same field would make the town idle the *fastest* animation in the
 *   game at 3.2 frames per game frame, which settles the direction: 26 rows exceed 256
 *   and mean "faster than one frame per game frame", up to 512, which is two.
 *
 * ### The exceptions in the field, all named
 *
 * - **30 tokens appear twice**, always inside one block. 27 repeat themselves exactly
 *   and 3 do not: `VMS1HTH` 200 then 160, `VMGHHTH` 192 then 184, `MINUHTH` 1 frame
 *   then 8. {@link AnimDataFile.records} holds the **first** row, which is what a scan
 *   of the block reaches first, and {@link AnimDataFile.duplicates} keeps every row so
 *   a reader can disagree with that choice without re-extracting the game.
 * - **4 rows state speed 0** (`CODTHTH`, `VHNUHTH`, `VJNUHTH`, `R7DDHTH`), which is a
 *   frozen animation: {@link framesElapsed} returns 0 for them and frame 0 is drawn.
 * - **9 rows are not a multiple of 8** (255, 227, 188, 260×3), so the field is not a
 *   three-bit-shifted integer with the low bits reserved; the exact value is used.
 * - **609 rows have a non-zero byte in the 144-byte tail.** Every such byte is 1, 2 or
 *   3 and always within the first 25 bytes. No frame count and no rate lives there —
 *   the values are far too small and far too sparse — so this module leaves it alone
 *   and the export keeps it verbatim rather than dropping it. A reader that finds a
 *   meaning for it can decode it from the export without re-extracting the game.
 *
 * ## The clock: game frames, tick-locked
 *
 * The reference project (`rasenjs/d2r-mobile`) records the engine's animation driver as
 * the *client per-unit per-frame update entry* (`main+0x4b74d0`), advanced from the
 * **fraction of the server tick** by the per-tick update at `main+0x4b7230`. So an
 * animation is not wall-clock-fps-driven: it is advanced by a fraction of every game
 * frame, and the drawn frame is derived from that fraction. {@link framesElapsed} is
 * that one conversion, and it is in *game frames* — Diablo II's 1/25 s tick, the unit
 * every duration in the game's tables is stated in — so the result does not change with
 * the renderer's frame rate.
 *
 * ## Which numbers here are the game's and which are this module's
 *
 * | number | source |
 * |---|---|
 * | `frames`, `speed`, `token`, the block counts | fields of `global/AnimData.D2`, extracted from the user's own package |
 * | `ANIMDATA_RECORD_BYTES`, `ANIMDATA_TOKEN_BYTES`, the field offsets | this module's reading of the bytes, checkable against the export |
 * | `SPEED_SCALE` = 256 | the field's own scale: the maximum, the mode, and the only value that means "one frame per game frame" |
 * | `GAME_FRAMES_PER_SECOND` = 25 | **the one number not read from a file.** It is the engine's tick rate, the unit `speed` is a fraction of; it is corroborated by the durations the data produces (a 13-frame `a1` at speed 256 is 0.52 s, a 20-frame `sc` is 0.80 s, a 1-frame `dd` is 0.04 s) and by the reference driver being tick-locked rather than fps-locked, but it is this module's constant, named, and changing it scales every animation uniformly |
 * | `FLAT_RATE_PER_SECOND` | `overlays.txt`'s `AnimRate` / `missiles.txt`'s `AnimSpeed` for the rows this app plays, which state 16; the app reads it as frames per second, see {@link FLAT_RATE_PER_SECOND} |
 */

/** Bytes of one record: `token[8]`, `frames`, `speed`, and the uninterpreted tail. */
export const ANIMDATA_RECORD_BYTES = 160
/** Bytes of the token field, NUL padded. */
export const ANIMDATA_TOKEN_BYTES = 8
/** Bytes of the tail after `speed` that this module does not interpret. */
export const ANIMDATA_TAIL_BYTES = ANIMDATA_RECORD_BYTES - ANIMDATA_TOKEN_BYTES - 8
/** The divisor `speed` is stated in: 256 is one animation frame per game frame. */
export const SPEED_SCALE = 256

/**
 * Diablo II's game frame — the tick the server advances a unit's animation by.
 *
 * The one number in this module that is not a field of a file the user owns. See the
 * header table for why it is 25 and what happens if it is wrong: every animation scales
 * together, so a wrong value makes all of them uniformly fast or slow and none of them
 * inconsistent with each other.
 */
export const GAME_FRAMES_PER_SECOND = 25
/** Seconds per game frame. */
export const GAME_FRAME_SECONDS = 1 / GAME_FRAMES_PER_SECOND

/**
 * The rate the flat trees — missiles and overlays — play at.
 *
 * These two trees have no `AnimData.D2` record: their rows carry the rate themselves,
 * `overlays.txt`'s `AnimRate` and `missiles.txt`'s `AnimSpeed`, and both state 16 for
 * every row this app plays (702 of `missiles.txt`'s rows are 16). The tables state a
 * rate but not the unit it is in, and this module reads it as **frames per second**,
 * which is the plain reading and the one the app has always used. That is an
 * interpretation, not a field, so it is named here rather than left as a literal where
 * a frame is chosen.
 */
export const FLAT_RATE_PER_SECOND = 16

/** One record of `AnimData.D2`, keyed by its token. */
export interface AnimTiming {
  /** The COF token, e.g. `AMNUHTH`. */
  readonly token: string
  /** Frames per direction. The COF of the same name holds this many. */
  readonly frames: number
  /** The rate in units of 1/256 of a frame per game frame. */
  readonly speed: number
  /** Which block of the file the record is in. */
  readonly block: number
  /** Frames advanced per game frame: `speed / 256`, in the range (0, 1]. */
  readonly rate: number
}

/** `AnimData.D2`, decoded. */
export interface AnimDataFile {
  /** Every record, by token. A token that appears twice keeps its first row. */
  readonly records: ReadonlyMap<string, AnimTiming>
  /** The record count of each block, in file order. */
  readonly blockCounts: readonly number[]
  /**
   * Rows whose token the file states twice, in file order, keyed by token.
   *
   * Present so the choice {@link records} makes is visible rather than silent. Empty
   * for every token the file states once, which is all but 30 of them.
   */
  readonly duplicates: ReadonlyMap<string, readonly AnimTiming[]>
  /**
   * The bytes after `speed`, hex, for the records where they are not all zero.
   *
   * Kept because they are part of the record and this module does not interpret them;
   * an export that dropped them would make the record look fully understood.
   */
  readonly uninterpreted: ReadonlyMap<string, string>
}

function readUint32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + bytes[at + 3] * 0x1000000) >>> 0
  )
}

function readToken(bytes: Uint8Array, at: number): string {
  let text = ''
  for (let i = 0; i < ANIMDATA_TOKEN_BYTES; i++) {
    const byte = bytes[at + i]
    if (byte === 0) break
    text += String.fromCharCode(byte)
  }
  return text
}

/**
 * Decodes `AnimData.D2`.
 *
 * Throws when the bytes do not add up — a block count that runs past the end, or a
 * final block that does not end on the last byte. A table that silently truncated
 * would leave animations playing at whatever the truncated record happened to say, so
 * this is loud instead.
 */
export function parseAnimData(bytes: Uint8Array): AnimDataFile {
  const records = new Map<string, AnimTiming>()
  const duplicates = new Map<string, AnimTiming[]>()
  const uninterpreted = new Map<string, string>()
  const blockCounts: number[] = []
  let at = 0
  let block = 0

  while (at < bytes.length) {
    if (at + 4 > bytes.length) {
      throw new Error(`animdata: block ${block} header runs past the end of the file`)
    }
    const count = readUint32(bytes, at)
    rowCountGuard(count, bytes.length - at - 4, block)
    blockCounts.push(count)
    at += 4

    for (let i = 0; i < count; i++) {
      const token = readToken(bytes, at)
      if (token === '') {
        throw new Error(`animdata: block ${block} record ${i} has an empty token`)
      }
      const frames = readUint32(bytes, at + 8)
      const speed = readUint32(bytes, at + 12)
      const tail = bytes.subarray(at + 16, at + ANIMDATA_RECORD_BYTES)
      const timing: AnimTiming = { token, frames, speed, block, rate: speed / SPEED_SCALE }
      const first = records.get(token)
      if (first === undefined) {
        records.set(token, timing)
      } else {
        duplicates.set(token, [...(duplicates.get(token) ?? [first]), timing])
      }
      if (tail.some((byte) => byte !== 0)) {
        uninterpreted.set(token, hex(tail))
      }
      at += ANIMDATA_RECORD_BYTES
    }
    block++
  }

  if (at !== bytes.length) {
    throw new Error(
      `animdata: ${bytes.length - at} trailing bytes after block ${block - 1} ` +
        '— the block structure is not the one this reader implements',
    )
  }

  return { records, blockCounts, duplicates, uninterpreted }
}

function rowCountGuard(count: number, remaining: number, block: number): void {
  if (count * ANIMDATA_RECORD_BYTES > remaining) {
    throw new Error(
      `animdata: block ${block} claims ${count} records but only ${remaining} bytes remain`,
    )
  }
  if (count > 4096) {
    throw new Error(`animdata: block ${block} claims ${count} records, which is not a block`)
  }
}

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

// ---------------------------------------------------------------------------
// The exported table
// ---------------------------------------------------------------------------

/** The shape of `public/original/animdata.json`. */
export interface AnimDataDocument {
  readonly note?: string
  readonly source?: string
  readonly recordBytes?: number
  readonly speedScale?: number
  readonly blockCounts?: readonly number[]
  readonly records: Readonly<Record<string, { frames: number; speed: number }>>
  /** Rows the file states twice, after the one in `records`. */
  readonly duplicates?: Readonly<Record<string, readonly { frames: number; speed: number }[]>>
  readonly uninterpreted?: Readonly<Record<string, string>>
}

/** Turns the export back into the same shape {@link parseAnimData} produces. */
export function animDataFromDocument(document: AnimDataDocument): AnimDataFile {
  const records = new Map<string, AnimTiming>()
  const duplicates = new Map<string, readonly AnimTiming[]>()
  const uninterpreted = new Map<string, string>()
  for (const [token, row] of Object.entries(document.records)) {
    records.set(token, {
      token,
      frames: row.frames,
      speed: row.speed,
      block: 0,
      rate: row.speed / SPEED_SCALE,
    })
  }
  for (const [token, rows] of Object.entries(document.duplicates ?? {})) {
    duplicates.set(
      token,
      rows.map((row) => ({
        token,
        frames: row.frames,
        speed: row.speed,
        block: 0,
        rate: row.speed / SPEED_SCALE,
      })),
    )
  }
  for (const [token, hexTail] of Object.entries(document.uninterpreted ?? {})) {
    uninterpreted.set(token, hexTail)
  }
  return {
    records,
    blockCounts: document.blockCounts ?? [],
    duplicates,
    uninterpreted,
  }
}

/** Loads the exported table. Null when the export is absent, as the other loaders do. */
export async function loadAnimData(base: string): Promise<AnimDataFile | null> {
  try {
    const response = await fetch(`${base}original/animdata.json`, { cache: 'no-store' })
    if (!response.ok) return null
    return animDataFromDocument((await response.json()) as AnimDataDocument)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/**
 * The `AnimData.D2` token for an animation key.
 *
 * `chars/am/nu/hth` and `monsters/0a/a1/1hs` both reduce to `<unit><mode><weapon>`, and
 * the tokens in the file are exactly that in upper case. Keys from the flat trees
 * (`missiles/arrow`) have no such record and return null: their rate is stated by
 * their own table row, see {@link FLAT_RATE_PER_SECOND}, and asking `AnimData.D2` for
 * them would be asking a table that does not list them.
 */
export function tokenForAnimationKey(key: string): string | null {
  const parts = key.split('/')
  if (parts.length !== 4) return null
  const [tree, unit, mode, weapon] = parts
  if (tree !== 'chars' && tree !== 'monsters') return null
  if (unit === '' || mode === '' || weapon === '') return null
  return `${unit}${mode}${weapon}`.toUpperCase()
}

/** The timing of one animation key, or null when the table does not list it. */
export function timingFor(data: AnimDataFile, key: string): AnimTiming | null {
  const token = tokenForAnimationKey(key)
  return token === null ? null : (data.records.get(token) ?? null)
}

/** How long one full cycle of the animation takes, in seconds. */
export function cycleSeconds(timing: AnimTiming): number {
  if (timing.rate <= 0) return Number.POSITIVE_INFINITY
  return timing.frames / (timing.rate * GAME_FRAMES_PER_SECOND)
}

/**
 * The animation's clock after `seconds`, in frames — the game frame's fraction included.
 *
 * This is the single conversion from elapsed time to animation progress. It is
 * deliberately fractional: the driver advances the animation by a fraction of a tick,
 * so snapping here and rounding there is what makes two units that started together
 * drift apart.
 */
export function framesElapsed(timing: AnimTiming, seconds: number): number {
  return seconds * GAME_FRAMES_PER_SECOND * timing.rate
}

/**
 * A frame index from animation progress.
 *
 * The one place a frame is chosen: progress is wrapped by the animation's own length,
 * so a caller that passes a monotonically growing clock and one that passes a phase
 * already wrapped both get a valid cell.
 *
 * `frames` is how many frames the **drawn sheet** holds, which is what the renderer
 * indexes, and it defaults to the timing's own count. The two are the same number for
 * 1,311 of the 1,323 actor animations this build exports; where they differ — the
 * Warlock's `a1`, `a2` and `nu`, and one monster's `nu` — the sheet wins because the
 * cell it would otherwise ask for is not there. `tools/verify-anim-timing.ts` lists
 * every disagreement rather than choosing quietly.
 */
export function frameIndexOf(progress: number, timing: AnimTiming, frames = timing.frames): number {
  if (!(frames >= 1)) return 0
  const whole = Math.floor(progress)
  return ((whole % frames) + frames) % frames
}

/** Where inside the current frame the clock is, 0..1. The fraction the driver carries. */
export function frameFraction(progress: number): number {
  const whole = Math.floor(progress)
  return progress - whole
}

/** Where inside the whole cycle the clock is, 0..1. */
export function cycleFraction(progress: number, timing: AnimTiming): number {
  const cycles = progress / Math.max(1, timing.frames)
  return cycles - Math.floor(cycles)
}

/**
 * The distance one full cycle of a locomotion animation covers at a given speed.
 *
 * The animation's own length sets the cycle's *duration* ({@link cycleSeconds}), and the
 * unit's velocity turns that into a *stride*. Advancing the walk by distance over this
 * stride is what keeps the feet with the ground: a unit that is blocked has its cycle
 * freeze where it stood instead of walking on the spot, and a unit whose speed is not
 * the one the art was authored for still takes one step per stride.
 */
export function strideFor(timing: AnimTiming, unitsPerSecond: number): number {
  return unitsPerSecond * cycleSeconds(timing)
}

/**
 * Advances a locomotion phase, in frames, by the distance actually moved.
 *
 * Returns the new phase. A zero distance and a zero speed both leave the phase where it
 * was, which is the behaviour a walk cycle wants when the unit is standing still or
 * pushing against something.
 */
export function advanceWalk(
  phase: number,
  timing: AnimTiming,
  distance: number,
  unitsPerSecond: number,
): number {
  const stride = strideFor(timing, unitsPerSecond)
  if (!(stride > 0) || !Number.isFinite(stride) || !(distance > 0)) return phase
  return phase + (distance / stride) * timing.frames
}

/** The frame index a per-second `rate` clock has reached. Used by the flat trees. */
export function frameFromRate(rate: number, seconds: number): number {
  return Math.floor(Math.max(0, seconds) * rate)
}

/**
 * A clock for an animation `AnimData.D2` does not list.
 *
 * The rate it uses is the table's **modal value** — 256, one frame per game frame,
 * which 2,778 of its 3,631 tokens state — rather than a number invented here. The
 * frame count is the drawn sheet's own. In this build 8 of the export's 1,323 actor
 * animations land here (`monsters/ed/*`, `monsters/oy/tn/*`), and every one of them
 * is art the package has and the table does not mention, which
 * `tools/verify-anim-timing.ts` reports by name.
 */
export function unlistedTiming(frames: number): AnimTiming {
  return { token: '', frames, speed: SPEED_SCALE, block: -1, rate: 1 }
}

