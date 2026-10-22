#!/usr/bin/env node
/**
 * Checks the overlays in `src/hud-panels.tsx` against the layouts they draw.
 *
 * Two failures this guards against, both silent on screen:
 *
 * 1. **A lookup that finds nothing.** Every overlay resolves widgets *by path* —
 *    `HUDMonsterHealth` → `Health` → `Name` — and a path the layout does not have
 *    yields an empty overlay rather than an error. So every path the module resolves
 *    is listed in its `HUD_EXTRA_LOOKUPS` table, and this checks each one against the
 *    layout it names, and checks that the layout is one the module actually asks the
 *    loader for (`EXTRA_UI_LAYOUTS`), because a path checked against an unloaded
 *    layout would pass here and draw nothing in the game.
 *
 * 2. **Art a layout names but the export does not ship.** A widget whose atlas is
 *    missing draws nothing, which for a frame or a button is invisible-but-wrong. Each
 *    layout's references are collected from the fields that name art (`filename`,
 *    `filepath`, `basePath`, `overlayPath`, `sprite`, at any nesting the layouts use)
 *    and resolved with the loader's own rule — `hd/global/ui/<name>.sprite`, then
 *    `global/ui/<name>.dc6`, then the basename index when it is unambiguous — so a
 *    name reported as unresolved is a name the game itself could not draw.
 *
 * Numbers are printed as they are found, never as a percentage that hides a remainder:
 * every unresolved reference is named, and so is every lookup that misses.
 *
 * The layouts are parsed with the app's own reader and the HD profile (`$Name`
 * references resolve, so the boxes are the boxes the renderer resolves), and the
 * `basedOn` merges the module declares are applied, so the tree checked is the tree
 * the overlays are handed.
 *
 * Usage:
 *   tsx tools/verify-ui-extra.ts [--boxes] [--strict-art]
 *
 * Reads only, from `public/original/ui/`. Exits 1 on a failure: a layout that does not
 * parse, or a widget path that is not in the layout it is looked up in. Unresolved art
 * is counted and named but not fatal unless `--strict-art` is given, because the export
 * carries only the art the layouts reference and the package ships.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLayout, parseProfile, resolveLayout, unitOf, type ResolvedWidget } from '../src/d2/ui/layout'
import { parseSprite } from '../src/original/sprite'
import { parseDc6 } from '../src/d2/dc6'
import { fieldNumber, widgetFilename, type UiWidget } from '../src/d2/ui/widget'
import {
  EXTRA_UI_LAYOUTS,
  EXTRA_UI_MERGES,
  HUD_EXTRA_LOOKUPS,
  mergeLayout,
  widgetAt,
} from '../src/hud-panels'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const UI_ROOT = join(HERE, '..', 'public', 'original', 'ui')
const LAYOUTS = join(UI_ROOT, 'global', 'ui', 'layouts')
const HD_ROOT = join(UI_ROOT, 'hd', 'global', 'ui')
const CLASSIC_ROOT = join(UI_ROOT, 'global', 'ui')
const PROFILE = join(LAYOUTS, '_profilehd.json')
const INDEX = join(UI_ROOT, 'index.json')

/** The viewport the boxes are resolved at: the size the unit system was measured on. */
const VIEWPORT = { width: 1600, height: 900 }

/** A widget field whose value is a path to art, at any nesting the layouts use. */
const ART_FIELD = /filename$|filepath$|^basepath$|^overlaypath$|^sprite$/i

/** Whether `--boxes` was asked for: the resolved box of every widget looked up. */
const SHOW_BOXES = process.argv.includes('--boxes')

/**
 * Whether unresolved art is fatal.
 *
 * Off by default, because it is not always a bug in *this* module: the export carries
 * only the art the layouts reference *and* the package ships, and three of the layouts
 * here name art the package itself does not have — the automap's seventeen tile sheets
 * and the modal button — which is a fact about the build, named in `hud-panels.tsx`
 * where each is drawn around. `--strict-art` makes those fatal too, for a run whose
 * question is whether every layout could be drawn in full.
 */
const STRICT_ART = process.argv.includes('--strict-art')

interface AtlasIndex {
  /** Normalized name → the path under `public/original/ui`, as the manifest spells it. */
  readonly atlases: ReadonlyMap<string, string>
  /** Lower-cased basename → every path with that basename, for the fallback rule. */
  readonly byBasename: ReadonlyMap<string, string[]>
}

function normalizeName(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase()
}

function basenameOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1)
}

/** The manifest the export writes, which is also how the loader falls back. */
function readIndex(): AtlasIndex {
  const raw = JSON.parse(readFileSync(INDEX, 'utf8')) as { atlases: Record<string, string> }
  const atlases = new Map<string, string>()
  const byBasename = new Map<string, string[]>()
  for (const [key, value] of Object.entries(raw.atlases)) {
    atlases.set(key, value)
    const basename = basenameOf(key)
    byBasename.set(basename, [...(byBasename.get(basename) ?? []), value])
  }
  return { atlases, byBasename }
}

/**
 * The exported file a layout's reference resolves to, or null.
 *
 * The same order the loader tries, and the same fallback `tools/verify-ui-atlas.ts`
 * documents: the direct paths, then the manifest's basename — and only when that
 * basename is unambiguous, because two sheets with the same name are two different
 * pictures.
 */
function resolveArt(index: AtlasIndex, reference: string): string | null {
  const normalized = normalizeName(reference)
  const candidates = [
    join(HD_ROOT, `${normalized}.sprite`),
    join(CLASSIC_ROOT, `${normalized}.dc6`),
  ]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  const exact = index.atlases.get(normalized)
  if (exact !== undefined) {
    const path = join(UI_ROOT, exact)
    if (existsSync(path)) return path
  }
  const matches = index.byBasename.get(basenameOf(normalized)) ?? []
  if (matches.length !== 1) return null
  const path = join(UI_ROOT, matches[0])
  return existsSync(path) ? path : null
}

/** One art reference a layout makes, and where in the widget tree it was written. */
interface ArtReference {
  readonly name: string
  readonly key: string
  readonly widget: string
}

/** Every string under an art-naming field, at any depth of the fields object. */
function collectArt(widget: UiWidget, out: ArtReference[]): void {
  const walk = (value: unknown, key: string): void => {
    if (typeof value === 'string') {
      if (value !== '') out.push({ name: value, key, widget: widget.name })
      return
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry, key)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [nested, entry] of Object.entries(value as Record<string, unknown>)) {
        walk(entry, `${key}/${nested}`)
      }
    }
  }
  for (const [key, value] of Object.entries(widget.fields)) {
    if (!ART_FIELD.test(key)) continue
    walk(value, key)
  }
  for (const child of widget.children) collectArt(child, out)
}

/** A widget's art size in layout units, which is how the renderer measures the tree. */
function naturalSize(widget: UiWidget): { width: number; height: number } | undefined {
  const name = widgetFilename(widget)
  if (name === undefined) return undefined
  const columns = gridColumns(widget)
  const rows = Math.max(Math.trunc(fieldNumber(widget.fields, 'rows') ?? 1) || 1, 1)
  const file = normalizedFile(name)
  if (file === null) return undefined
  try {
    if (file.endsWith('.sprite')) {
      const sprite = parseSprite(new Uint8Array(readFileSync(file)))
      return { width: ((sprite.width / columns) * 2) | 0, height: ((sprite.height / rows) * 2) | 0 }
    }
    const dc6 = parseDc6(new Uint8Array(readFileSync(file)))
    const rects = dc6.frames[0]?.[0]
    return rects === undefined ? undefined : { width: rects.width * 2, height: rects.height * 2 }
  } catch {
    return undefined
  }
}

/** The columns the loader would cut a sheet into, from the layout's own grid. */
function gridColumns(widget: UiWidget): number {
  const frames = fieldNumber(widget.fields, 'frames')
  const rows = Math.max(Math.trunc(fieldNumber(widget.fields, 'rows') ?? 1) || 1, 1)
  if (frames !== undefined && frames > 0) return Math.max(Math.floor(frames / rows), 1)
  return 1
}

/** The exported file behind a reference, by the direct rule only (no basename search). */
function normalizedFile(reference: string): string | null {
  const normalized = normalizeName(reference)
  for (const candidate of [join(HD_ROOT, `${normalized}.sprite`), join(CLASSIC_ROOT, `${normalized}.dc6`)]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Count every widget in a tree the way `flatten` does, root included. */
function countWidgets(root: UiWidget): number {
  let count = 1
  for (const child of root.children) count += countWidgets(child)
  return count
}

/** The tree the module is handed for a layout: its own, with its base merged in. */
function effectiveTree(parsed: Map<string, UiWidget>, name: string): UiWidget | null {
  const root = parsed.get(name)
  if (root === undefined) return null
  const base = EXTRA_UI_MERGES.find(([derived]) => derived === name)
  if (base === undefined) return root
  const baseRoot = parsed.get(base[1])
  return baseRoot === undefined ? root : mergeLayout(baseRoot, root)
}

function pathText(path: readonly string[]): string {
  return path.join(' > ')
}

function main(): void {
  const index = readIndex()
  const globals = parseProfile(readFileSync(PROFILE, 'utf8'))
  const unit = unitOf(VIEWPORT)
  console.log(
    `verify-ui-extra: ${EXTRA_UI_LAYOUTS.length} layouts at ${VIEWPORT.width}x${VIEWPORT.height} ` +
      `(1 unit = ${unit.toFixed(4)} px), ${HUD_EXTRA_LOOKUPS.length} widget paths`,
  )

  const parsed = new Map<string, UiWidget>()
  const unreadable: string[] = []
  for (const name of EXTRA_UI_LAYOUTS) {
    const file = join(LAYOUTS, `${name.toLowerCase()}.json`)
    if (!existsSync(file)) {
      unreadable.push(`${name}: no layout at ${file}`)
      continue
    }
    try {
      parsed.set(name, parseLayout(readFileSync(file, 'utf8'), globals))
    } catch (error) {
      unreadable.push(`${name}: ${String(error)}`)
    }
  }

  let references = 0
  let resolvedReferences = 0
  let missingReferences = 0
  let widgets = 0
  let missingWidgets = 0
  const unresolved: string[] = []

  console.log('\nper layout: widgets, art references, and every reference that does not resolve')
  for (const name of EXTRA_UI_LAYOUTS) {
    const tree = effectiveTree(parsed, name)
    if (tree === null) {
      console.log(`  ${name.padEnd(28)} —                       not readable`)
      continue
    }
    const count = countWidgets(tree)
    widgets += count
    const refs: ArtReference[] = []
    collectArt(tree, refs)
    const distinct = new Map<string, ArtReference[]>()
    for (const reference of refs) {
      const key = normalizeName(reference.name)
      distinct.set(key, [...(distinct.get(key) ?? []), reference])
    }
    let resolvedHere = 0
    const missingHere: string[] = []
    for (const [key, group] of distinct) {
      if (resolveArt(index, key) !== null) resolvedHere += 1
      else {
        missingHere.push(key)
        unresolved.push(`${name}: ${key} (${group[0].key} on ${group[0].widget || '(unnamed)'})`)
      }
    }
    references += distinct.size
    resolvedReferences += resolvedHere
    missingReferences += missingHere.length
    const merged = EXTRA_UI_MERGES.some(([derived]) => derived === name) ? ' (base merged)' : ''
    console.log(
      `  ${name.padEnd(28)} ${String(count).padStart(4)} widgets  ` +
        `${String(resolvedHere).padStart(3)} of ${String(distinct.size).padStart(3)} art references ` +
        `resolve${missingHere.length === 0 ? '' : `  ← ${missingHere.length} missing`}${merged}`,
    )
    for (const key of missingHere) {
      const group = distinct.get(key) as ArtReference[]
      console.log(
        `      ${key}  ← ${group.length} field${group.length === 1 ? '' : 's'}: ` +
          `${group.map((reference) => `${reference.key} on ${reference.widget || '(unnamed)'}`).join(', ')}`,
      )
    }
  }

  console.log('\nwidget paths this module resolves')
  const layouts = new Set(EXTRA_UI_LAYOUTS)
  for (const lookup of HUD_EXTRA_LOOKUPS) {
    const where = `${lookup.layout} ${pathText(lookup.path)}`
    if (!layouts.has(lookup.layout)) {
      missingWidgets += 1
      console.log(`  MISSING LAYOUT  ${where} — not in EXTRA_UI_LAYOUTS, so it is never loaded`)
      continue
    }
    const tree = effectiveTree(parsed, lookup.layout)
    if (tree === null) {
      missingWidgets += 1
      console.log(`  UNREADABLE      ${where}`)
      continue
    }
    const resolved = resolveLayout(tree, VIEWPORT, (widget) => naturalSize(widget))
    const found = widgetAt(resolved, lookup.path)
    if (found === null) {
      missingWidgets += 1
      console.log(`  NOT THERE       ${where} — ${lookup.why}`)
      continue
    }
    const box = found.box
    const boxText =
      `${box.x.toFixed(1)},${box.y.toFixed(1)} ${box.width.toFixed(1)}x${box.height.toFixed(1)} px` +
      `${box.width === 0 || box.height === 0 ? ' (zero-sized: the engine sizes it)' : ''}`
    console.log(`  ok              ${where.padEnd(56)} ${boxText}`)
  }

  console.log(
    `\nlayouts:    ${parsed.size} of ${EXTRA_UI_LAYOUTS.length} parse${unreadable.length === 0 ? '' : `, ${unreadable.length} not readable`}`,
  )
  for (const failure of unreadable) console.log(`  ${failure}`)
  console.log(
    `widgets:    ${widgets} in the trees that parsed; ${HUD_EXTRA_LOOKUPS.length - missingWidgets} of ` +
      `${HUD_EXTRA_LOOKUPS.length} resolved paths found, ${missingWidgets} not there`,
  )
  console.log(
    `art:        ${resolvedReferences} of ${references} distinct references resolve to an exported file, ` +
      `${missingReferences} do not`,
  )
  if (unresolved.length > 0) {
    console.log(
      `\nunresolved art references (${unresolved.length}), one per line — the export carries only art the ` +
        'layouts reference and the package ships, so a name here is art this build cannot draw:' +
        `${STRICT_ART ? '' : ' (reported, not fatal without --strict-art)'}`,
    )
    for (const line of unresolved) console.log(`  ${line}`)
  }
  if (SHOW_BOXES) {
    console.log('\nresolved boxes of every widget the paths reach, in layout units:')
    for (const name of EXTRA_UI_LAYOUTS) {
      const tree = effectiveTree(parsed, name)
      if (tree === null) continue
      const resolved = resolveLayout(tree, VIEWPORT, (widget) => naturalSize(widget))
      for (const lookup of HUD_EXTRA_LOOKUPS.filter((entry) => entry.layout === name)) {
        for (const widget of reachable(resolved, lookup.path)) {
          const box = widget.box
          console.log(
            `  ${name.padEnd(28)} ${pathText(lookup.path).padEnd(48)} ` +
              `${(box.x / unit).toFixed(1)},${(box.y / unit).toFixed(1)} ` +
              `${(box.width / unit).toFixed(1)}x${(box.height / unit).toFixed(1)} units ` +
              `(${box.width.toFixed(1)}x${box.height.toFixed(1)} px, ${widget.widget.type})`,
          )
        }
      }
    }
  }

  const failed =
    unreadable.length > 0 || missingWidgets > 0 || (STRICT_ART && missingReferences > 0)
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'}: ${parsed.size}/${EXTRA_UI_LAYOUTS.length} layouts parsed, ` +
      `${HUD_EXTRA_LOOKUPS.length - missingWidgets}/${HUD_EXTRA_LOOKUPS.length} widget paths found, ` +
      `${resolvedReferences}/${references} art references resolve, ${missingReferences} unresolved` +
      `${missingReferences === 0 || STRICT_ART ? '' : ' (reported, not fatal)'}`,
  )
  if (failed) process.exitCode = 1
}

/** The widgets one path reaches, for `--boxes`. */
function reachable(root: ResolvedWidget, path: readonly string[]): ResolvedWidget[] {
  let node: ResolvedWidget | null = root
  for (const name of path) {
    if (node === null) return []
    let found: ResolvedWidget | null = null
    const stack: ResolvedWidget[] = [node]
    while (stack.length > 0) {
      const current = stack.pop() as ResolvedWidget
      if (current.widget.name === name) {
        found = current
        break
      }
      for (const child of current.children) stack.push(child)
    }
    node = found
  }
  return node === null ? [] : [node]
}

main()
