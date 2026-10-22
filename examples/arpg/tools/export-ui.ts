/**
 * Copies the UI art and the layout JSON that the layouts actually name out of the
 * game tree.
 *
 * The interface is data-driven: `global/ui/layouts/**\/*.json` describe every screen
 * as a tree of widgets, and a widget names its art as a package path with no
 * extension. Reading the layouts is the only way to know which of the 1,516 sprites
 * under `hd/global/ui/` (261 MB) and 520 classic `.dc6`s under `global/ui/` a session
 * can reach, so this tool copies exactly the referenced subset and nothing else.
 * Measured on the retail tree: 509 of the 1,516 HD sprites (124,949,384 bytes) — 47% of
 * that tree — plus 119 classic `.dc6` (10,528,411 bytes) and `pal.dat`.
 *
 * Both halves are needed. 119 of the layouts' references have no HD file at all: those
 * are the screens Resurrected never re-drew — the classic bank, trade, automap and
 * horadric-cube panels, the quest icons the HD build keeps under `questicons/`, and
 * every name the classic layouts use. Copying only `hd/global/ui` leaves them with no art
 * and a third of the interface blank.
 *
 * The output mirrors the package, so every copied file keeps the path it has inside
 * the package and the manifest needs no other rule:
 *
 *   <out>/global/ui/layouts/<name>.json              every layout, HD and classic
 *   <out>/global/ui/layouts/controller/<name>.json
 *   <out>/hd/global/ui/**\/*.json                    the 13 data files in the same tree
 *   <out>/hd/global/ui/<dir>/<name>.sprite           referenced HD atlases only
 *   <out>/global/ui/<dir>/<name>.dc6                 referenced classic atlases only
 *   <out>/global/palette/act1/pal.dat                the 256-entry classic palette
 *   <out>/index.json                                 name → file for both kinds
 *
 * On-disk spelling is lower-case while the layouts are not: the package stores
 * `hd/global/ui/panel/hud_02/front_panel.sprite`, and the layout that draws it says
 * `PANEL/HUD_02/front_panel`. The layouts are authored case-insensitively, mix `/`
 * with `\`, and occasionally double a separator (`SplashScreen//splash_BlizzLogo`).
 * The copy therefore keeps the on-disk spelling and the normalization both sides
 * agree on lives in one place: `atlasFileFor` in `src/d2/ui/atlas.ts`.
 *
 * Which references are copied is decided by the filesystem, not by a list of field
 * names: any string a widget's `fields` object holds is a candidate, and a candidate
 * is kept only when `<hd root>/<name>.sprite` exists. That is not laziness — 92 of the
 * 509 atlases are named by nothing but a field other than `filename`
 * (`focusIndicatorFilename` alone names 54 controller hover images, and
 * `gemSocketFilename`, `barFilepath`, `basePath`, `LeftSideSprite` and friends name
 * the rest), while 1,574 of the 2,207 distinct string values in the layouts are text,
 * `.json` table paths or argument strings that are not art at all.
 *
 * The 5 art references this build cannot satisfy at all are left alone and reported,
 * not guessed at: `PANEL\Modals\Modal_Button`, `frontendbuttonlarge`,
 * `hireling_selector`, and the two `partygroupborder_%dslots` names, which are templates
 * the game substitutes a player count into. `tools/verify-ui-atlas.ts` lists every one.
 *
 * Usage:
 *   tsx examples/arpg/tools/export-ui.ts [<romfs dir, default /tmp/d2r-all>] [<out dir>]
 *
 * Reads the game tree and writes only under the out dir, which is git-ignored
 * (`examples/arpg/public/original/`): the game's assets are not redistributable and
 * this script is the reproducible way to rebuild them from a copy the user owns.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** Where the layouts live, package-relative. */
const LAYOUTS_DIR = 'global/ui/layouts'
/** The HD sprite tree, package-relative; also the base `atlasFileFor` appends to. */
const HD_ROOT = 'hd/global/ui'
/** The classic tree, which is where `.dc6` art lives. */
const CLASSIC_ROOT = 'global/ui'
/** The palette every classic UI `.dc6` is indexed against; ships with the classic art. */
const PALETTE_FILE = 'global/palette/act1/pal.dat'
/** A widget field whose value can be a path to art: `filename`, `barFilepath`, `basePath`, … */
const ART_FIELD = /filename$|filepath$|^basepath$|^overlaypath$|sprite$/i

/** Directories this tool writes at the out root; anything else there is not ours. */
const OWNED_ENTRIES = new Set(['index.json', 'global', 'hd'])

interface Options {
  source: string
  outDir: string
}

function parseArgs(argv: string[]): Options {
  return {
    source: resolve(argv[2] ?? '/tmp/d2r-all'),
    outDir: resolve(argv[3] ?? join(import.meta.dirname, '../public/original/ui')),
  }
}

/**
 * A widget field name as a package path.
 *
 * The five steps are the whole rule, and both the exporter and the browser side
 * implement exactly these: `\` → `/`, collapse repeated `/`, drop a leading `/`,
 * lower-case, and (at the call site, because layouts never write it) append
 * `.sprite`. The spellings below are all real values from the retail layouts:
 *
 *   PANEL/HUD_02/front_panel                 PANEL\buysell
 *   FrontEnd/HD/Final/FrontEnd_LeftPanel     FrontEnd\HD\Final\FrontEnd_ButtonMed
 *   SplashScreen//splash_BlizzLogo            PANEL/TooltipBorder/TooltipBorder
 */
function normalizeName(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').toLowerCase()
}

/** The HD file a normalized name refers to. */
function atlasPath(name: string): string {
  return `${HD_ROOT}/${name}.sprite`
}

/**
 * The classic file a normalized name refers to.
 *
 * The classic tree spells paths the same way and lower-case, so the five-step
 * normalization is the whole rule for both halves: `PANEL\bank` is
 * `global/ui/panel/bank.dc6`, next to the `global/ui/panel/bank.dc6` the layouts of the
 * classic build name. Shipping these is what lets the loader answer the 119 references
 * Resurrected never re-drew in HD.
 */
function classicPath(name: string): string {
  return `${CLASSIC_ROOT}/${name}.dc6`
}

/** One `.sprite` reference the layouts make. */
interface Reference {
  /** Normalized package path without extension, `atlasFileFor`'s input. */
  name: string
  /** Fields that named it — `filename` for most, `focusIndicatorFilename` for 54. */
  keys: Set<string>
  /** Layouts that name it, package-relative. */
  layouts: Set<string>
}

/**
 * Reads one layout file.
 *
 * Layouts are JSONC — `bankoriginallayout.json` writes inline `//` comments and
 * ends a list with a trailing comma — and two of the 329 (`koreacompliancemessagemodal*`)
 * start with a UTF-8 BOM, which `JSON.parse` rejects outright. Both are cleaned up
 * here rather than worked around at each use.
 */
function parseLayout(text: string): unknown {
  return JSON.parse(stripComments(text.replace(/^\uFEFF/, '')).replace(/,\s*([}\]])/g, '$1'))
}

/** Removes `//` and block comments without touching the inside of a string. */
function stripComments(text: string): string {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      out += char
      if (char === '\\') {
        out += text[i + 1] ?? ''
        i++
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (char === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
      continue
    }
    out += char
  }
  return out
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

/** Total bytes of the files under a directory. */
function directorySize(dir: string): number {
  return walkFiles(dir).reduce((sum, rel) => sum + statSync(join(dir, rel)).size, 0)
}

/**
 * The basenames under a tree, used only to explain an unresolved reference.
 *
 * `MENU\a5q1` is art even though no `.sprite` is there — this build keeps the quest
 * icons in `hd/global/ui/questicons/` — and `PANEL\buysell` is art this build ships
 * only as a `.dc6`. Telling those apart from `@strgamecredits` is the difference
 * between a real gap in the export and a string that was never a path.
 */
function indexBasenames(sourceRoot: string, treeRoot: string, extension: string): Set<string> {
  const index = new Set<string>()
  for (const rel of walkFiles(join(sourceRoot, treeRoot))) {
    if (!rel.toLowerCase().endsWith(extension)) continue
    index.add(rel.slice(rel.lastIndexOf('/') + 1, rel.length - extension.length))
  }
  return index
}

/**
 * Collects every art reference in a layout tree.
 *
 * Only the immediate scalar strings of a widget's `fields` object are candidates:
 * nested objects there (`rect`, `style`, `player/rightHand`) hold geometry and
 * argument strings, and a `text` field can hold a URL that has nothing to do with
 * art. Candidates are filtered by existence by the caller.
 */
function collectReferences(doc: unknown, layout: string, out: Map<string, Reference>): void {
  if (Array.isArray(doc)) {
    for (const item of doc) collectReferences(item, layout, out)
    return
  }
  if (!doc || typeof doc !== 'object') return
  const record = doc as Record<string, unknown>
  const fields = record.fields
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (typeof value !== 'string' || value === '') continue
      const name = normalizeName(value)
      if (name === '') continue
      const reference = out.get(name) ?? { name, keys: new Set(), layouts: new Set() }
      reference.keys.add(key)
      reference.layouts.add(layout)
      out.set(name, reference)
    }
  }
  for (const value of Object.values(record)) collectReferences(value, layout, out)
}

/**
 * Clears a directory this tool owns.
 *
 * Removing the previous export is what makes the output the *minimal* set: art that
 * a layout used to name would otherwise linger and quietly bloat the tree. The guard
 * is there so a mistyped out dir cannot delete work this tool did not write.
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

/** Copies one package-relative file under the out dir, creating directories. */
function copyInto(source: string, outDir: string, rel: string): number {
  const from = join(source, rel)
  const to = join(outDir, rel)
  mkdirSync(dirname(to), { recursive: true })
  copyFileSync(from, to)
  return statSync(from).size
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

function main(): void {
  const { source, outDir } = parseArgs(process.argv)
  const layoutsRoot = join(source, LAYOUTS_DIR)
  if (!existsSync(layoutsRoot)) {
    throw new Error(`no layouts at ${layoutsRoot} — pass the extracted tree as argv[2]`)
  }

  const references = new Map<string, Reference>()
  const layouts = walkFiles(layoutsRoot).filter((rel) => rel.toLowerCase().endsWith('.json'))
  const unparsable: string[] = []
  for (const rel of layouts.sort()) {
    try {
      collectReferences(parseLayout(readFileSync(join(layoutsRoot, rel), 'utf8')), rel, references)
    } catch (error) {
      unparsable.push(`${rel}: ${String(error)}`)
    }
  }

  // The filesystem decides, in the same order the loader tries: HD art at
  // `hd/global/ui/<name>.sprite`, then classic art at `global/ui/<name>.dc6`.
  const present = new Map<string, { path: string; bytes: number; classic: boolean }>()
  const missing: Reference[] = []
  for (const reference of references.values()) {
    const sprite = atlasPath(reference.name)
    const classic = classicPath(reference.name)
    if (existsSync(join(source, sprite))) {
      present.set(reference.name, { path: sprite, bytes: statSync(join(source, sprite)).size, classic: false })
    } else if (existsSync(join(source, classic))) {
      present.set(reference.name, { path: classic, bytes: statSync(join(source, classic)).size, classic: true })
    } else {
      missing.push(reference)
    }
  }

  prepareOutDir(outDir)

  let spriteBytes = 0
  let classicBytes = 0
  let classicCount = 0
  const perDirectory = new Map<string, { count: number; bytes: number }>()
  for (const [name, entry] of [...present].sort((a, b) => a[0].localeCompare(b[0]))) {
    copyInto(source, outDir, entry.path)
    const bytes = entry.bytes
    if (entry.classic) {
      classicBytes += bytes
      classicCount++
      continue
    }
    spriteBytes += bytes
    const top = name.split('/')[0]
    const bucket = perDirectory.get(top) ?? { count: 0, bytes: 0 }
    bucket.count++
    bucket.bytes += bytes
    perDirectory.set(top, bucket)
  }
  // Classic art is indexed, so the shared 256-entry palette has to travel with it:
  // `frameToRgba` needs it and there is no palette inside a `.dc6`.
  const paletteBytes = copyInto(source, outDir, PALETTE_FILE)

  // Every layout ships, including the classic ones: they are 2.5 MiB of text and the
  // manifest is only useful if a caller can look up any screen the package has.
  let layoutBytes = 0
  for (const rel of layouts) layoutBytes += copyInto(source, outDir, `${LAYOUTS_DIR}/${rel}`)
  const hdJson = walkFiles(join(source, HD_ROOT)).filter((rel) => rel.toLowerCase().endsWith('.json'))
  for (const rel of hdJson) copyInto(source, outDir, `${HD_ROOT}/${rel}`)

  const layoutManifest: Record<string, string> = {}
  for (const rel of layouts) {
    layoutManifest[rel.replace(/\.json$/i, '')] = `${LAYOUTS_DIR}/${rel}`
  }
  const atlasManifest: Record<string, string> = {}
  for (const name of [...present.keys()].sort()) atlasManifest[name] = present.get(name)!.path

  writeFileSync(
    join(outDir, 'index.json'),
    `${JSON.stringify(
      {
        note:
          'Atlas keys are normalized the way atlasFileFor() normalizes a layout filename: ' +
          "'\\' -> '/', collapse repeated '/', drop a leading '/', lower-case. The value is the " +
          "package path, which is lower-case on disk because the package stores it that way and " +
          'the layouts name it in their own mixed-case spelling. Values ending .sprite are HD ' +
          'SpA1 art, values ending .dc6 are classic indexed art decoded through `palette`.',
        palette: PALETTE_FILE,
        layouts: layoutManifest,
        atlases: atlasManifest,
      },
      null,
      2,
    )}\n`,
  )

  const allDirs = readdirSync(join(source, HD_ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const skipped = allDirs
    .filter((dir) => !perDirectory.has(dir))
    .sort()
    .map((dir) => `${dir} (${formatBytes(directorySize(join(source, HD_ROOT, dir)))})`)

  const otherKeyed = [...present.keys()].filter((name) =>
    [...(references.get(name)?.keys ?? [])].every((key) => key.toLowerCase() !== 'filename'),
  )

  const spriteFiles = walkFiles(join(source, HD_ROOT)).filter((rel) => rel.toLowerCase().endsWith('.sprite'))
  const spriteBasenames = indexBasenames(source, HD_ROOT, '.sprite')
  const dc6Basenames = indexBasenames(source, CLASSIC_ROOT, '.dc6')
  const basenameOf = (name: string): string => name.slice(name.lastIndexOf('/') + 1)
  // Whether an unresolved field value is art at all; the same rule
  // `tools/verify-ui-atlas.ts` applies, so the two tools count the same references. A
  // value with no separator is a widget or panel name (`defaultWidget: "ScrollBar"`,
  // `panelmanager:openpanel:character`), one whose last segment carries an extension is
  // a table or text file, and otherwise the value is art when a field that names art
  // wrote it or when art with that basename ships somewhere in the package.
  const shipped = missing.filter((reference) => {
    if (!reference.name.includes('/')) return false
    if (basenameOf(reference.name).includes('.')) return false
    if ([...reference.keys].some((key) => ART_FIELD.test(key))) return true
    return (
      spriteBasenames.has(basenameOf(reference.name)) ||
      dc6Basenames.has(basenameOf(reference.name))
    )
  })
  const elsewhere = shipped.filter((reference) => spriteBasenames.has(basenameOf(reference.name)))

  console.log(`layouts:    ${layouts.length} copied (${formatBytes(layoutBytes)}), ${unparsable.length} unparsable`)
  console.log(
    `hd:         ${present.size - classicCount} sprites copied (${formatBytes(spriteBytes)}) of ${spriteFiles.length} ` +
      `files under ${HD_ROOT} (${formatBytes(directorySize(join(source, HD_ROOT)))}); ${otherKeyed.length} of them are ` +
      'named by a field other than `filename`',
  )
  console.log(
    `classic:    ${classicCount} .dc6 copied (${formatBytes(classicBytes)}) plus the palette ` +
      `(${formatBytes(paletteBytes)}); without these the classic panels would have no art at all`,
  )
  console.log(`manifest:   ${outDir}/index.json (${Object.keys(layoutManifest).length} layouts, ${Object.keys(atlasManifest).length} atlases)`)
  console.log('by directory:')
  for (const [dir, bucket] of [...perDirectory].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${dir.padEnd(16)} ${String(bucket.count).padStart(4)} sprites  ${formatBytes(bucket.bytes)}`)
  }
  console.log(`not referenced, not copied: ${skipped.join(', ')}`)
  if (missing.length > 0) {
    console.log(
      `unresolved: ${shipped.length} art references have neither a .sprite nor a .dc6 at this path` +
        `${shipped.length === elsewhere.length ? ' — all of them have a basename that ships as a sprite, so ' +
          'the loader basename fallback can serve them' : ` — ${shipped.length - elsewhere.length} of them have ` +
          'no art of that name anywhere'} — the other ${missing.length - shipped.length} of the ` +
        `${references.size} field values are not art; \`tsx tools/verify-ui-atlas.ts\` lists every one`,
    )
  }
  for (const failure of unparsable) console.warn(`unparsable layout: ${failure}`)
}

main()
