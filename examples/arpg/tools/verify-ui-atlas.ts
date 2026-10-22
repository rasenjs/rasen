/**
 * Checks every layout in the tree against the art tree it names, for the loader in
 * `src/d2/ui/atlas.ts` and the export in `tools/export-ui.ts`.
 *
 * The claim those two rest on is that a layout's `filename` can be turned into a file
 * with five string operations and no guessing. That is a claim about 329 layout files
 * and 1,516 HD sprites and 520 classic `.dc6`s, so it is checked over all of them rather
 * than a sample, and the answer is reported as it is found: art a layout names but this
 * build does not ship is a failure, counted and listed, not averaged into a percentage
 * that hides it.
 *
 * Per referenced name, in the order the loader tries:
 *
 * - it resolves to a `.sprite` under `hd/global/ui/`, or else to a `.dc6` under
 *   `global/ui/`, after the normalization (`\` → `/`, collapsed repeats, dropped leading
 *   `/`, lower-case, extension appended);
 * - failing both, the lower-cased basename is looked up in `index.json`'s atlas map, and
 *   only a single match may be used;
 * - the file decodes — `parseSprite` for HD art, `parseDc6` plus the classic palette for
 *   `.dc6`;
 * - when the layout states `frames`/`rows`, that grid agrees with the art (for a `.dc6`,
 *   with how many frames the file actually holds).
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-ui-atlas.ts [<romfs dir, default /tmp/d2r-all>]
 *
 * Needs an extracted copy of the game, which the repository does not carry. Reads only.
 * Exits 1 when any reference fails to resolve or decode.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseDc6, frameToRgba, type Dc6File } from '../src/d2/dc6'
import { parsePalette, type Palette } from '../src/d2/tileart'
import { parseSprite } from '../src/original/sprite'

const LAYOUTS_DIR = 'global/ui/layouts'
const HD_ROOT = 'hd/global/ui'
/** The classic tree, which is where `.dc6` art lives. */
const CLASSIC_ROOT = 'global/ui'
/** The palette every classic UI `.dc6` is indexed against. */
const PALETTE_FILE = 'global/palette/act1/pal.dat'

/**
 * Where the layouts and the atlases are read from.
 *
 * Two roots, both accepted, because the tool is useful in two situations and the
 * difference matters:
 *
 * - **The extracted game tree** (`/tmp/d2r-all`, or argv[1]). This is the authority:
 *   it holds the layouts *and* the art exactly as the package ships them, so the
 *   percentage it reports is a statement about the game.
 * - **The export** (`public/original`, the default when the tree is absent). The
 *   layouts and the atlases the export copied both live there, so the tool still
 *   answers "does every art reference the layouts make resolve to something this
 *   repository can serve" — which is the question that decides whether the interface
 *   draws. It cannot answer the stricter question, because the export only contains
 *   what was referenced.
 *
 * The tool prints which root it used, so a percentage is never read without knowing
 * which question it answered.
 */
function pickRoot(): { root: string; fromTree: boolean } {
  const given = process.argv[2]
  if (given !== undefined) return { root: resolve(given), fromTree: true }
  const tree = '/tmp/d2r-all'
  if (existsSync(join(tree, LAYOUTS_DIR))) return { root: tree, fromTree: true }
  // The export mirrors the package under `ui/`, so `original/ui` is the root whose
  // `global/ui/layouts` and `hd/global/ui` line up with the game tree's.
  return { root: resolve(import.meta.dirname, '../public/original/ui'), fromTree: false }
}

const picked = pickRoot()
const root = picked.root

/** A widget field whose value can be a path to art: `filename`, `barFilepath`, `basePath`, … */
const ART_FIELD = /filename$|filepath$|^basepath$|^overlaypath$|sprite$/i

/** Screens the renderer must be able to draw; named here so a silent 0% is visible. */
const NAMED_SCREENS = [
  'mainmenubuttonribbonhd.json',
  'characterselectpanelhd.json',
  'npcdialogpanelhd.json',
  'titlescreenpanelhd.json',
  'hudpanelhd.json',
  'controller/hudpanelhd.json',
]

function atlasPath(name: string): string {
  return `${HD_ROOT}/${name}.sprite`
}

function classicPath(name: string): string {
  return `${CLASSIC_ROOT}/${name}.dc6`
}

function normalizeName(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').toLowerCase()
}

function basenameOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

/**
 * Reads one layout file.
 *
 * JSONC, like the exporter: `//` comments and trailing commas are used throughout, and
 * `koreacompliancemessagemodal*.json` carries a UTF-8 BOM that `JSON.parse` rejects. This
 * is deliberately a second copy of the exporter's reader — a tool checking another tool's
 * rule should not share its code path — and a layout this cannot read is itself reported
 * rather than skipped.
 */
function parseLayout(text: string): unknown {
  return JSON.parse(stripComments(text.replace(/^\uFEFF/, '')).replace(/,\s*([}\]])/g, '$1'))
}

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

interface Reference {
  name: string
  keys: Set<string>
  /** Layouts that name it, `/`-separated relative to the layouts root. */
  layouts: Set<string>
}

/** A `frames`/`rows` pair a widget states next to a `filename`. */
interface GridStatement {
  name: string
  frames: number | undefined
  rows: number | undefined
  layout: string
}

/**
 * Walks a layout tree, collecting art references and the grids stated with them.
 *
 * Every scalar string of a widget's `fields` object is a candidate, because 123 of the
 * sheets are named by a field other than `filename`; existence decides which candidates
 * are art. `frames`/`rows` are read from the same object, which is where a widget states
 * the grid of the sheet it names.
 */
function collect(
  doc: unknown,
  layout: string,
  references: Map<string, Reference>,
  grids: GridStatement[],
): void {
  if (Array.isArray(doc)) {
    for (const item of doc) collect(item, layout, references, grids)
    return
  }
  if (!doc || typeof doc !== 'object') return
  const record = doc as Record<string, unknown>
  const fields = record.fields
  if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
    const widget = fields as Record<string, unknown>
    let named: string | undefined
    if (typeof widget.filename === 'string') named = normalizeName(widget.filename)
    const frames = typeof widget.frames === 'number' ? widget.frames : undefined
    const rows = typeof widget.rows === 'number' ? widget.rows : undefined
    if (named && (frames !== undefined || rows !== undefined)) {
      grids.push({ name: named, frames, rows, layout })
    }
    for (const [key, value] of Object.entries(widget)) {
      if (typeof value !== 'string' || value === '') continue
      const name = normalizeName(value)
      if (name === '') continue
      const reference = references.get(name) ?? { name, keys: new Set(), layouts: new Set() }
      reference.keys.add(key)
      reference.layouts.add(layout)
      references.set(name, reference)
    }
  }
  for (const value of Object.values(record)) collect(value, layout, references, grids)
}

/**
 * Every basename under a tree, so art that ships at another path can be told apart from a
 * string that was never a path at all: the classic layouts name `MENU` + backslash +
 * `a5q1`, which is a `.dc6` there *and* a `.sprite` under `questicons/`.
 */
function indexBasenames(treeRoot: string, extension: string): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const rel of walkFiles(join(root, treeRoot))) {
    if (!rel.toLowerCase().endsWith(extension)) continue
    const basename = basenameOf(rel.slice(0, -extension.length))
    index.set(basename, [...(index.get(basename) ?? []), `${treeRoot}/${rel}`])
  }
  return index
}

/** What one referenced name resolved to, and what the file behind it says. */
interface Sheet {
  path: string
  kind: 'hd' | 'classic'
  bytes: number
  width: number
  height: number
  /** `.sprite` header version, or the `.dc6` version. */
  version: number | null
  /** Only for classic art: how many frames direction 0 holds, and their sizes. */
  frameCount: number
  squares: string
  error?: string
}

function percent(part: number, total: number): string {
  return total === 0 ? 'n/a' : `${((part / total) * 100).toFixed(1)}%`
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1048576).toFixed(1)} MiB`
}

/** The atlas's own directory, i.e. the first path segment of the normalized name. */
function atlasDirectory(name: string): string {
  const slash = name.indexOf('/')
  return slash === -1 ? '(root)' : name.slice(0, slash)
}

function layoutDirectory(layout: string): string {
  const slash = layout.lastIndexOf('/')
  return slash === -1 ? LAYOUTS_DIR : `${LAYOUTS_DIR}/${layout.slice(0, slash)}`
}

interface Table {
  resolved: number
  total: number
}

function tally(table: Map<string, Table>, key: string, resolved: boolean): void {
  const entry = table.get(key) ?? { resolved: 0, total: 0 }
  entry.total++
  if (resolved) entry.resolved++
  table.set(key, entry)
}

function printTable(title: string, table: Map<string, Table>): void {
  console.log(`\n${title}`)
  const rows = [...table].sort((a, b) => a[0].localeCompare(b[0]))
  const width = Math.max(...rows.map(([key]) => key.length))
  for (const [key, entry] of rows) {
    const unresolved = entry.total - entry.resolved
    console.log(
      `  ${key.padEnd(width)}  ${String(entry.resolved).padStart(4)}/${String(entry.total).padEnd(4)}` +
        ` ${percent(entry.resolved, entry.total).padStart(6)}  ${unresolved === 0 ? '' : `${unresolved} unresolved`}`,
    )
  }
}

function main(): void {
  console.log(
    picked.fromTree
      ? `verify-ui-atlas: reading the extracted game tree at ${root}`
      : `verify-ui-atlas: reading the export at ${root} (the stricter question needs the game tree as argv[1])`,
  )
  const layoutsRoot = join(root, LAYOUTS_DIR)
  if (!existsSync(layoutsRoot)) {
    throw new Error(`no layouts at ${layoutsRoot} — pass the extracted tree as argv[1]`)
  }

  const layoutFiles = walkFiles(layoutsRoot)
    .filter((rel) => rel.toLowerCase().endsWith('.json'))
    .sort()
  const references = new Map<string, Reference>()
  const grids: GridStatement[] = []
  const unparsable: string[] = []
  for (const rel of layoutFiles) {
    try {
      collect(parseLayout(readFileSync(join(layoutsRoot, rel), 'utf8')), rel, references, grids)
    } catch (error) {
      unparsable.push(`${rel}: ${String(error)}`)
    }
  }

  const palettePath = join(root, PALETTE_FILE)
  const palette: Palette | null = existsSync(palettePath)
    ? parsePalette(new Uint8Array(readFileSync(palettePath)))
    : null

  // Resolution, in the loader's order: HD path, then classic path. What the two together
  // find is exactly the map `index.json` carries, which is what the basename fallback
  // searches — so the fallback can be simulated without running the export.
  const sheets = new Map<string, Sheet>()
  for (const name of references.keys()) {
    const hd = join(root, atlasPath(name))
    const classic = join(root, classicPath(name))
    const fromHd = existsSync(hd)
    if (!fromHd && !existsSync(classic)) continue
    const path = fromHd ? atlasPath(name) : classicPath(name)
    const bytes = statSync(join(root, path)).size
    if (fromHd) {
      try {
        const sprite = parseSprite(new Uint8Array(readFileSync(hd)))
        sheets.set(name, {
          path,
          kind: 'hd',
          bytes,
          width: sprite.width,
          height: sprite.height,
          version: sprite.version,
          frameCount: 0,
          squares: '',
        })
      } catch (error) {
        sheets.set(name, {
          path,
          kind: 'hd',
          bytes,
          width: 0,
          height: 0,
          version: headerVersion(readFileSync(hd)),
          frameCount: 0,
          squares: '',
          error: String(error),
        })
      }
      continue
    }
    try {
      const dc6: Dc6File = parseDc6(new Uint8Array(readFileSync(classic)))
      const frames = dc6.frames[0] ?? []
      // The palette is half of the decoder, so a classic sheet is only "decoded" if its
      // first frame actually survives `frameToRgba` through `pal.dat`.
      if (palette && frames.length > 0) frameToRgba(frames[0], palette)
      sheets.set(name, {
        path,
        kind: 'classic',
        bytes,
        width: frames.length > 0 ? Math.max(...frames.map((frame) => frame.width)) : 0,
        height: frames.length > 0 ? Math.max(...frames.map((frame) => frame.height)) : 0,
        version: dc6.version,
        frameCount: frames.length,
        squares: `${dc6.directions}x${dc6.framesPerDirection}`,
      })
    } catch (error) {
      sheets.set(name, {
        path,
        kind: 'classic',
        bytes,
        width: 0,
        height: 0,
        version: null,
        frameCount: 0,
        squares: '',
        error: String(error),
      })
    }
  }

  const resolves = (name: string): boolean => sheets.has(name)
  const decodes = (name: string): boolean => sheets.get(name) !== undefined && !sheets.get(name)?.error
  const spriteIndex = indexBasenames(HD_ROOT, '.sprite')
  const dc6Index = indexBasenames(CLASSIC_ROOT, '.dc6')
  /** Some file in the package carries this basename, even if not at the path the rule gives. */
  const basenameShipped = (name: string): boolean =>
    spriteIndex.has(basenameOf(name)) || dc6Index.has(basenameOf(name))

  /**
   * Whether a field value is an atlas reference at all. Four rules decide it:
   *
   * - a file at the path the rule gives is art by definition;
   * - a value with no separator is not a path: `defaultWidget` and `scrollControllerName`
   *   hold widget names (`"ScrollBar"`) and panels are addressed as
   *   `panelmanager:openpanel:character`, neither of which is art even when a `.dc6`
   *   somewhere carries that basename;
   * - a value whose last segment carries an extension is a `.json` table, an `.ibls`
   *   environment map or `CreditsROTW.txt`, and layouts never write an extension on the
   *   art they name;
   * - otherwise it is art when a widget field that names art wrote it (`filename` and its
   *   `*Filepath` / `*Filename` / `basePath` / `*Sprite` siblings), or when art with that
   *   basename ships anywhere in the package.
   *
   * The last rule is what keeps a real gap visible rather than dropped: the layout
   * `npcdialogpanelhd.json` names `PANEL` + backslash + `Modals` + backslash +
   * `Modal_Button`, and neither that path nor that basename exists anywhere, yet it has to
   * be counted as a failure all the same.
   */
  const isArtReference = (reference: Reference): boolean => {
    if (resolves(reference.name)) return true
    if (!reference.name.includes('/')) return false
    if (basenameOf(reference.name).includes('.')) return false
    if ([...reference.keys].some((key) => ART_FIELD.test(key))) return true
    return basenameShipped(reference.name)
  }
  const artRefs = [...references.values()].filter(isArtReference)
  const artPresent = artRefs.filter((reference) => resolves(reference.name))
  const artMissing = artRefs.filter((reference) => !resolves(reference.name))

  // The manifest the export writes: normalized name → the file the two direct rules found.
  const manifest = new Map<string, Sheet>()
  for (const [name, sheet] of sheets) manifest.set(name, sheet)
  const byBasename = new Map<string, string[]>()
  for (const name of manifest.keys()) {
    const basename = basenameOf(name)
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), manifest.get(name)!.path])
  }

  /** The loader's last step: a basename with exactly one atlas behind it. */
  const fallbackCandidates = (name: string): string[] => byBasename.get(basenameOf(name)) ?? []
  const fallbackServes = (name: string): boolean => fallbackCandidates(name).length === 1

  const byAtlasDirectory = new Map<string, Table>()
  const byLayoutDirectory = new Map<string, Table>()
  const byLayoutKind = new Map<string, Table>()
  for (const reference of artRefs) {
    const usable = resolves(reference.name) && decodes(reference.name)
    tally(byAtlasDirectory, atlasDirectory(reference.name), usable)
    for (const layout of reference.layouts) {
      tally(byLayoutDirectory, layoutDirectory(layout), usable)
      // The HD layouts are the ones a 1080p session renders; the classic ones name the
      // `.dc6` art this build kept for SD, which is why the overall figure is not ~100%.
      tally(byLayoutKind, /hd\.json$/i.test(layout) ? '(hd layouts)' : '(classic layouts)', usable)
    }
  }

  const filenameAll = [...references.values()].filter((reference) => reference.keys.has('filename'))
  const filenamePresent = filenameAll.filter((reference) => resolves(reference.name))
  /** `filename` values that are `$variable` references or a text file, not an atlas name. */
  const filenameNotArt = filenameAll.filter((reference) => !isArtReference(reference))
  const hdSheets = [...sheets.values()].filter((sheet) => sheet.kind === 'hd')
  const classicSheets = [...sheets.values()].filter((sheet) => sheet.kind === 'classic')
  const failures = [...sheets].filter(([, sheet]) => sheet.error)
  const totalBytes = [...sheets.values()].reduce((sum, sheet) => sum + sheet.bytes, 0)

  const otherKeyPresent = artPresent.filter((reference) => !reference.keys.has('filename'))
  const otherKeyOrigins = new Map<string, number>()
  for (const reference of otherKeyPresent) {
    for (const key of reference.keys) otherKeyOrigins.set(key, (otherKeyOrigins.get(key) ?? 0) + 1)
  }
  const topKeys = [...otherKeyOrigins].sort((a, b) => b[1] - a[1]).slice(0, 4)

  /**
   * The 29 references this build answers with art under a different name: art a sprite
   * basename could serve, had the classic file not been there first.
   */
  const spriteBasenames = new Map<string, number>()
  for (const name of sheets.keys()) {
    const sheet = sheets.get(name)!
    if (sheet.kind !== 'hd') continue
    const basename = basenameOf(name)
    spriteBasenames.set(basename, (spriteBasenames.get(basename) ?? 0) + 1)
  }
  const elsewhereByBasename = artRefs.filter(
    (reference) => !sheets.get(reference.name) || sheets.get(reference.name)?.kind === 'classic',
  ).filter((reference) => spriteBasenames.has(basenameOf(reference.name)))
  const fallbackNeeded = artMissing.filter((reference) => fallbackServes(reference.name))
  const fallbackAmbiguous = artMissing.filter((reference) => fallbackCandidates(reference.name).length > 1)

  console.log(`romfs       ${root}`)
  console.log(`layouts     ${layoutFiles.length} files, ${unparsable.length} unparsable`)
  console.log(
    `filename    ${filenameAll.length} distinct values in \`filename\` fields; ${filenamePresent.length} resolve ` +
      `(${percent(filenamePresent.length, filenameAll.length)}); ${filenameAll.length - filenamePresent.length} do not, ` +
      `of which ${filenameNotArt.length} are not art names at all (\`$variable\` and text references)`,
  )
  console.log(
    `other keys  ${otherKeyPresent.length} further sheets resolve from a field other than filename ` +
      `(${topKeys.map(([key, count]) => `${key} x${count}`).join(', ')}, …)`,
  )
  console.log(
    `sheets      ${sheets.size} distinct atlases resolve from any field, ${formatBytes(totalBytes)}; ` +
      `${hdSheets.length} HD .sprite (${formatBytes(hdSheets.reduce((sum, sheet) => sum + sheet.bytes, 0))}), ` +
      `${classicSheets.length} classic .dc6 (${formatBytes(classicSheets.reduce((sum, sheet) => sum + sheet.bytes, 0))}); ` +
      `palette ${palette ? 'read' : 'MISSING'} from ${PALETTE_FILE}`,
  )
  console.log(
    `candidates  ${references.size} distinct string values in the layouts' widget fields name something; ` +
      `${artRefs.length} are art (${artPresent.length} shipped, ${artMissing.length} not) and the other ` +
      `${references.size - artRefs.length} are text, table paths and argument strings`,
  )

  // The grid a layout states, checked against the art it names: `frames` is a count, so
  // the sheet must hold that many, and for HD art `frames / rows` must divide it.
  const checkable = grids.filter((grid) => decodes(grid.name))
  const malformed: GridStatement[] = []
  const wrongCount: GridStatement[] = []
  const notDividing: GridStatement[] = []
  for (const grid of checkable) {
    const sheet = sheets.get(grid.name)!
    const frames = grid.frames ?? sheet.frameCount
    const rows = grid.rows ?? 1
    if (rows <= 0 || frames <= 0 || frames % rows !== 0) {
      malformed.push(grid)
      continue
    }
    if (sheet.kind === 'classic') {
      if (grid.frames !== undefined && grid.frames !== sheet.frameCount) wrongCount.push(grid)
      continue
    }
    const columns = Math.round(frames / rows)
    if (sheet.width % columns !== 0 || sheet.height % rows !== 0) notDividing.push(grid)
  }
  const notCheckable = grids.filter((grid) => !checkable.includes(grid))
  console.log(
    `\ngrids       ${grids.length} widgets state frames/rows; ${checkable.length} name a resolvable sheet — ` +
      `${malformed.length} state a fraction of a column, ${wrongCount.length} a frame count their .dc6 does not ` +
      `hold, ${notDividing.length} a grid their .sprite's pixels do not divide, ${notCheckable.length} uncheckable`,
  )
  for (const grid of [...wrongCount, ...notDividing].slice(0, 6)) {
    const sheet = sheets.get(grid.name)!
    console.log(
      `  disagree: ${grid.layout} → ${grid.name} states ${grid.frames ?? '?'} frames in ${grid.rows ?? 1} rows; ` +
        `${sheet.kind === 'classic' ? `the .dc6 holds ${sheet.frameCount}` : `the sheet is ${sheet.width}x${sheet.height}`}`,
    )
  }
  for (const grid of notCheckable.slice(0, 3)) {
    console.log(
      `  not checkable: ${grid.layout} → ${grid.name} (${grid.frames ?? '?'}x${grid.rows ?? 1} stated, no art in this build)`,
    )
  }
  if (notCheckable.length > 3) console.log(`  … ${notCheckable.length - 3} more`)

  // Classic frames are laid out row-major into `frames / rows` columns, so the rows the
  // sheet needs follow from the file: `MENU/EndGame` holds eight frames and the two
  // widgets in endscreenpanel.json take four each, the second from `frame: 4`.
  const extraPanels = checkable.filter((grid) => {
    const sheet = sheets.get(grid.name)!
    const frames = grid.frames ?? sheet.frameCount
    const rows = grid.rows ?? 1
    return (
      sheet.kind === 'classic' &&
      frames > 0 &&
      rows > 0 &&
      frames % rows === 0 &&
      sheet.frameCount > frames
    )
  })
  console.log(
    `frames      ${extraPanels.length} of the ${checkable.filter((grid) => sheets.get(grid.name)?.kind === 'classic').length} classic grids ` +
      'name fewer frames than their file holds, so the sheet carries the extra panels below (a widget reaches ' +
      "them with the layout's `frame` offset)",
  )

  /**
   * The header-derived grid, which is what 294 + 212 HD sheets are read with since no HD
   * layout in this build states `frames`/`rows`. Same arithmetic and same guard as
   * `hdGrid` in `src/d2/ui/atlas.ts`; kept here as an independent check, and the strict
   * two-texel reading is counted too so the slack's cost is visible.
   */
  interface HeaderGrid {
    name: string
    columns: number
    cell: number
    frameWidth: number
    width: number
    slack: number
  }
  const headerAtLeastWidth: string[] = []
  const headerRoundsToOne: string[] = []
  const headerImplied: HeaderGrid[] = []
  for (const [name, sheet] of sheets) {
    if (sheet.kind !== 'hd' || sheet.error) continue
    // The header value is not on `Sheet`; read it from the file the same way the loader does.
    const sprite = parseSprite(new Uint8Array(readFileSync(join(root, sheet.path))))
    const header = sprite.frameWidth
    if (header <= 0 || header >= sprite.width) {
      headerAtLeastWidth.push(name)
      continue
    }
    const columns = Math.max(1, Math.round(sprite.width / header))
    if (columns === 1) {
      headerRoundsToOne.push(name)
      continue
    }
    headerImplied.push({
      name,
      columns,
      cell: Math.floor(sprite.width / columns),
      frameWidth: header,
      width: sprite.width,
      slack: Math.max(2, Math.round(header / 16)),
    })
  }
  const headerAccepted = headerImplied.filter((sheet) => Math.abs(sheet.cell - sheet.frameWidth) <= sheet.slack)
  const headerRejected = headerImplied.filter((sheet) => Math.abs(sheet.cell - sheet.frameWidth) > sheet.slack)
  const strictRejected = headerImplied.filter((sheet) => Math.abs(sheet.cell - sheet.frameWidth) > 2)
  const tightest = headerAccepted.reduce<HeaderGrid | null>(
    (min, sheet) =>
      min === null || sheet.slack - Math.abs(sheet.cell - sheet.frameWidth) < min.slack - Math.abs(min.cell - min.frameWidth)
        ? sheet
        : min,
    null,
  )
  console.log(
    `\nheader      of the ${headerAtLeastWidth.length + headerRoundsToOne.length + headerImplied.length} decodable HD sheets, ` +
      `${headerAtLeastWidth.length} have frameWidth >= width and are one frame (experience_bar 764 of 764), ` +
      `${headerRoundsToOne.length} more round to one column (${headerRoundsToOne.join(', ')}) and ` +
      `${headerImplied.length} state a frameWidth smaller than the sheet; the guard accepts ` +
      `${headerAccepted.length} of those and rejects ${headerRejected.length}`,
  )
  const widest = [...headerAccepted].sort((a, b) => b.columns - a.columns).slice(0, 4)
  for (const sheet of widest) {
    console.log(
      `  ${String(sheet.columns).padStart(3)} columns of ${sheet.cell} texels (header ${sheet.frameWidth}, sheet ${sheet.width}) ` +
        `${sheet.name}`,
    )
  }
  if (tightest) {
    console.log(
      `  tightest margin: ${tightest.name} is off by ${Math.abs(tightest.cell - tightest.frameWidth)} ` +
        `of a slack of ${tightest.slack} (${tightest.frameWidth} -> ${tightest.cell})`,
    )
  }
  for (const sheet of headerRejected.slice(0, 4)) {
    console.log(
      `  rejected: ${sheet.name} header ${sheet.frameWidth} sheet ${sheet.width} implies ${sheet.columns} of ` +
        `${sheet.cell}, off by ${Math.abs(sheet.cell - sheet.frameWidth)}`,
    )
  }
  console.log(
    `            an absolute two-texel rule would instead throw away ${strictRejected.length} of the ` +
      `${headerImplied.length}, among them ${strictRejected
        .slice(0, 3)
        .map((sheet) => `${sheet.name} (${sheet.frameWidth} -> ${sheet.cell})`)
        .join(', ')}`,
  )

  printTable(
    'by layout (one count per layout that names a name; the kind rows are a name per layout):',
    new Map([...byLayoutKind, ...byLayoutDirectory]),
  )
  printTable('by atlas directory (distinct names):', byAtlasDirectory)

  const templates = artMissing.filter((reference) => reference.name.includes('%'))
  if (templates.length > 0) {
    console.log('\nformat strings (the game substitutes the number into these, so they cannot resolve as written):')
    for (const reference of templates) {
      const basename = basenameOf(reference.name)
      const family = spriteIndex.get(basename.replace(/%d/, '2')) ?? []
      console.log(
        `  ${reference.name} (${[...reference.keys].join(', ')}); ` +
          `${family.length > 0 ? `%d = 2 gives ${family[0]}` : 'no substitution of %d is shipped'}`,
      )
    }
  }

  console.log('\nnamed screens:')
  for (const screen of NAMED_SCREENS) {
    const file = join(layoutsRoot, screen)
    if (!existsSync(file)) {
      console.log(`  ${screen.padEnd(34)} missing`)
      continue
    }
    const screenRefs = artRefs.filter((reference) => reference.layouts.has(screen))
    const bad = screenRefs.filter((reference) => !decodes(reference.name))
    const classic = screenRefs.filter((reference) => sheets.get(reference.name)?.kind === 'classic')
    console.log(
      `  ${screen.padEnd(34)} ${screenRefs.length - bad.length}/${screenRefs.length} drawable` +
        `${classic.length === 0 ? '' : ` (${classic.length} from classic .dc6)`}` +
        `${bad.length === 0 ? '' : `  ← ${bad.map((reference) => reference.name).join(', ')}`}`,
    )
  }

  const uniqueElsewhere = elsewhereByBasename.filter(
    (reference) => spriteBasenames.get(basenameOf(reference.name)) === 1,
  )
  console.log(
    `\nfallback    basename lookup recovered ${fallbackNeeded.length} of ${elsewhereByBasename.length}: the ` +
      `${elsewhereByBasename.length} references this build answers with art under a different name are all ` +
      'answered by the direct .dc6 rule first, so nothing reaches the fallback. The basename is unique among ' +
      `shipped sprites for ${uniqueElsewhere.length} of them, so it is what would answer them in a tree that ` +
      `ships the HD art without the classic files; ${fallbackAmbiguous.length} unresolved references are left ` +
      'alone because their basename is ambiguous',
  )

  const noArtAtAll = artMissing.filter((reference) => !basenameShipped(reference.name)).length
  console.log(
    `\nunresolved  ${artMissing.length} art references name no .sprite and no .dc6 at the path the rule gives; ` +
      `${noArtAtAll} of them have no art of that name anywhere in the package, and the basename fallback serves ` +
      `${fallbackNeeded.length} of the remaining ${artMissing.length - noArtAtAll}`,
  )
  const namedByHdLayout = (reference: Reference): number =>
    [...reference.layouts].some((layout) => /hd\.json$/i.test(layout)) ? 0 : 1
  const worstFirst = [...artMissing].sort(
    (a, b) => namedByHdLayout(a) - namedByHdLayout(b) || a.name.localeCompare(b.name),
  )
  for (const reference of worstFirst.slice(0, 12)) {
    const origin = [...reference.layouts].slice(0, 1)[0]
    const spriteHits = spriteIndex.get(basenameOf(reference.name)) ?? []
    const dc6Hits = dc6Index.get(basenameOf(reference.name)) ?? []
    const where =
      spriteHits.length > 0
        ? `a sprite of that basename ships at ${spriteHits[0]}`
        : dc6Hits.length > 0
          ? `only as ${dc6Hits[0]}`
          : 'no art of this name in the build'
    console.log(
      `  ${reference.name} ← ${LAYOUTS_DIR}/${origin} (${[...reference.keys].join(', ')}); ${where}`,
    )
  }
  if (artMissing.length > 12) console.log(`  … ${artMissing.length - 12} more`)

  // A version neither decoder handles is a fact about the build, so failures are grouped
  // by it rather than listed as anonymous errors.
  const byVersion = new Map<string, string[]>()
  for (const [name, sheet] of failures) {
    const key =
      sheet.kind === 'classic'
        ? `dc6 version ${sheet.version ?? '?'}`
        : `sprite version ${sheet.version ?? '?'}`
    byVersion.set(key, [...(byVersion.get(key) ?? []), name])
  }
  console.log(`\ndecode failures (${failures.length}):`)
  for (const [version, names] of byVersion) {
    console.log(`  ${version}: ${names.length} file${names.length === 1 ? '' : 's'} — ${names.join(', ')}`)
  }
  for (const [name, sheet] of failures.slice(0, 3)) {
    console.log(`  ${name} (${sheet.path}, ${formatBytes(sheet.bytes)}): ${sheet.error}`)
  }
  for (const failure of unparsable) console.log(`  unparsable ${failure}`)

  const artUsable = artPresent.filter((reference) => decodes(reference.name))
  const failed = artMissing.length > 0 || failures.length > 0 || unparsable.length > 0
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'}: ${artUsable.length} of ${artRefs.length} referenced atlases resolve and decode ` +
      `(${percent(artUsable.length, artRefs.length)}); ${artMissing.length} unresolved ` +
      `(${percent(artMissing.length, artRefs.length)}), ${failures.length} present but undecodable, ` +
      `${unparsable.length} unparsable layouts`,
  )
  if (failed) process.exitCode = 1
}

/** The version word of an `SpA1` header, read even when the body does not decode. */
function headerVersion(bytes: Uint8Array): number | null {
  return bytes.length >= 6 ? bytes[4] | (bytes[5] << 8) : null
}

main()
