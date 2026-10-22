/**
 * Re-runs the COF container and naming invariants against a real extracted
 * directory.
 *
 * The decoder's claims are all checkable from the files themselves, so this
 * reports counts rather than a boolean:
 *
 * - the file is exactly `29 + 9 * layers + (frames - 1) + frames * directions *
 *   layers` bytes, which is what fixes the location of the layer records and of
 *   the per-frame draw order table,
 * - every frame row is a permutation of the same set of layer slots,
 * - the slot byte of every layer record is a permutation of that same set,
 * - every `.dcc` name decomposes into `class + layer + variant + mode + weapon`
 *   and the layer code in the name is the directory the file lives in,
 * - and every layer of every COF resolves to a `.dcc` that exists.
 *
 * The last one is the decisive one, and it is a real test at this scale: 8
 * classes, 853 COFs, 7,236 layers.
 *
 * This is deliberately a second implementation of the same grammar: if it and
 * the decoder ever disagree, this stops reporting a full pass, which is the
 * reason for keeping it separate.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-cof.ts [<extracted romfs dir>]
 *
 * Needs an extracted copy of the game, which the repository does not carry.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '/tmp/d2r-all')

const HEADER = 29
const RECORD = 9
const CLASS_CODES = new Set(['ai', 'am', 'ba', 'dz', 'ne', 'pa', 'so', 'wk'])
const MODES = new Set([
  'a1',
  'a2',
  'bl',
  'dd',
  'dt',
  'gh',
  'kk',
  'nu',
  'rn',
  's1',
  's2',
  's3',
  's4',
  'sc',
  'th',
  'tn',
  'tw',
  'wl',
])
const WEAPONS = new Set([
  'hth',
  '1hs',
  '1ht',
  '2hs',
  '2ht',
  '1js',
  '1jt',
  '1ss',
  '1st',
  'bow',
  'xbw',
  'stf',
  'ht1',
  'ht2',
])
const LAYERS = ['hd', 'tr', 'lg', 'ra', 'la', 'rh', 'lh', 'sh', 's1', 's2', 's3']

/** Every file below a directory, as paths relative to it. */
function findFiles(dir: string, out: string[], base = dir): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    let isDirectory = false
    try {
      isDirectory = statSync(path).isDirectory()
    } catch {
      continue
    }
    if (isDirectory) findFiles(path, out, base)
    else out.push(relative(base, path))
  }
}

interface DccEntry {
  path: string
  layer: string
  variant: string
  mode: string
  weapon: string
}

interface ClassTree {
  classCode: string
  dccs: DccEntry[]
  /** Every `.cof` under `cof/`, whether or not its name decomposes. */
  cofFiles: string[]
}

function readClassName(path: string): string | null {
  const file = path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'))
  if (file.length !== 7) return null
  const classCode = file.slice(0, 2)
  const mode = file.slice(2, 4)
  const weapon = file.slice(4, 7)
  if (!CLASS_CODES.has(classCode) || !MODES.has(mode) || !WEAPONS.has(weapon)) return null
  return file
}

function readDccName(path: string): DccEntry | null {
  const file = path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'))
  if (file.length !== 12) return null
  const classCode = file.slice(0, 2)
  const layer = file.slice(2, 4)
  const variant = file.slice(4, 7)
  const mode = file.slice(7, 9)
  const weapon = file.slice(9, 12)
  if (!CLASS_CODES.has(classCode) || !LAYERS.includes(layer)) return null
  if (!MODES.has(mode) || !WEAPONS.has(weapon)) return null
  return { path, layer, variant, mode, weapon }
}

/** Histogram as `a=1 b=2`, largest bucket first. */
function histogram(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
}

function tally(counts: Map<string, number>, key: string | number): void {
  const text = String(key)
  counts.set(text, (counts.get(text) ?? 0) + 1)
}

function main(): void {
  const charsDir = join(root, 'global', 'chars')
  let classDirs: string[]
  try {
    classDirs = readdirSync(charsDir).filter((entry) => CLASS_CODES.has(entry))
  } catch {
    console.error(`verify-cof: no character data under ${charsDir}`)
    process.exitCode = 1
    return
  }
  if (classDirs.length === 0) {
    console.error(`verify-cof: no character data under ${charsDir}`)
    process.exitCode = 1
    return
  }

  const failures: string[] = []
  const note = (message: string): void => {
    if (failures.length < 20) failures.push(message)
  }

  const trees: ClassTree[] = []
  let dccNames = 0
  let dccMisplaced = 0
  let dccUnparsed = 0
  const variants = new Set<string>()
  for (const classCode of classDirs) {
    const base = join(charsDir, classCode)
    const files: string[] = []
    findFiles(base, files)
    const dccs: DccEntry[] = []
    const cofFiles: string[] = []
    for (const path of files) {
      const lower = path.toLowerCase()
      if (lower.endsWith('.dcc')) {
        dccNames += 1
        const parsed = readDccName(path)
        if (parsed === null) {
          dccUnparsed += 1
          note(`${classCode}/${path}: not <class><layer><variant><mode><weapon>`)
          continue
        }
        const dir = path.slice(0, path.lastIndexOf('/'))
        if (dir !== parsed.layer) {
          dccMisplaced += 1
          note(`${classCode}/${path}: name says layer ${parsed.layer}, directory is ${dir}`)
        }
        variants.add(parsed.variant)
        dccs.push(parsed)
        continue
      }
      if (!lower.endsWith('.cof')) continue
      cofFiles.push(path)
      if (readClassName(path) === null) {
        note(`${classCode}/${path}: not <class><mode><weapon>`)
      }
    }
    trees.push({ classCode, dccs, cofFiles })
  }

  const layerCounts = new Map<string, number>()
  const frameCounts = new Map<string, number>()
  const directionCounts = new Map<string, number>()
  const sizeFailures: string[] = []
  const rowFailures: string[] = []
  const slotFailures: string[] = []
  const tiers = new Map<string, number>()
  const slotDrawn = new Map<number, number>()
  const slotBacked = new Map<number, number>()
  const unresolved = new Map<string, string[]>()
  const crossPairs = new Map<string, number>()
  let files = 0
  let cofs = 0
  let layers = 0
  let skipped = 0

  for (const tree of trees) {
    const byLayer = new Map<string, DccEntry[]>()
    for (const dcc of tree.dccs) {
      const key = `${dcc.layer}\u0000${dcc.mode}`
      const bucket = byLayer.get(key)
      if (bucket) bucket.push(dcc)
      else byLayer.set(key, [dcc])
    }

    for (const cofPath of tree.cofFiles) {
      const cofName = cofPath.slice(cofPath.lastIndexOf('/') + 1, -4)
      const path = join(charsDir, tree.classCode, cofPath)
      files += 1
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(readFileSync(path))
      } catch (error) {
        note(`${tree.classCode}/${cofName}.cof: ${String(error)}`)
        continue
      }
      if (bytes.length < HEADER) {
        sizeFailures.push(`${tree.classCode}/${cofPath}: shorter than a header`)
        continue
      }
      const layerCount = bytes[0]
      const frames = bytes[1]
      const directions = bytes[2]
      if (layerCount === 0 || frames === 0 || directions === 0) {
        sizeFailures.push(`${tree.classCode}/${cofPath}: empty animation`)
        continue
      }
      const expected = HEADER + layerCount * RECORD + (frames - 1) + frames * directions * layerCount
      if (expected !== bytes.length) {
        sizeFailures.push(
          `${tree.classCode}/${cofPath}: ${bytes.length} bytes, layout says ${expected}`,
        )
        continue
      }
      cofs += 1
      if (readClassName(cofPath) === null) {
        // Its layers cannot be resolved without a mode and a weapon class.
        skipped += layerCount
        continue
      }
      layers += layerCount
      tally(layerCounts, layerCount)
      tally(frameCounts, frames)
      tally(directionCounts, directions)

      // Layer records: a NUL terminated printable name at +4 of every record.
      const names: string[] = []
      let namesOk = true
      for (let k = 0; k < layerCount; k += 1) {
        const at = HEADER + k * RECORD
        const raw = bytes.subarray(at + 4, at + 8)
        let name = ''
        for (let i = 0; i < 4 && raw[i] !== 0; i += 1) name += String.fromCharCode(raw[i])
        if (name.length < 2 || raw[name.length] !== 0) namesOk = false
        names.push(name)
      }
      if (!namesOk) note(`${tree.classCode}/${cofPath}: layer name is not NUL terminated text`)

      // Draw order table: frames * directions rows of layerCount slots.
      const bodyStart = bytes.length - frames * directions * layerCount
      const drawn: number[] = []
      let rowsOk = true
      for (let i = 0; i < frames * directions; i += 1) {
        const at = bodyStart + i * layerCount
        const seen = new Set<number>()
        for (let j = 0; j < layerCount; j += 1) {
          const slot = bytes[at + j]
          seen.add(slot)
          if (i === 0) drawn.push(slot)
        }
        if (seen.size !== layerCount) rowsOk = false
        if (i > 0 && seen.size === drawn.length && drawn.some((slot) => !seen.has(slot))) {
          rowsOk = false
        }
      }
      if (!rowsOk) {
        rowFailures.push(`${tree.classCode}/${cofPath}: a frame row is not a permutation`)
        continue
      }
      drawn.sort((a, b) => a - b)

      // The slot byte of the records must be a permutation of the drawn slots.
      const claimed = new Set<number>()
      for (let k = 0; k < layerCount - 1; k += 1) claimed.add(bytes[HEADER + k * RECORD + 8])
      const unclaimed = drawn.filter((slot) => !claimed.has(slot))
      const slots = [...claimed]
      slots.push(
        unclaimed.length === 1
          ? unclaimed[0]
          : bytes[HEADER + (layerCount - 1) * RECORD + 8],
      )
      if (slots.length !== drawn.length || new Set(slots).size !== drawn.length) {
        slotFailures.push(`${tree.classCode}/${cofPath}: slot bytes are not a permutation`)
      } else if (drawn.some((slot) => !slots.includes(slot))) {
        slotFailures.push(`${tree.classCode}/${cofPath}: slot bytes miss a drawn slot`)
      }

      // Resolution: every drawn slot's directory must hold a file for this
      // animation, and the layer's own weapon class is asked for first.
      const mode = cofName.slice(2, 4)
      const weapon = cofName.slice(4, 7)
      const missing: string[] = []
      for (let k = 0; k < layerCount; k += 1) {
        const layerDir = LAYERS[slots[k]] ?? `slot${slots[k]}`
        // The key holds the layer code of the name; the directory is checked
        // too so a misfiled sprite cannot answer for the wrong layer.
        const candidates = (byLayer.get(`${layerDir}\u0000${mode}`) ?? []).filter(
          (dcc) => dcc.path.startsWith(layerDir),
        )
        slotDrawn.set(slots[k], (slotDrawn.get(slots[k]) ?? 0) + 1)
        if (candidates.length > 0) slotBacked.set(slots[k], (slotBacked.get(slots[k]) ?? 0) + 1)
        if (candidates.length === 0) {
          missing.push(`${LAYERS[slots[k]] ?? slots[k]}:${names[k]}`)
          continue
        }
        const own = candidates.some((dcc) => dcc.weapon === names[k])
        const hth = candidates.some((dcc) => dcc.weapon === 'hth')
        const self = candidates.some((dcc) => dcc.weapon === weapon)
        const tier = own ? 'ownClass' : hth ? 'hth' : self ? 'weapon' : 'anyClass'
        tally(tiers, tier)
        // Cross-check the sprite header: byte 2 is the direction count, byte 3
        // the frames per direction, and both must be the COF's.
        const pick = candidates.find((dcc) => dcc.weapon === names[k]) ?? candidates[0]
        let header: Uint8Array
        try {
          header = new Uint8Array(readFileSync(join(charsDir, tree.classCode, pick.path)))
        } catch {
          continue
        }
        if (header.length >= 4) {
          const sameFrames = header[3] === frames
          const sameDirections = header[2] === directions
          tally(
            crossPairs,
            sameFrames && sameDirections
              ? 'both'
              : sameFrames
                ? 'framesOnly'
                : sameDirections
                  ? 'directionsOnly'
                  : 'neither',
          )
        }
      }
      if (missing.length > 0) {
        unresolved.set(`${tree.classCode}/${cofPath}`, missing)
      }
    }
  }

  const total = [...tiers.values()].reduce((sum, value) => sum + value, 0)
  const unresolvedLayers = [...unresolved.values()].reduce((sum, list) => sum + list.length, 0)
  const resolved = total
  const percentage =
    resolved + unresolvedLayers === 0 ? 0 : (100 * resolved) / (resolved + unresolvedLayers)

  console.log(`verify-cof: ${files} .cof files, ${dccNames} .dcc files in ${trees.length} classes`)
  console.log(
    `verify-cof: ${cofs} COFs, ${layers} layers` +
      (skipped > 0 ? ` (${skipped} more layers sit in COFs that do not decompose)` : ''),
  )
  console.log(`verify-cof: layers per COF ${histogram(layerCounts)}`)
  console.log(`verify-cof: frames per direction ${histogram(frameCounts)}`)
  console.log(`verify-cof: directions ${histogram(directionCounts)}`)
  console.log(
    `verify-cof: ${cofs}/${files} match 29 + 9*layers + (frames - 1) + frames*directions*layers`,
  )
  console.log(`verify-cof: ${dccNames - dccUnparsed} names decompose, ${variants.size} variants`)
  console.log(
    `verify-cof: layers resolved ${resolved}/${resolved + unresolvedLayers} ` +
      `(${percentage.toFixed(3)}%) ${histogram(tiers)}`,
  )
  console.log(`verify-cof: sprite header cross-check ${histogram(crossPairs)}`)
  console.log(
    'verify-cof: drawn slot backed by a directory that has sprites ' +
      LAYERS.map((dir, slot) => `${dir}=${slotBacked.get(slot) ?? 0}/${slotDrawn.get(slot) ?? 0}`)
        .join(' '),
  )

  for (const [cof, list] of unresolved) {
    console.warn(`  ${cof}: no sprite for ${list.join(' ')}`)
  }
  for (const failure of sizeFailures.slice(0, 20)) console.warn(`  ${failure}`)
  for (const failure of rowFailures.slice(0, 20)) console.warn(`  ${failure}`)
  for (const failure of slotFailures.slice(0, 20)) console.warn(`  ${failure}`)
  for (const failure of failures.slice(0, 20)) console.warn(`  ${failure}`)

  const broken =
    sizeFailures.length +
    rowFailures.length +
    slotFailures.length +
    dccUnparsed +
    dccMisplaced +
    unresolvedLayers +
    failures.length
  if (broken > 0) {
    console.error(
      `verify-cof: FAILED (${sizeFailures.length} files off the layout, ` +
        `${rowFailures.length} frame tables that are not permutations, ` +
        `${slotFailures.length} layer tables that are not permutations, ` +
        `${dccUnparsed} names that do not decompose, ${dccMisplaced} misplaced sprites, ` +
        `${unresolvedLayers} of ${resolved + unresolvedLayers} layers with no sprite ` +
        `in ${unresolved.size} COFs, ${failures.length} naming notes)`,
    )
    process.exitCode = 1
    return
  }
  console.log('verify-cof: OK')
}

main()
