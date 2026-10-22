/**
 * Checks that no frame in this app is chosen from a number no file states.
 *
 * The app draws animations from `AnimData.D2`'s speed and the COF's frame count, and
 * the whole point of `src/d2/anim-timing.ts` is that it is the *only* place a frame is
 * chosen. Before it, four different invented rates lived in `game.ts` — a 9 fps clock
 * for the hero, an 8 fps one for monsters, a `2.1` frames-per-tile walk factor, and a
 * `16` for the flat art — and none of them was in any file the game ships. A comment
 * saying "do not do that again" is not a check; this is.
 *
 * Three things are verified, and each of them is a claim that can be false:
 *
 * 1. **Every rate in use comes from a file.** Per animation kind, the table the rate
 *    was read from is printed with the counts, including the animations it does *not*
 *    cover: for the actor trees that is `AnimData.D2`'s token, and the ones it has no
 *    row for are named one by one, because they are the animations that play at
 *    `unlistedTiming`'s rate rather than at their own.
 * 2. **The frame counts agree.** `AnimData.D2` states a frame count per record and so
 *    does the COF the record names; where the two disagree the sheet's count is the one
 *    the renderer indexes, and every disagreement is printed rather than tolerated
 *    silently. On this export that is 4 animations out of 1,323.
 * 3. **No frame index can be chosen from a constant.** `src/game.ts` is read as text
 *    and searched for the shapes that were there before: a `walkPhase += dt * speed *
 *    <number>`, a `Math.floor(<clock> * <number>)` feeding a frame, a `% <x>.frames`
 *    over such a product, and the removed `FLAT_ART_FPS` name. It also asserts that the
 *    module's own entry points are the ones being called. This fails on a regression
 *    that a type check cannot see, because a wrong multiplier is still a number.
 *
 * The flat trees — missiles and overlays — are the one place where the game states a
 * rate *without a unit*: `overlays.txt`'s `AnimRate` and `missiles.txt`'s `AnimSpeed`.
 * The app reads them as frames per second, which is the plain reading, so this tool
 * prints what the tables actually state rather than pretending there is a conversion
 * to be had.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-anim-timing.ts [<export dir>]
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  animDataFromDocument,
  cycleSeconds,
  FLAT_RATE_PER_SECOND,
  frameIndexOf,
  framesElapsed,
  SPEED_SCALE,
  strideFor,
  tokenForAnimationKey,
  type AnimDataDocument,
  type AnimDataFile,
} from '../src/d2/anim-timing'
import type { AnimIndex } from '../src/d2/anim'

const exportRoot = resolve(process.argv[2] ?? join(import.meta.dirname, '../public/original'))
const sourceRoot = resolve(import.meta.dirname, '..')

/** The kind an animation key belongs to. */
type Kind = 'chars' | 'monsters' | 'missiles' | 'overlays'

function kindOf(key: string): Kind | null {
  const head = key.split('/')[0]
  return head === 'chars' || head === 'monsters' || head === 'missiles' || head === 'overlays'
    ? head
    : null
}

function histogram(values: readonly number[]): Array<[number, number]> {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])
}

function percent(part: number, whole: number): string {
  return whole === 0 ? '--' : `${((part / whole) * 100).toFixed(1)}%`
}

/** The `AnimRate`/`AnimSpeed` a table states for its rows, and the exceptions by value. */
function flatTableRate(file: string, column: string): { rows: number; values: Array<[number, number]> } {
  const path = join(exportRoot, file)
  if (!existsSync(path)) return { rows: 0, values: [] }
  const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>
  const values: number[] = []
  for (const row of rows) {
    const raw = row[column]
    const value = raw === null || raw === undefined ? Number.NaN : Number(raw)
    if (Number.isFinite(value)) values.push(value)
  }
  return { rows: values.length, values: histogram(values) }
}

function main(): void {
  const problems: string[] = []
  const animPath = join(exportRoot, 'anim', 'index.json')
  const dataPath = join(exportRoot, 'animdata.json')
  if (!existsSync(animPath)) {
    console.log(`anim-timing: no animation manifest at ${animPath}`)
    process.exitCode = 1
    return
  }
  if (!existsSync(dataPath)) {
    console.log(
      `anim-timing: no ${dataPath} — the animation clock is missing, so every animation\n` +
        '  would play at the fallback rate. Rebuild it with tools/export-animdata.ts.',
    )
    process.exitCode = 1
    return
  }

  const index = JSON.parse(readFileSync(animPath, 'utf8')) as AnimIndex
  const document = JSON.parse(readFileSync(dataPath, 'utf8')) as AnimDataDocument
  const data: AnimDataFile = animDataFromDocument(document)

  // -- the table itself -----------------------------------------------------
  const records = [...data.records.values()]
  const speeds = records.map((record) => record.speed)
  const speedCounts = histogram(speeds)
  const modalSpeed = speedCounts[0][0]
  console.log(`anim-timing: ${relative(process.cwd(), dataPath)}`)
  console.log(
    `  ${records.length} records in ${data.blockCounts.length} blocks, ` +
      `${[...data.duplicates.values()].reduce((n, rows) => n + rows.length - 1, 0)} rows the ` +
      `file states twice, ${data.uninterpreted.size} uninterpreted tails`,
  )
  console.log(
    `  speed: ${speedCounts.length} distinct values, modal ${modalSpeed} ` +
      `(${percent(speedCounts[0][1], records.length)}), ${speedCounts
        .slice(0, 6)
        .map(([value, count]) => `${value}x${count}`)
        .join(' ')}`,
  )
  const above = speeds.filter((speed) => speed > SPEED_SCALE).length
  const zero = speeds.filter((speed) => speed === 0).length
  const odd = speeds.filter((speed) => speed % 8 !== 0).length
  console.log(
    `  exceptions in the field: ${above} above the ${SPEED_SCALE} scale, ${zero} at speed 0, ` +
      `${odd} not a multiple of 8`,
  )
  if (modalSpeed !== SPEED_SCALE) {
    problems.push(
      `the modal speed is ${modalSpeed}, not ${SPEED_SCALE}: the scale the clock divides by is wrong`,
    )
  }

  // -- per kind, what rate is in use and where it came from -----------------
  const byKind = new Map<Kind, string[]>()
  for (const key of Object.keys(index.animations)) {
    const kind = kindOf(key)
    if (kind !== null) byKind.set(kind, [...(byKind.get(kind) ?? []), key])
  }

  const unlisted: string[] = []
  const disagreements: string[] = []
  const actorRates = new Map<Kind, number[]>()
  const actorFrames = new Map<Kind, number[]>()
  for (const kind of ['chars', 'monsters'] as const) {
    const keys = byKind.get(kind) ?? []
    const inUse: number[] = []
    const frameCounts: number[] = []
    for (const key of keys) {
      const entry = index.animations[key]
      const token = tokenForAnimationKey(key)
      const record = token === null ? undefined : data.records.get(token)
      frameCounts.push(entry.frames)
      if (record === undefined) {
        unlisted.push(`${key} (token ${token ?? 'none'})`)
        inUse.push(SPEED_SCALE)
      } else {
        inUse.push(record.speed)
        if (record.frames !== entry.frames) {
          disagreements.push(
            `${key}: the COF holds ${entry.frames} frames, AnimData.D2 says ${record.frames} ` +
              `(token ${token}, speed ${record.speed}) — the sheet's count is indexed`,
          )
        }
      }
    }
    actorRates.set(kind, inUse)
    actorFrames.set(kind, frameCounts)
  }

  const unlistedIn = (kind: Kind): number =>
    unlisted.filter((line) => line.startsWith(`${kind}/`)).length
  for (const kind of ['chars', 'monsters'] as const) {
    const keys = byKind.get(kind) ?? []
    const speeds = histogram(actorRates.get(kind) ?? [])
    const frames = histogram(actorFrames.get(kind) ?? [])
    console.log(
      `  ${kind.padEnd(9)} ${String(keys.length).padStart(5)} animations, ` +
        `${String(keys.length - unlistedIn(kind)).padStart(5)} timed from AnimData.D2 ` +
        `(${unlistedIn(kind)} unlisted, below)`,
    )
    console.log(
      `    speed  ${speeds
        .slice(0, 8)
        .map(([value, count]) => `${value}x${count}`)
        .join(' ')}${speeds.length > 8 ? ` … ${speeds.length - 8} more values` : ''}`,
    )
    console.log(
      `    frames ${frames
        .slice(0, 8)
        .map(([value, count]) => `${value}x${count}`)
        .join(' ')}${frames.length > 8 ? ` … ${frames.length - 8} more values` : ''}`,
    )
  }

  const missile = flatTableRate('table_missiles.json', 'AnimSpeed')
  const overlay = flatTableRate('table_overlay.json', 'AnimRate')
  console.log(
    `  missiles  ${String((byKind.get('missiles') ?? []).length).padStart(5)} animations, ` +
      `missiles.txt AnimSpeed: ${missile.values
        .slice(0, 6)
        .map(([value, count]) => `${value}x${count}`)
        .join(' ')}`,
  )
  console.log(
    `  overlays  ${String((byKind.get('overlays') ?? []).length).padStart(5)} animations, ` +
      `overlays.txt AnimRate: ${overlay.values
        .slice(0, 6)
        .map(([value, count]) => `${value}x${count}`)
        .join(' ')}`,
  )
  const stated = new Set([...missile.values, ...overlay.values].map(([value]) => value))
  if (!stated.has(FLAT_RATE_PER_SECOND)) {
    problems.push(
      `the flat trees play at ${FLAT_RATE_PER_SECOND} but neither table states that rate: ` +
        'that number is the app\'s, not the game\'s',
    )
  }

  // -- the animations the table does not cover ------------------------------
  console.log(
    `  AnimData.D2 does not list ${unlisted.length} of the exported actor animations, ` +
      'which play at its modal rate:',
  )
  for (const key of unlisted) console.log(`    ${key}`)

  // -- frame counts, agreed and not ----------------------------------------
  const actorCount = [...(byKind.get('chars') ?? []), ...(byKind.get('monsters') ?? [])].length
  console.log(
    `  frame counts: ${actorCount - disagreements.length - unlisted.length} of ${actorCount} actor ` +
      `animations agree with AnimData.D2, ${disagreements.length} disagree:`,
  )
  for (const line of disagreements) console.log(`    ${line}`)

  // -- the walk, where the phase comes from distance ------------------------
  const walks = [...(byKind.get('chars') ?? []), ...(byKind.get('monsters') ?? [])].filter((key) =>
    key.split('/')[2] === 'wl',
  )
  let frozen = 0
  let shortest = Number.POSITIVE_INFINITY
  let longest = 0
  let widestStride = 0
  for (const key of walks) {
    const token = tokenForAnimationKey(key)
    const record = token === null ? undefined : data.records.get(token)
    if (record === undefined) continue
    const cycle = cycleSeconds(record)
    if (!Number.isFinite(cycle)) {
      frozen += 1
      continue
    }
    shortest = Math.min(shortest, cycle)
    longest = Math.max(longest, cycle)
    // A stride is only meaningful against a speed; the app's own hero speed is the
    // yardstick here, and it is printed as a range rather than an average.
    widestStride = Math.max(widestStride, strideFor(record, 4.1))
  }
  console.log(
    `  walk: ${walks.length} animations, ${frozen} with no cycle at all (speed 0), ` +
      `cycle ${shortest.toFixed(3)}–${longest.toFixed(3)} s, ` +
      `stride at the hero's 4.1 units/s ${(4.1 * shortest).toFixed(2)}–${widestStride.toFixed(2)} units`,
  )
  if (frozen > 0) {
    console.log(
      '    (a speed-0 walk would advance 0 frames forever; `advanceWalk` returns the phase ' +
        'unchanged rather than dividing by an infinite stride)',
    )
  }

  // -- the hero, mode by mode, which is what the player sees ---------------
  const weapons = (index as { heroWeapons?: Readonly<Record<string, string>> }).heroWeapons ?? {}
  console.log('  the hero, per mode (heroWeapons from the manifest):')
  for (const [key, weapon] of Object.entries(weapons)) {
    if (!key.endsWith('/nu')) continue
    const code = key.split('/')[1]
    for (const mode of ['nu', 'wl', 'a1', 'sc', 'gh', 'dd']) {
      const animation = `chars/${code}/${mode}/${weapon}`
      const entry = index.animations[animation]
      if (entry === undefined) continue
      const token = tokenForAnimationKey(animation)
      const record = token === null ? undefined : data.records.get(token)
      const speed = record?.speed ?? SPEED_SCALE
      const frames = entry.frames
      const cycle = frames / ((speed / SPEED_SCALE) * 25)
      console.log(
        `    ${animation.padEnd(22)} ${String(frames).padStart(2)} frames  ` +
          `speed ${String(speed).padStart(3)}  ` +
          `${((speed / SPEED_SCALE) * 25).toFixed(1).padStart(5)} fps  ` +
          `cycle ${cycle.toFixed(3)} s` +
          (record === undefined ? '  (not in AnimData.D2)' : ''),
      )
    }
  }

  // -- nothing may choose a frame from a constant --------------------------
  const game = readFileSync(join(sourceRoot, 'src', 'game.ts'), 'utf8')
  const invented: Array<[RegExp, string]> = [
    [/walkPhase\s*\+=/, 'a walk phase advanced by a constant instead of by distance'],
    [/Math\.floor\([^()\n]*\*\s*[0-9.]+\)\s*%\s*[\w.]+\.frames/, 'a frame index from an invented multiplier'],
    [/\*\s*2\.1\b/, 'the removed 2.1 frames-per-tile walk factor'],
    [/FLAT_ART_FPS/, 'the removed flat-art frames-per-second constant'],
    [/frame\.value\s*=\s*Math\.floor\(/, 'a frame value written straight from a floor()'],
  ]
  for (const [pattern, what] of invented) {
    const match = pattern.exec(game)
    if (match !== null) {
      problems.push(`${what}: game.ts has ${JSON.stringify(match[0])}`)
    }
  }
  for (const needed of ['frameIndexOf(', 'framesElapsed(', 'advanceWalk(', 'frameFromRate(']) {
    if (!game.includes(needed)) {
      problems.push(`game.ts never calls ${needed} — a frame is chosen somewhere else`)
    }
  }

  // -- the clock itself, on a record whose answer is known ------------------
  const nu = data.records.get('AMNUHTH')
  if (nu === undefined) {
    problems.push('AnimData.D2 has no AMNUHTH record, so the neutral pose has no rate')
  } else {
    // 8 frames at 128/256 of a frame per game frame is one frame every 80 ms, so at
    // 0.20 s the clock is on frame 2 and the wrap is exact.
    const frame = frameIndexOf(framesElapsed(nu, 0.2), nu)
    if (frame !== 2) problems.push(`AMNUHTH at 0.20 s is frame ${frame}, expected 2`)
    if (frameIndexOf(framesElapsed(nu, 0.2 + cycleSeconds(nu)), nu) !== 2) {
      problems.push('AMNUHTH does not wrap on its own cycle length')
    }
  }

  if (problems.length > 0) {
    console.log('\nanim-timing: failed')
    for (const problem of problems) console.log(`  ! ${problem}`)
    process.exitCode = 1
    return
  }
  console.log('\nanim-timing: ok — every rate in use is stated by a file the app reads')
}

main()
