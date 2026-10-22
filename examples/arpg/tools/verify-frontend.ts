/**
 * Checks the front end against the game's own files, and reports the gap rather than a
 * percentage.
 *
 * The claim `src/frontend.tsx` makes is that the main menu *is* the game's: its layouts,
 * their art, their captions, and a wiring that reaches the widgets it says it reaches.
 * Five things follow from that, and each is checkable from `public/original/` alone:
 *
 * 1. **Every art reference resolves.** Each layout the front end draws is walked for
 *    `filename` values and each is resolved the way `src/d2/ui/atlas.ts` resolves one:
 *    the normalized name against the export's atlas map, and failing that the
 *    lower-cased basename when exactly one atlas carries it. A reference that resolves
 *    to nothing is art the layout asks for and this build cannot draw. Reported as
 *    `resolved/total` per layout, with every failure named.
 * 2. **Every widget the front end looks up exists.** `NAMED_WIDGETS` and
 *    `SKIPPED_WIDGETS` are read back out of the module and each name is looked for in
 *    the layout it is filed under. A name that is not there is a blank row, a flag that
 *    never shows, or a skip that silently does nothing.
 * 3. **Every action the front end honours is really carried.** Each name in
 *    `WIRED_ACTIONS` must appear as a widget's `onClickMessage` in one of the layouts
 *    the front end draws, and the tool prints which widget carries it. This is the check
 *    that the class of bug behind an inert "Press Any Key to Begin" cannot come back:
 *    a handler for a name no layout states is a button that can never fire.
 * 4. **Every caption is the layout's.** All the caption keys (`@Key`) of every drawn
 *    layout are resolved against the table `main.tsx` loads (`strings_ui.json`), so a
 *    literal `@Key` on screen would be reported here rather than discovered in a
 *    screenshot. The source file itself is then scanned for JSX text: the front end
 *    writes no words of its own, and the tool proves it by finding no text between tags
 *    and no sentence-shaped string literal outside a short list of reviewed exceptions.
 * 5. **The substituted background is what it says.** `THREE_D_TYPES` are looked up in
 *    `mainmenupanelhd` and each is checked to carry no art, which is why a substitute is
 *    needed at all.
 *
 * Finally the layouts the front end *does not* draw (`NOT_DRAWN`) are reported with the
 * evidence behind each exclusion: how many of their widgets are controls whose art is
 * their value, how many are 3D, how many are movies, and which of their content files
 * are missing from the export.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-frontend.ts
 *
 * Reads only, from `public/original/`, and from `src/frontend.tsx` for the tables it
 * claims. Exits 1 when any check fails.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import {
  FRONTEND_LAYOUTS,
  FRONTEND_STAGES,
  MENU_LAYOUTS,
  NAMED_WIDGETS,
  NOT_DRAWN,
  SKIPPED_WIDGETS,
  THREE_D_TYPES,
  WIRED_ACTIONS,
} from '../src/frontend'
import { parseLayout, parseProfile } from '../src/d2/ui/layout'
import { widgetFilename } from '../src/d2/ui/widget'
import type { UiWidget } from '../src/d2/ui/widget'

const ROOT = resolve(import.meta.dirname, '../public/original')
/** The file under test, and its name for the report. */
const FRONTEND_SOURCE_NAME = 'src/frontend.tsx'
const FRONTEND_SOURCE = resolve(import.meta.dirname, '../src/frontend.tsx')
const LAYOUTS = join(ROOT, 'ui/global/ui/layouts')

/** The HD profile every `*hd` layout is written against. */
const PROFILE = '_profilehd'

/**
 * The string table `main.tsx` hands the front end. A caption key that is not in it is a
 * key this build cannot resolve, wherever else the game keeps it.
 */
const STRING_TABLE = 'strings_ui.json'

/** Widget types whose art *is* their value: a slider, a carousel, a dropdown. */
const VALUE_CONTROLS = new Set([
  'CarouselWidget',
  'DropdownListWidget',
  'SettingsSliderWidget',
  'ToggleButtonWidget',
  'TabBarWidget',
  'ScrollControllerWidget',
])

/** Widget types that show something only while a movie plays. */
const MOVIE_WIDGETS = new Set(['MoviePlayerWidget'])

/**
 * The sentences the source is allowed to contain, and why.
 *
 * A caption belongs to a layout or a string table, so this file writes none: the list is
 * two `console.warn` lines, which are diagnostics and never on screen. The check is an
 * equality rather than a subset, so a new sentence is a failure and a stale exception is
 * one too.
 */
const REVIEWED_SENTENCES: readonly string[] = [
  'rasen: the menu backdrop could not be baked from the level files',
  'rasen: the menu backdrop is unavailable',
]

/** Widget types that show text, for the count of boxes the game fills by code. */
const TEXT_TYPES = new Set(['TextBoxWidget', 'InputTextBoxWidget', 'LabelWidget'])

/** Types the front end's three-dimensional scene is made of. */
const THREE_D_WIDGETS = new Set(['Camera3DWidget', 'HDCharacterSelectorWidget', ...THREE_D_TYPES])

/** The export's atlas map, as the loader reads it. */
interface UiIndex {
  atlases?: Record<string, string>
}

function readLayout(name: string): UiWidget {
  const globals = parseProfile(readFileSync(join(LAYOUTS, `${PROFILE}.json`), 'utf8'))
  return parseLayout(readFileSync(join(LAYOUTS, `${name}.json`), 'utf8'), globals)
}

/** Every node of a layout, the root included. */
function nodes(root: UiWidget): UiWidget[] {
  const out: UiWidget[] = []
  const walk = (widget: UiWidget): void => {
    out.push(widget)
    for (const child of widget.children) walk(child)
  }
  walk(root)
  return out
}

/** A layout's caption keys, in the layouts' own spelling (`@Key`). */
function captionKeys(root: UiWidget): string[] {
  const keys = new Set<string>()
  for (const widget of nodes(root)) {
    for (const field of ['text', 'textString', 'textTemplate'] as const) {
      const value = widget.fields[field]
      if (typeof value === 'string' && value.startsWith('@')) keys.add(value)
    }
  }
  return [...keys]
}

/** The game's own `onClickMessage`, if the widget states one. */
function clickMessage(widget: UiWidget): string | null {
  const value = widget.fields.onClickMessage
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The atlas name as `atlas.ts` normalizes it: `\` → `/`, repeats collapsed, a leading
 * `/` dropped, lower-cased.
 */
function normalize(name: string): string {
  return name.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').toLowerCase()
}

/**
 * Whether a layout's `filename` resolves to a file the export serves.
 *
 * The two rules the loader tries that can be checked without decoding: the normalized
 * name in the export's atlas map, and the lower-cased basename when exactly one atlas in
 * that map carries it. The loader's other fallbacks (a `.sprite`/`.dc6` path guess) end
 * in the same map, which the export wrote from the files it copied.
 */
function resolveAtlas(name: string, index: Map<string, string>): boolean {
  const normalized = normalize(name)
  if (index.has(normalized)) return true
  const base = normalized.split('/').pop() ?? normalized
  let matches = 0
  for (const key of index.keys()) {
    if ((key.split('/').pop() ?? key) === base) matches += 1
  }
  return matches === 1
}

/** The export's atlas map, including a bare basename index for the fallback rule. */
function atlasIndex(): Map<string, string> {
  const raw = JSON.parse(readFileSync(join(ROOT, 'ui/index.json'), 'utf8')) as UiIndex
  const index = new Map<string, string>()
  for (const [name, file] of Object.entries(raw.atlases ?? {})) index.set(normalize(name), file)
  return index
}

/** The UI string table, key → English. */
function stringTable(): Map<string, string> {
  const rows = JSON.parse(readFileSync(join(ROOT, STRING_TABLE), 'utf8')) as Array<Record<string, unknown>>
  const table = new Map<string, string>()
  for (const row of rows) {
    const key = String(row.Key ?? '')
    if (key !== '' && !table.has(key)) table.set(key, String(row.enUS ?? ''))
  }
  return table
}

/** A layout's widget names, for the lookups that go by name. */
function namesOf(root: UiWidget): Set<string> {
  return new Set(nodes(root).map((widget) => widget.name))
}

/**
 * The file's own syntax tree.
 *
 * The two checks that are about the source itself — does it write any words, does it
 * contain a sentence — use the TypeScript parser rather than a regular expression:
 * `>text<` inside a generic parameter or a comparison is not JSX, and a `//` inside a
 * string is not a comment. Strings and JSX text nodes are exactly what the parser says
 * they are.
 */
function parseSource(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
}

/** Every non-blank JSX text run in the file: words the file itself puts on screen. */
function jsxTexts(source: ts.SourceFile): string[] {
  const found: string[] = []
  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim()
      if (text !== '') found.push(text)
    }
    node.forEachChild(walk)
  }
  walk(source)
  return found
}

/**
 * Sentence-shaped string literals in the file.
 *
 * A caption belongs to a layout or a string table, so there should be none. The
 * exceptions are reviewed here rather than assumed, and they are all diagnostics:
 * `console.warn` lines, which are never on screen. "Sentence-shaped" is deliberately
 * narrow — three or more alphabetic words, no `%` placeholder, no `@` table key, no
 * `url(`, no `rasen:` prefix — so `pointer-events`, `background-size` and
 * `@LevelAndClassDescription` are not mistaken for prose.
 */
function spokenLiterals(source: ts.SourceFile): string[] {
  const found: string[] = []
  const consider = (text: string): void => {
    const trimmed = text.trim()
    if (!/\s/.test(trimmed)) return
    if (trimmed.includes('%') || trimmed.includes('url(') || trimmed.startsWith('@')) return
    const words = trimmed.split(/\s+/).filter((word) => /^[A-Za-z][A-Za-z'-]*$/.test(word))
    if (words.length >= 3) found.push(trimmed)
  }
  const walk = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) consider(node.text)
    node.forEachChild(walk)
  }
  walk(source)
  return found
}

/**
 * Every file under `public/original/` with one of these extensions.
 *
 * It answers one question for the layouts that are not drawn: the export carries no
 * movies at all, which is why the cinematics list, the credits roll and the logo panel
 * would be empty frames.
 */
function filesWithExtensions(root: string, extensions: readonly string[]): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (extensions.some((extension) => entry.name.toLowerCase().endsWith(extension))) {
        found.push(path.slice(root.length + 1))
      }
    }
  }
  walk(root)
  return found
}

/** Whether two `@Key` spellings name the same table row (the tables' keys are exact). */
function hasKey(table: Map<string, string>, key: string): boolean {
  return table.has(key.slice(1))
}

function main(): void {
  const index = atlasIndex()
  const strings = stringTable()
  const problems: string[] = []
  const drawn = new Set<string>(Object.values(FRONTEND_STAGES).flat())

  // -- 1. art ---------------------------------------------------------------
  console.log(`front end: ${FRONTEND_LAYOUTS.length} layouts loaded, ${drawn.size} drawn`)
  let artTotal = 0
  let artMissing = 0
  for (const name of FRONTEND_LAYOUTS) {
    const root = readLayout(name)
    const refs = [...new Set(nodes(root).map(widgetFilename).filter((file): file is string => file !== undefined))]
    const missing = refs.filter((ref) => !resolveAtlas(ref, index))
    artTotal += refs.length
    artMissing += missing.length
    console.log(`  ${name}: art ${refs.length - missing.length}/${refs.length}`)
    for (const ref of missing) problems.push(`${name}: art "${ref}" is not exported`)
  }
  console.log(`  art references: ${artTotal - artMissing}/${artTotal} resolve`)

  // -- 2. looked-up widgets -------------------------------------------------
  let lookupTotal = 0
  for (const [layout, names] of Object.entries(NAMED_WIDGETS)) {
    const present = namesOf(readLayout(layout))
    for (const name of names) {
      lookupTotal += 1
      if (!present.has(name)) problems.push(`${layout}: NAMED_WIDGETS names "${name}", which the layout does not have`)
    }
    console.log(`  ${layout}: ${names.length} looked-up widget names, ${names.filter((n) => present.has(n)).length} present`)
  }
  for (const [layout, names] of Object.entries(SKIPPED_WIDGETS)) {
    const present = namesOf(readLayout(layout))
    for (const name of names) {
      lookupTotal += 1
      if (!present.has(name)) problems.push(`${layout}: SKIPPED_WIDGETS names "${name}", which the layout does not have`)
    }
    console.log(`  ${layout}: ${names.length} skipped widgets, ${names.filter((n) => present.has(n)).length} present`)
  }
  console.log(`  widget names looked up: ${lookupTotal}`)

  // -- 3. the wiring --------------------------------------------------------
  for (const action of WIRED_ACTIONS) {
    const carriers: string[] = []
    for (const name of drawn) {
      for (const widget of nodes(readLayout(name))) {
        if (clickMessage(widget) === action) carriers.push(`${name}/${widget.name}`)
      }
    }
    if (carriers.length === 0) {
      problems.push(`WIRED_ACTIONS: "${action}" is not carried by any drawn layout, so nothing can ever fire it`)
    } else {
      console.log(`  action "${action}" is carried by ${carriers.join(', ')}`)
    }
  }

  // -- 4. captions ----------------------------------------------------------
  let captions = 0
  let unresolved = 0
  for (const name of FRONTEND_LAYOUTS) {
    const keys = captionKeys(readLayout(name))
    const bad = keys.filter((key) => !hasKey(strings, key))
    captions += keys.length
    unresolved += bad.length
    console.log(`  ${name}: captions ${keys.length - bad.length}/${keys.length}`)
    for (const key of bad) {
      problems.push(`${name}: caption ${key} is not in ${STRING_TABLE}`)
    }
  }
  console.log(`  captions: ${captions - unresolved}/${captions} resolve through ${STRING_TABLE}`)
  const source = parseSource(FRONTEND_SOURCE)
  const texts = jsxTexts(source)
  for (const text of texts) problems.push(`${FRONTEND_SOURCE_NAME} writes text of its own: "${text}"`)
  console.log(`  ${FRONTEND_SOURCE_NAME}: ${texts.length} JSX text runs, so every word on screen is a layout's`)
  const sentences = spokenLiterals(source)
  for (const sentence of sentences) {
    if (!REVIEWED_SENTENCES.includes(sentence)) {
      problems.push(`${FRONTEND_SOURCE_NAME} contains the sentence "${sentence}"`)
    }
  }
  for (const reviewed of REVIEWED_SENTENCES) {
    if (!sentences.includes(reviewed)) {
      problems.push(`REVIEWED_SENTENCES lists "${reviewed}", which the source no longer contains`)
    }
  }
  console.log(
    `  ${FRONTEND_SOURCE_NAME}: ${sentences.length} sentence-shaped string literals, ` +
      `all of them reviewed console warnings (${REVIEWED_SENTENCES.length} declared)`,
  )

  // -- 5. the substituted background ---------------------------------------
  const menuPanel = readLayout(MENU_LAYOUTS.menuPanel)
  let threeD = 0
  let threeDWithArt = 0
  for (const widget of nodes(menuPanel)) {
    if (!THREE_D_WIDGETS.has(widget.type)) continue
    threeD += 1
    if (widgetFilename(widget) !== undefined) threeDWithArt += 1
  }
  console.log(
    `  ${MENU_LAYOUTS.menuPanel}: ${threeD} three-dimensional widgets, ${threeDWithArt} of them with art ` +
      `(the backdrop stands in for the rest)`,
  )
  if (threeD === 0) problems.push(`${MENU_LAYOUTS.menuPanel}: no 3D widget, so the backdrop's claim is stale`)
  if (threeDWithArt > 0) problems.push(`${MENU_LAYOUTS.menuPanel}: a 3D widget carries art, so the backdrop is not the only way`)

  // -- the layouts that are not drawn --------------------------------------
  const movies = filesWithExtensions(ROOT, ['.bik', '.mp4', '.webm', '.ogv'])
  console.log(`front end: movie files under public/original/: ${movies.length}`)
  console.log(`front end: ${NOT_DRAWN.length} front-end layouts are deliberately not drawn`)
  for (const name of NOT_DRAWN) {
    if (drawn.has(name)) {
      problems.push(`${name}: listed in NOT_DRAWN and also drawn`)
      continue
    }
    const root = readLayout(name)
    const all = nodes(root)
    const controls = all.filter((widget) => VALUE_CONTROLS.has(widget.type))
    const blank = controls.filter((widget) => widgetFilename(widget) === undefined)
    const three = all.filter((widget) => THREE_D_WIDGETS.has(widget.type))
    const players = all.filter((widget) => MOVIE_WIDGETS.has(widget.type))
    const inert = all.filter((widget) => {
      const message = clickMessage(widget)
      return message !== null && !WIRED_ACTIONS.includes(message)
    })
    const unnamed = all.filter(
      (widget) =>
        widgetFilename(widget) === undefined &&
        TEXT_TYPES.has(widget.type) &&
        !['text', 'textString', 'textTemplate'].some(
          (field) => typeof widget.fields[field] === 'string' && widget.fields[field] !== '',
        ),
    )
    const files = [...new Set(all.map(widgetFilename).filter((file): file is string => file !== undefined))]
    const missingContent = files.filter((file) => !resolveAtlas(file, index))
    console.log(
      `  ${name}: ${all.length} widgets; ${controls.length} value controls, ${blank.length} of which draw nothing; ` +
        `${three.length} three-dimensional; ${players.length} movie players; ${inert.length} buttons for actions ` +
        `this build does not honour; ${unnamed.length} text boxes the game fills` +
        (missingContent.length > 0 ? `; content not in the export: ${missingContent.join(', ')}` : ''),
    )
  }

  // -- report --------------------------------------------------------------
  console.log(
    `front end: ${problems.length} problem${problems.length === 1 ? '' : 's'} ` +
      `across ${FRONTEND_LAYOUTS.length} drawn layouts`,
  )
  for (const problem of problems) console.error(`  ${problem}`)
  if (problems.length > 0) {
    console.error('verify-frontend: FAILED')
    process.exitCode = 1
    return
  }
  console.log('verify-frontend: OK')
}

main()
