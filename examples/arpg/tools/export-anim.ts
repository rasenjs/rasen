/**
 * Exports the game's animations as sprite sheets plus one manifest.
 *
 * The animation trees are large — `global/chars` is 16,089 `.dcc` holding
 * 3,212,304 frames and 426 MB, `global/monsters` another 4,800 `.dcc` plus 56
 * `.dc6` in 198 MB — and the game asks only a small set of questions of them, so
 * this exports what answers those and nothing else:
 *
 * ```
 * chars/<class>/<mode>/<weapon>        the hero: 8 classes x the 8 played modes
 * monsters/<token>/<mode>/<weapon>     every token under global/monsters, every mode it has
 * missiles/<name>/<stored direction>   every file, keyed by name
 * overlays/<name>/<stored direction>   every file, keyed by name
 * ```
 *
 * ## Which animations, and why those
 *
 * The hero is exported for the modes a player actually plays — `nu` neutral,
 * `wl` walk, `rn` run, `a1` and `a2` the two attacks, `sc` cast, `gh` gethit,
 * `dd` death — for one weapon class. `hth` (bare hands) is the default because
 * it is the only class with a COF for all 8 modes in 7 of the 8 classes; the
 * exceptions are `ba` and `dz`, whose `a2` exists only for real weapons
 * (`baa21hs.cof`, `dza21hs.cof`), so those fall back to `1hs`, the next entry of
 * {@link HERO_WEAPONS}. The weapon chosen per animation is in the manifest's
 * `heroWeapons`. 64 of the 854 character COFs are exported, 7.5% of that tree.
 *
 * Monsters are exported whole: 1,301 COFs over 232 tokens. Missiles and
 * overlays carry no COF and their names are free-form (`arrow`, `frostnova`,
 * `auraholyfireback`), so they are keyed by their path under the tree with the
 * extension dropped — `frostnova` is in both `missiles/expansion` and
 * `missiles/extra` and a bare name would collide.
 *
 * ## Directions: 8 of the 16 the files store
 *
 * Measured over the package: 16,074 of the 16,089 character `.dcc` declare 16
 * directions while 4,315 of the 4,800 monster `.dcc` declare 8 and 437 declare
 * 1; missiles declare 1, 4, 8, 16 or 32 and 394 of the 406 overlays declare 1.
 * The world this exports for is 8-heading (`src/sprites.ts` sets
 * `DIRECTIONS = 8`), so an animation storing more than 8 is subsampled to 8
 * taken every `stored / 8`-th from direction 0. Every sheet records the stored
 * index it holds, so a consumer that mounts the eight headings at a different
 * stored index changes one field per direction instead of re-exporting.
 *
 * The run reports the exact cost of the choice: the same frames in every stored
 * direction declare twice the pixels for the character tree.
 *
 * ## Sheet layout: one PNG per animation *and direction*
 *
 * A sheet holds one direction, and inside it a grid whose rows are the
 * animation's layers and whose columns are the frames. The COF draw order is
 * recorded separately, because which layer is in front changes with the frame.
 *
 * A direction is the unit the renderer asks for, so a per-direction sheet makes
 * a texture upload worth exactly one frame sequence; stacking all 8 directions
 * into one image would make every upload 8 times as tall for the 7 directions
 * the caller is not drawing.
 *
 * The grid is sized so that it tiles exactly, which is what makes the manifest
 * checkable: column `slot` is as wide as the widest frame any layer puts in that
 * slot and row `band * layers.length + layer` as tall as the tallest frame that
 * layer puts in that band, so the prefix sums of the widths and heights are the
 * sheet, with no gap and no overlap, and every frame is drawn at the top left of
 * its cell with the leftover pixels left transparent.
 *
 * A frame is not normalised: a DCC frame carries its own `width`, `height`,
 * `offsetX` and `offsetY`, `offsetY` being the frame's *bottom* row relative to
 * the anchor, and the manifest repeats all four per frame per layer.
 *
 * Frames are wrapped into bands of at most 4096 px because a single row does not
 * fit: `monsters/42/tr/42trlitdthth.dc6` is a 200-frame, 186 px tall death whose
 * frames are 23,108 px side by side.
 *
 * ## Output
 *
 * ```
 * <out>/chars/<class>/<mode>/<weapon>/<stored direction>.png
 * <out>/monsters/<token>/<mode>/<weapon>/<stored direction>.png
 * <out>/missiles/<path>/<stored direction>.png
 * <out>/overlays/<path>/<stored direction>.png
 * <out>/index.json
 * ```
 *
 * `index.json` is the whole manifest. A cell is four numbers —
 * `[width, height, offsetX, offsetY]`, or null when the layer has no art for
 * that frame — rather than an object, because there are hundreds of thousands of
 * them; the run reports the size.
 *
 * The export is idempotent: the out dir is cleared first, and it refuses to
 * clear a directory holding a file it did not write.
 *
 * ## Exports written before the readers' row order was fixed
 *
 * `dc6.ts` and `dcc.ts` used to return their frames the other way up, so a sheet from
 * that build holds every layer band with its picture's rows reversed inside the frame's
 * own box. Re-running this tool with the fixed readers is what corrects it, and it
 * changes nothing else: not a cell size, not an offset, not a band position. Where the
 * game tree is not at hand, turning each band round *inside its declared box* (the
 * manifest's `cells[frame][layer]`, which is what `tools/verify-anim-compose.ts` checks
 * the art fills) is exactly equivalent, and that is how the copy in `public/original/`
 * was brought forward.
 *
 * Usage:
 *   tsx examples/arpg/tools/export-anim.ts [<romfs dir, default /tmp/d2r-all>] [<out dir>]
 *
 * Reads the game tree and writes only under the out dir, which is git-ignored
 * (`examples/arpg/public/original/`): the game's assets are not redistributable
 * and this script is the reproducible way to rebuild them from a copy the user
 * owns.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CLASS_CODES, createCharAnimIndex, type CharAnimIndex } from '../src/d2/charanim'
import { LAYER_SLOTS, parseCof, type CofFile } from '../src/d2/cof'
import { frameToRgba as dc6ToRgba, parseDc6 } from '../src/d2/dc6'
import { frameToRgba as dccToRgba, parseDcc } from '../src/d2/dcc'
import { parsePalette, type Palette } from '../src/d2/tileart'
import { encodePng } from '../src/original/png'

/** The palette every DCC and DC6 in the package is indexed against. */
const PALETTE_FILE = 'global/palette/act1/pal.dat'
const CHARS_DIR = 'global/chars'
const MONSTERS_DIR = 'global/monsters'
const MISSILES_DIR = 'global/missiles'
const OVERLAYS_DIR = 'global/overlays'

/** Directories this tool writes at the out root; anything else there is not ours. */
const OWNED_ENTRIES = new Set(['index.json', 'chars', 'monsters', 'missiles', 'overlays'])

/**
 * The modes a player plays. `ba` and `dz` have no `a2` under `hth`, see HERO_WEAPONS.
 *
 * `tn` and `tw` — the town stances `plrmode.txt` numbers 5 and 6 — are deliberately
 * absent, not overlooked. The list is what this tool exports, and the package has no
 * `chars/<class>/tn` or `/tw` art to export: adding the mode here without that art
 * would write a manifest entry with no sheet behind it. `ACTOR_MODES` in
 * `src/d2/anim-art.ts` is the same seven for the same reason.
 */
const HERO_MODES = ['nu', 'wl', 'rn', 'a1', 'a2', 'sc', 'gh', 'dd'] as const

/**
 * Weapon classes to try for each hero mode, best first.
 *
 * `hth` resolves all 8 modes for 7 of the 8 classes. `ba` and `dz` only have
 * `a2` under a real weapon (`baa21hs.cof`, `dza21hs.cof`), which `1hs` supplies;
 * the rest of the list is the order `charanim.ts` documents.
 */
const HERO_WEAPONS = [
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
] as const

/** The headings the world plays. */
const PLAYED_DIRECTIONS = 8

/**
 * Equipment variants to prefer, best first.
 *
 * A COF records which weapon class a layer's sprite is stored under but not
 * which armour weight, and the body layers carry three of them
 * (`batrhvynuhth`, `batrlitnuhth`, `batrmednuhth` are the barbarian's torso
 * alone). Light is the base look and wins the tie; a layer with one variant is
 * unaffected.
 */
const VARIANT_PREFERENCE = ['lit', 'med', 'hvy']

/**
 * The layer table for monsters: {@link LAYER_SLOTS} plus `s4`..`s8`.
 *
 * Monster COFs carry slot ids up to 15 where the character ones stop at 10.
 * Reading slot ids through this 16-entry table resolves 3,150 of the 3,152
 * monster layer records to a directory that exists under its token; the 11-entry
 * one resolves 3,043 — `bb`'s slot 15 is exactly the `bbs8litdhth.dcc` in
 * `bb/s8/`. The two records neither table resolves (`fa` slot 10 naming `s3`,
 * `mg` slot 8 naming `s1`) name directories their token does not have.
 */
const MONSTER_LAYER_SLOTS: readonly string[] = [...LAYER_SLOTS, 's4', 's5', 's6', 's7', 's8']

/** Widest sheet this tool emits, see the header. */
const MAX_SHEET_WIDTH = 4096

/** One decoded frame: the shape both the `.dcc` and the `.dc6` decoder produce. */
interface IndexedFrame {
  width: number
  height: number
  offsetX: number
  offsetY: number
  pixels: Uint8Array
  alpha: Uint8Array
}

/** A decoded sprite file. */
interface Sprite {
  file: string
  kind: 'dcc' | 'dc6'
  /** `[stored direction][frame]`. */
  frames: IndexedFrame[][]
}

/** One layer of an animation, before its sprite is decoded. */
interface LayerPlan {
  /** The COF layer directory it is drawn from, or null for a single-file animation. */
  slot: string | null
  /** The weapon class the COF asks this layer for, or null. */
  name: string | null
  /** Package-relative path of the sprite. */
  file: string
}

/**
 * One animation, planned but not decoded.
 *
 * The draw order table is kept as flat bytes: the monsters alone contribute
 * 409,592 rows of `layerCount` bytes and holding them as arrays of numbers would
 * cost tens of megabytes for nothing.
 */
interface AnimationPlan {
  key: string
  kind: 'char' | 'monster' | 'missile' | 'overlay'
  /** Package-relative path of the COF, or null when there is none. */
  cof: string | null
  frames: number
  storedDirections: number
  /** In the draw order of the animation's first frame; null where the tree has no art. */
  layers: (LayerPlan | null)[]
  /** `orderRowCount` rows of `layerCount` layer indices, direction-major. */
  orderRows: Uint8Array
  orderRowCount: number
  layerCount: number
  /** Sheet directory under the out root, e.g. `chars/ba/nu/hth`. */
  outPath: string
}

interface Options {
  source: string
  outDir: string
}

/** Counts source files read, for the run's report. */
interface Reads {
  count: number
}

function parseArgs(argv: string[]): Options {
  return {
    source: resolve(argv[2] ?? '/tmp/d2r-all'),
    outDir: resolve(argv[3] ?? join(import.meta.dirname, '../public/original/anim')),
  }
}

/** Every file below `dir`, as `/`-separated paths relative to it. */
function walkFiles(dir: string, out: string[] = [], prefix = ''): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) walkFiles(join(dir, entry.name), out, rel)
    else out.push(rel)
  }
  return out
}

/** Everything below a package-relative directory. */
function packageFiles(source: string, dir: string): string[] {
  return walkFiles(join(source, dir))
}

/** `a/b/c.dcc` -> `c`. */
function basenameOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

/** `a/b/c.dcc` -> `a/b/c`. */
function stemOf(path: string): string {
  const base = basenameOf(path)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? path : `${path.slice(0, path.length - base.length)}${base.slice(0, dot)}`
}

/** `a/b/c.dcc` -> `c`. */
function stemBase(path: string): string {
  const base = basenameOf(path)
  const dot = base.lastIndexOf('.')
  return dot < 0 ? base : base.slice(0, dot)
}

/**
 * Clears a directory this tool owns.
 *
 * Removing the previous export is what makes the result the *minimal* set and
 * the run idempotent. The guard is there so a mistyped out dir cannot delete
 * work this tool did not write.
 */
function prepareOutDir(outDir: string): void {
  if (existsSync(outDir)) {
    const foreign = readdirSync(outDir).filter((entry) => !OWNED_ENTRIES.has(entry))
    if (foreign.length > 0) {
      throw new Error(`refusing to clear ${outDir}: it holds ${foreign.join(', ')}`)
    }
    rmSync(outDir, { recursive: true, force: true })
  }
  mkdirSync(outDir, { recursive: true })
}

/** The `<mode><weapon>` tail that identifies an animation inside a tree. */
function animationTail(file: string): string {
  return stemBase(file).slice(-5)
}

/** Rank of a candidate sprite by equipment variant, lower being preferred. */
function variantRank(file: string): number {
  const at = VARIANT_PREFERENCE.indexOf(stemBase(file).slice(4, 7))
  return at < 0 ? VARIANT_PREFERENCE.length : at
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The best of a ranked candidate list: same weapon class as the best candidate,
 * then the preferred equipment variant, then path order.
 *
 * The list arrives first-ranked, so restricting to the best candidate's
 * `<mode><weapon>` tail keeps the verified weapon preference and only decides
 * between the armour weights that weapon ships in.
 */
function pickCandidate(candidates: readonly string[]): string | null {
  const first = candidates[0]
  if (first === undefined) return null
  const tail = animationTail(first)
  return candidates
    .map((file, index) => ({ file, index }))
    .filter((entry) => animationTail(entry.file) === tail)
    .sort((a, b) => variantRank(a.file) - variantRank(b.file) || a.index - b.index)[0].file
}

/**
 * The stored direction indices to export: 8 of them, evenly spread.
 *
 * An animation storing 8 or fewer keeps all of them, one storing 16 keeps 0, 2,
 * 4 ... 14, one storing 32 keeps every fourth. See the header for why 8.
 */
function exportedDirections(stored: number): number[] {
  if (stored <= PLAYED_DIRECTIONS) return Array.from({ length: stored }, (_, i) => i)
  const stride = Math.round(stored / PLAYED_DIRECTIONS)
  const out: number[] = []
  for (let i = 0; i < stored && out.length < PLAYED_DIRECTIONS; i += stride) out.push(i)
  return out
}

/** Reads and decodes one sprite, counting the read. */
function readSprite(source: string, file: string, reads: Reads): Sprite {
  const bytes = new Uint8Array(readFileSync(join(source, file)))
  reads.count += 1
  const isDc6 = file.toLowerCase().endsWith('.dc6')
  const decoded = isDc6 ? parseDc6(bytes) : parseDcc(bytes)
  return { file, kind: isDc6 ? 'dc6' : 'dcc', frames: decoded.frames }
}

/** A COF's draw order table with its slot ids mapped to indices into `layers`. */
function flattenOrders(cof: CofFile, indices: Map<number, number>): Uint8Array {
  const rows = cof.layerOrders
  const layers = cof.layers.length
  const flat = new Uint8Array(rows.length * layers)
  for (let row = 0; row < rows.length; row += 1) {
    for (let layer = 0; layer < layers; layer += 1) {
      flat[row * layers + layer] = indices.get(rows[row][layer] ?? -1) ?? 0
    }
  }
  return flat
}

/**
 * Which entry of a plan's layer list each of the COF's slot ids is.
 *
 * `cof.layerOrders` holds slot ids, not positions, and a COF's layout is `hd`,
 * `tr`, `lg`, `ra`, `la`, `sh`, `s1`, `s2` — nine layers whose ids skip `lh` and
 * stop short of nine. Reading a row as positions instead of ids draws the wrong
 * sprite, so the table has to be translated once, here.
 */
function slotIndices(cof: CofFile): Map<number, number> {
  return new Map(cof.layers.map((layer, index) => [layer.slot, index]))
}

/**
 * The hero: one weapon class per mode, the whole character tree indexed once.
 *
 * The layer candidates come from `createCharAnimIndex().filesForLayer`, which is
 * the verified ranking — the layer's own weapon class, then `hth`, then the
 * animation's weapon, then any file for that layer and mode. Only the tie
 * between equipment variants is decided here, because the COF records none.
 */
function planHero(source: string, reads: Reads): { plans: AnimationPlan[]; failures: string[] } {
  const plans: AnimationPlan[] = []
  const failures: string[] = []
  for (const classCode of CLASS_CODES) {
    const index = createCharAnimIndex(classCode, packageFiles(source, `${CHARS_DIR}/${classCode}`))
    for (const mode of HERO_MODES) {
      const weapon = HERO_WEAPONS.find((candidate) => index.cofNamesFor(mode, candidate).length > 0)
      if (weapon === undefined) {
        failures.push(`chars/${classCode}/${mode}: no COF for any weapon class`)
        continue
      }
      const name = index.cofNamesFor(mode, weapon)[0]
      const cofPath = `${CHARS_DIR}/${classCode}/cof/${name}.cof`
      const cof = parseCof(new Uint8Array(readFileSync(join(source, cofPath))), name)
      reads.count += 1
      plans.push({
        key: `chars/${classCode}/${mode}/${weapon}`,
        kind: 'char',
        cof: cofPath,
        frames: cof.framesPerDirection,
        storedDirections: cof.directions,
        layers: resolveHeroLayers(index, classCode, cof),
        orderRows: flattenOrders(cof, slotIndices(cof)),
        orderRowCount: cof.layerOrders.length,
        layerCount: cof.layers.length,
        outPath: `chars/${classCode}/${mode}/${weapon}`,
      })
    }
  }
  return { plans, failures }
}

/** The hero's layers in draw order, each resolved to the sprite that draws it. */
function resolveHeroLayers(index: CharAnimIndex, classCode: string, cof: CofFile): (LayerPlan | null)[] {
  const parsed = { mode: cof.name?.slice(2, 4) ?? '', weapon: cof.name?.slice(4, 7) ?? '' }
  const order = cof.layerOrders[0] ?? cof.layers.map((layer) => layer.slot)
  const layers: (LayerPlan | null)[] = []
  for (const slot of order) {
    const layer = cof.layers.find((candidate) => candidate.slot === slot)
    if (layer === undefined) continue
    const chosen = pickCandidate(index.filesForLayer(layer, parsed.mode, parsed.weapon))
    layers.push(
      chosen === null
        ? null
        : { slot: layer.dir, name: layer.name, file: `${CHARS_DIR}/${classCode}/${chosen}` },
    )
  }
  return layers
}

/**
 * Every monster animation, planned without decoding a single sprite.
 *
 * A layer record holds a slot id and a weapon class but no path, and the package
 * stores the sprites one directory per layer named after the *DCC's own* layer
 * code — the directory the file lives in in 16,089 of the 16,089 character
 * names. So the slot id picks the directory through {@link MONSTER_LAYER_SLOTS}
 * and the sprite is the file in it whose name ends in the animation's
 * `<mode><weapon>`; `.dcc` wins over `.dc6`, and the 56 `.dc6` in this tree are
 * the only art `di`, `mp`, `42` and `ty` have for some layers.
 */
function planMonsters(source: string, reads: Reads): { plans: AnimationPlan[]; failures: string[] } {
  const byToken = new Map<string, string[]>()
  for (const file of packageFiles(source, MONSTERS_DIR)) {
    const parts = file.split('/')
    if (parts.length !== 3) continue
    const bucket = byToken.get(parts[0])
    if (bucket) bucket.push(file)
    else byToken.set(parts[0], [file])
  }

  const plans: AnimationPlan[] = []
  const failures: string[] = []
  for (const token of [...byToken.keys()].sort(compare)) {
    const own = byToken.get(token) ?? []
    const cofs = own
      .filter((file) => file.startsWith(`${token}/cof/`) && file.toLowerCase().endsWith('.cof'))
      .sort(compare)
    for (const cofFile of cofs) {
      const name = stemBase(cofFile)
      if (name.length !== 7) {
        failures.push(`monsters/${cofFile}: ${name} is not <token><mode><weapon>`)
        continue
      }
      const mode = name.slice(2, 4)
      const weapon = name.slice(4, 7)
      const cof = parseCof(new Uint8Array(readFileSync(join(source, MONSTERS_DIR, cofFile))), name)
      reads.count += 1
      const layers = cof.layers.map((layer) => {        const dir = MONSTER_LAYER_SLOTS[layer.slot]
        if (dir === undefined) return null
        const inDir = own.filter(
          (file) => file.startsWith(`${token}/${dir}/`) && isSprite(file),
        )
        const chosen = pickCandidate(monsterCandidates(inDir, mode, weapon, layer.name))
        return chosen === null ? null : { slot: dir, name: layer.name, file: `${MONSTERS_DIR}/${chosen}` }
      })
      plans.push({
        key: `monsters/${token}/${mode}/${weapon}`,
        kind: 'monster',
        cof: `${MONSTERS_DIR}/${cofFile}`,
        frames: cof.framesPerDirection,
        storedDirections: cof.directions,
        layers,
        orderRows: flattenOrders(cof, slotIndices(cof)),
        orderRowCount: cof.layerOrders.length,
        layerCount: cof.layers.length,
        outPath: `monsters/${token}/${mode}/${weapon}`,
      })
    }
  }
  return { plans, failures }
}

/** Whether a path names a sprite this tool can decode. */
function isSprite(file: string): boolean {
  const lower = file.toLowerCase()
  return lower.endsWith('.dcc') || lower.endsWith('.dc6')
}

/**
 * The sprites of one monster layer, best first.
 *
 * The pool is every sprite in the layer's directory whose mode matches, ranked
 * the way `charanim.ts` ranks a character layer: the weapon class the COF asks
 * the layer for, then `hth`, then the animation's own weapon class, then anything
 * else. The pool cannot be the animation's exact `<mode><weapon>` tail, because
 * the package does not always store the weapon a COF names — `0add2hs.cof` asks
 * its torso for `2hs` and `0a/tr` only has `0atrlitdd1hs.dcc` — and the character
 * tree resolves 332 of its 7,227 layers the same way. `.dcc` wins over `.dc6`
 * because the 56 `.dc6` in this tree are the classic build's copies.
 */
function monsterCandidates(
  files: readonly string[],
  mode: string,
  weapon: string,
  layerName: string,
): string[] {
  const rank = (file: string): number => {
    const own = stemBase(file).slice(-3)
    if (own === layerName) return 0
    if (own === 'hth') return 1
    if (own === weapon) return 2
    return 3
  }
  return files
    .map((file, index) => ({ file, index }))
    .filter((entry) => stemBase(entry.file).slice(-5, -3) === mode)
    .sort(
      (a, b) =>
        rank(a.file) - rank(b.file) ||
        Number(a.file.toLowerCase().endsWith('.dc6')) - Number(b.file.toLowerCase().endsWith('.dc6')) ||
        variantRank(a.file) - variantRank(b.file) ||
        a.index - b.index,
    )
    .map((entry) => entry.file)
}

/** A missile or an overlay: one sprite, no COF, keyed by its path under the tree. */
function planSingleFile(tree: string, file: string): AnimationPlan {
  const name = tree.slice(tree.lastIndexOf('/') + 1)
  const key = `${name}/${stemOf(file)}`
  return {
    key,
    kind: tree === MISSILES_DIR ? 'missile' : 'overlay',
    cof: null,
    frames: 0,
    storedDirections: 0,
    layers: [{ slot: null, name: null, file: `${tree}/${file}` }],
    orderRows: new Uint8Array([0]),
    orderRowCount: 1,
    layerCount: 1,
    outPath: key,
  }
}

interface Grid {
  columnsPerBand: number
  bands: number
  columnX: number[]
  columnWidth: number[]
  /** One entry per row; row `band * layerCount + layer`. */
  rowY: number[]
  rowHeight: number[]
  width: number
  height: number
}

/**
 * Sizes the grid so that it tiles the sheet exactly.
 *
 * Column `slot` takes the widest frame any layer puts in that slot and row
 * `band * layerCount + layer` the tallest frame that layer puts in that band, so
 * the prefix sums of the widths and the heights are the sheet, with no gap and
 * no overlap. What is left of a cell is transparent padding.
 */
function layoutGrid(cells: readonly (readonly (IndexedFrame | undefined)[])[], layerCount: number): Grid {
  const frames = cells.length
  let columnsPerBand = Math.max(1, frames)
  for (let attempt = 0; attempt < 16 && columnsPerBand > 1; attempt += 1) {
    const width = columnWidths(cells, columnsPerBand).reduce((sum, value) => sum + value, 0)
    if (width <= MAX_SHEET_WIDTH) break
    const bands = Math.ceil(width / MAX_SHEET_WIDTH)
    const next = Math.max(1, Math.ceil(frames / bands))
    columnsPerBand = next < columnsPerBand ? next : columnsPerBand - 1
  }
  const columnWidth = columnWidths(cells, columnsPerBand)
  const bands = Math.max(1, Math.ceil(frames / columnsPerBand))

  const rowHeight: number[] = new Array<number>(bands * layerCount).fill(0)
  for (let frame = 0; frame < frames; frame += 1) {
    const band = Math.floor(frame / columnsPerBand)
    for (let layer = 0; layer < layerCount; layer += 1) {
      const cell = cells[frame][layer]
      if (cell !== undefined && cell.height > rowHeight[band * layerCount + layer]) {
        rowHeight[band * layerCount + layer] = cell.height
      }
    }
  }
  return {
    columnsPerBand,
    bands,
    columnX: prefixSums(columnWidth),
    columnWidth,
    rowY: prefixSums(rowHeight),
    rowHeight,
    width: columnWidth.reduce((sum, value) => sum + value, 0),
    height: rowHeight.reduce((sum, value) => sum + value, 0),
  }
}

/** The widest frame any layer puts in each column slot. */
function columnWidths(
  cells: readonly (readonly (IndexedFrame | undefined)[])[],
  columns: number,
): number[] {
  const widths: number[] = new Array<number>(columns).fill(0)
  for (let frame = 0; frame < cells.length; frame += 1) {
    const slot = frame % columns
    for (const cell of cells[frame]) {
      if (cell !== undefined && cell.width > widths[slot]) widths[slot] = cell.width
    }
  }
  return widths
}

function prefixSums(values: readonly number[]): number[] {
  const out: number[] = []
  let sum = 0
  for (const value of values) {
    out.push(sum)
    sum += value
  }
  return out
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GiB`
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

interface Tally {
  animations: number
  sheets: number
  bytes: number
  /** Sheet pixels, i.e. what is written to a PNG. */
  pixels: number
  /** Pixels that are a frame; the rest of a sheet is transparent padding. */
  artPixels: number
  /** The same frames in every *stored* direction, for the direction choice's cost. */
  storedPixels: number
  cells: number
  emptyCells: number
  unresolvedLayers: number
}

function emptyTally(): Tally {
  return {
    animations: 0,
    sheets: 0,
    bytes: 0,
    pixels: 0,
    artPixels: 0,
    storedPixels: 0,
    cells: 0,
    emptyCells: 0,
    unresolvedLayers: 0,
  }
}

interface DirectionEntry {
  source: number
  sheet: string
  width: number
  height: number
  frames: number
  columnsPerBand: number
  bands: number
  columns: { x: number; width: number }[]
  rows: { y: number; height: number }[]
  drawOrder: number[]
  cells: (number[] | null)[][]
}

interface AnimationEntry {
  kind: AnimationPlan['kind']
  cof: string | null
  frames: number
  storedDirections: number
  layers: { slot: string | null; name: string | null; file: string | null; kind: string | null }[]
  layerOrders: number[][]
  directions: DirectionEntry[]
}

/**
 * The distinct draw orders of an animation, and a lookup from a table row to
 * one of them.
 *
 * The COF's table is direction-major: row `direction * framesPerDirection +
 * frame`. Measured over the 1,716 COFs in both trees that have more than one
 * frame and more than one direction, 71.84% have every run of
 * `framesPerDirection` rows constant while only 60.96% have every run of
 * `directions` rows constant, and in the common shape — `ba`'s 8-frame
 * animations, 275 COFs — 188 are wholly constant in the first sense and none in
 * the second. So the direction is the outer axis.
 */
function collapseOrders(plan: AnimationPlan): { distinct: number[][]; indexOf: (row: number) => number } {
  const distinct: number[][] = []
  const keys = new Map<string, number>()
  const indexOf = (row: number): number => {
    if (row < 0 || row >= plan.orderRowCount) return 0
    const current = Array.from(
      plan.orderRows.subarray(row * plan.layerCount, (row + 1) * plan.layerCount),
    )
    const key = current.join(',')
    const found = keys.get(key)
    if (found !== undefined) return found
    distinct.push(current)
    keys.set(key, distinct.length - 1)
    return distinct.length - 1
  }
  return { distinct, indexOf }
}

/** Writes one direction's sheet and returns its manifest entry. */
async function exportDirection(
  plan: AnimationPlan,
  sprites: readonly (Sprite | null)[],
  stored: number,
  orderIndexOf: (row: number) => number,
  outDir: string,
  palette: Palette,
  tally: Tally,
  failures: string[],
): Promise<DirectionEntry | null> {
  const cells: (IndexedFrame | undefined)[][] = []
  for (let frame = 0; frame < plan.frames; frame += 1) {
    cells.push(sprites.map((sprite) => sprite?.frames[stored]?.[frame]))
  }

  if (!cells.some((row) => row.some((cell) => cell !== undefined))) {
    failures.push(`${plan.key} direction ${stored}: no layer has a frame`)
    return null
  }

  const grid = layoutGrid(cells, plan.layers.length)
  const sheet = new Uint8Array(grid.width * grid.height * 4)

  let artPixels = 0
  for (let frame = 0; frame < plan.frames; frame += 1) {
    const x = grid.columnX[frame % grid.columnsPerBand]
    const band = Math.floor(frame / grid.columnsPerBand)
    for (let layer = 0; layer < plan.layers.length; layer += 1) {
      const cell = cells[frame][layer]
      const sprite = sprites[layer]
      if (cell === undefined || sprite === null) {
        tally.emptyCells += 1
        continue
      }
      tally.cells += 1
      artPixels += cell.width * cell.height
      const y = grid.rowY[band * plan.layers.length + layer]
      const rgba = sprite.kind === 'dc6' ? dc6ToRgba(cell, palette) : dccToRgba(cell, palette)
      for (let row = 0; row < cell.height; row += 1) {
        const from = row * cell.width * 4
        sheet.set(rgba.subarray(from, from + cell.width * 4), ((y + row) * grid.width + x) * 4)
      }
    }
  }

  const sheetPath = `${plan.outPath}/${String(stored).padStart(2, '0')}.png`
  const png = await encodePng(sheet, grid.width, grid.height)
  const to = join(outDir, sheetPath)
  mkdirSync(dirname(to), { recursive: true })
  writeFileSync(to, png)

  tally.sheets += 1
  tally.bytes += png.length
  tally.pixels += grid.width * grid.height
  tally.artPixels += artPixels

  return {
    source: stored,
    sheet: sheetPath,
    width: grid.width,
    height: grid.height,
    frames: plan.frames,
    columnsPerBand: grid.columnsPerBand,
    bands: grid.bands,
    columns: grid.columnWidth.map((width, index) => ({ x: grid.columnX[index], width })),
    rows: grid.rowHeight.map((height, index) => ({ y: grid.rowY[index], height })),
    drawOrder: Array.from({ length: plan.frames }, (_, frame) => orderIndexOf(stored * plan.frames + frame)),
    cells: cells.map((row) =>
      row.map((cell) =>
        cell === undefined ? null : [cell.width, cell.height, cell.offsetX, cell.offsetY],
      ),
    ),
  }
}

/** Decodes an animation's sprites, exports its sheets and returns its manifest entry. */
async function exportAnimation(
  plan: AnimationPlan,
  source: string,
  outDir: string,
  palette: Palette,
  tally: Tally,
  failures: string[],
  reads: Reads,
): Promise<AnimationEntry | null> {
  const sprites: (Sprite | null)[] = []
  for (const layer of plan.layers) {
    if (layer === null) {
      tally.unresolvedLayers += 1
      sprites.push(null)
      continue
    }
    try {
      sprites.push(readSprite(source, layer.file, reads))
    } catch (error) {
      failures.push(`${plan.key}: ${layer.file} failed to decode — ${String(error)}`)
      sprites.push(null)
      tally.unresolvedLayers += 1
    }
  }
  const manifestLayers = plan.layers.map((layer, index) => ({
    slot: layer?.slot ?? null,
    name: layer?.name ?? null,
    file: layer?.file ?? null,
    kind: sprites[index]?.kind ?? null,
  }))
  if (plan.kind === 'missile' || plan.kind === 'overlay') {
    const sprite = sprites[0]
    if (sprite !== null) {
      plan.storedDirections = sprite.frames.length
      plan.frames = sprite.frames.reduce((max, direction) => Math.max(max, direction.length), 0)
    }
  }
  if (sprites.every((sprite) => sprite === null)) {
    failures.push(`${plan.key}: none of its ${plan.layers.length} layers has a sprite in the tree`)
    return null
  }

  const { distinct, indexOf } = collapseOrders(plan)
  const directions: DirectionEntry[] = []
  for (const stored of exportedDirections(plan.storedDirections)) {
    const entry = await exportDirection(plan, sprites, stored, indexOf, outDir, palette, tally, failures)
    if (entry !== null) directions.push(entry)
  }
  if (directions.length === 0) return null
  // What the same sprites declare if every stored direction is kept, for the
  // report of what the 8-heading choice costs.
  for (const sprite of sprites) {
    for (const direction of sprite?.frames ?? []) {
      for (const frame of direction) tally.storedPixels += frame.width * frame.height
    }
  }
  tally.animations += 1
  return {
    kind: plan.kind,
    cof: plan.cof,
    frames: plan.frames,
    storedDirections: plan.storedDirections,
    layers: manifestLayers,
    layerOrders: distinct,
    directions,
  }
}

function bucketOf(entry: AnimationEntry): string {
  if (entry.kind === 'char') return 'chars'
  if (entry.kind === 'monster') return 'monsters'
  return entry.kind === 'missile' ? 'missiles' : 'overlays'
}

async function main(): Promise<void> {
  const started = Date.now()
  const { source, outDir } = parseArgs(process.argv)
  if (!existsSync(join(source, CHARS_DIR))) {
    throw new Error(
      `no animation tree at ${join(source, CHARS_DIR)} — pass the extracted tree as argv[2]`,
    )
  }

  const reads: Reads = { count: 0 }
  const palette = parsePalette(new Uint8Array(readFileSync(join(source, PALETTE_FILE))))
  reads.count += 1

  const failures: string[] = []
  const hero = planHero(source, reads)
  const monsters = planMonsters(source, reads)
  failures.push(...hero.failures, ...monsters.failures)

  const plans: AnimationPlan[] = [...hero.plans, ...monsters.plans]
  for (const tree of [MISSILES_DIR, OVERLAYS_DIR]) {
    for (const file of packageFiles(source, tree)) {
      if (!file.toLowerCase().endsWith('.dcc') && !file.toLowerCase().endsWith('.dc6')) continue
      plans.push(planSingleFile(tree, file))
    }
  }
  plans.sort((a, b) => compare(a.key, b.key))

  prepareOutDir(outDir)
  const tallies = new Map<string, Tally>([
    ['chars', emptyTally()],
    ['monsters', emptyTally()],
    ['missiles', emptyTally()],
    ['overlays', emptyTally()],
  ])
  const manifest: Record<string, AnimationEntry> = {}
  const heroWeapons: Record<string, string> = {}
  for (const plan of plans) {
    if (plan.kind === 'char') {
      const at = plan.key.lastIndexOf('/')
      heroWeapons[plan.key.slice(0, at)] = plan.key.slice(at + 1)
    }
    const bucket = plan.kind === 'char' ? 'chars' : plan.kind === 'monster' ? 'monsters' : plan.kind === 'missile' ? 'missiles' : 'overlays'
    const tally = tallies.get(bucket)
    if (tally === undefined) continue
    const entry = await exportAnimation(plan, source, outDir, palette, tally, failures, reads)
    if (entry !== null) manifest[plan.key] = entry
  }

  writeFileSync(
    join(outDir, 'index.json'),
    `${JSON.stringify({
      note:
        'Animation sheets for the ARPG slice, decoded from an extracted copy of the game. One PNG ' +
        'per (animation, direction). A sheet is a grid: column j spans columns[j] and holds the ' +
        'frames whose slot is j (frame % columnsPerBand), row r spans rows[r] and is band ' +
        'floor(r / layers.length) of layer r % layers.length. A frame is drawn at the top left of ' +
        'its cell with its own width and height, and its anchor is offsetX/offsetY with offsetY ' +
        'the frame bottom row, the DCC and DC6 convention. A cell is [width, height, offsetX, ' +
        'offsetY], or null where the layer has no art for that frame, and cells[frame][layer] ' +
        'parallels layers[]. drawOrder[frame] indexes layerOrders, whose entries are indices into ' +
        'layers in draw order, back to front.',
      palette: PALETTE_FILE,
      playedDirections: PLAYED_DIRECTIONS,
      directionRule:
        'An animation storing more than 8 directions is subsampled to 8 taken every stored/8-th ' +
        'from direction 0. Each direction records the stored index it holds as `source`.',
      heroWeapons,
      animations: manifest,
    })}\n`,
  )

  const indexBytes = statSync(join(outDir, 'index.json')).size
  let sheets = 0
  let artBytes = 0
  let pixels = 0
  let artPixels = 0
  let storedPixels = 0
  let cells = 0
  let emptyCells = 0
  let unresolved = 0
  const entries = Object.entries(manifest)
  for (const tally of tallies.values()) {
    sheets += tally.sheets
    artBytes += tally.bytes
    pixels += tally.pixels
    artPixels += tally.artPixels
    storedPixels += tally.storedPixels
    cells += tally.cells
    emptyCells += tally.emptyCells
    unresolved += tally.unresolvedLayers
  }

  console.log(`animations: ${formatCount(entries.length)} exported`)
  for (const [name, tally] of tallies) {
    const grouped = entries.filter(([, entry]) => bucketOf(entry) === name)
    const unresolved = grouped.reduce(
      (sum, [, entry]) => sum + entry.layers.filter((l) => l.file === null).length,
      0,
    )
    console.log(
      `  ${name.padEnd(9)} ${formatCount(tally.animations).padStart(5)} animations  ` +
        `${formatCount(tally.sheets).padStart(5)} sheets  ${formatBytes(tally.bytes).padStart(9)}  ` +
        `${formatCount(tally.pixels).padStart(13)} sheet px  ` +
        `${((tally.artPixels / Math.max(1, tally.pixels)) * 100).toFixed(1)}% of them art  ` +
        `${unresolved} layers with no art  ` +
        `directions cost ${formatCount(tally.storedPixels)} px stored vs ${formatCount(tally.artPixels)} px exported`,
    )
  }
  console.log(
    `sheets:     ${formatCount(sheets)} PNG, ${formatBytes(artBytes)} (${(artBytes / Math.max(1, pixels)).toFixed(3)} bytes per sheet pixel)`,
  )
  console.log(
    `directions: ${PLAYED_DIRECTIONS} played of the stored set; every stored direction would have been ` +
      `${(storedPixels / Math.max(1, artPixels)).toFixed(3)}x the frame pixels and about the same in bytes`,
  )
  console.log(
    `cells:      ${formatCount(cells)} drawn, ${formatCount(emptyCells)} empty (a layer with no frame there); ` +
      `${formatCount(pixels - artPixels)} sheet px are transparent padding`,
  )
  console.log(
    `manifest:   index.json ${formatBytes(indexBytes)}; sheets + manifest ${formatBytes(indexBytes + artBytes)}`,
  )
  console.log(`files read: ${formatCount(reads.count)}  unresolved layers: ${formatCount(unresolved)}`)
  if (failures.length > 0) {
    console.log(`failures:   ${formatCount(failures.length)}`)
    for (const failure of failures.slice(0, 20)) console.log(`  ${failure}`)
  }
  console.log(`elapsed:    ${((Date.now() - started) / 1000).toFixed(1)} s -> ${outDir}`)
}

void main()
