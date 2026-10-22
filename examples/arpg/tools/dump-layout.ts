#!/usr/bin/env node
/**
 * Prints a UI layout's widget tree, or one node's resolved box.
 *
 * The layouts are the authority for the interface, and reading them by hand is how
 * every box in `src/hud.tsx` was found — `grep '"name"'` on a 4000-line JSON with
 * trailing commas and `//` comments is not a way to answer "what does the HUD name
 * its health globe". This tool parses with the same reader the app uses
 * (`parseLayout`, which handles both of those and the `$Name` profile references),
 * so what it prints is what the renderer sees.
 *
 * Two modes:
 *
 *   dump-layout tree <layout>             the widget tree, with rect/file/cells
 *   dump-layout box  <layout> <name...>   one node's resolved box, in CSS pixels
 *
 * The box mode resolves the tree at a viewport (default 1600x900, the size the
 * reference measured the unit system on) because a layout's numbers are in units
 * and a `style` prop wants pixels. `naturalSize` comes from the exported atlases, so
 * a widget with only a `filename` — which is most of them — is measured at its art's
 * own size rather than at zero.
 *
 * Layout names are case-insensitive and may be given with or without `.json`.
 *
 * Usage:
 *   tsx tools/dump-layout.ts tree hudpanelhd
 *   tsx tools/dump-layout.ts box playerinventoryexpansionlayouthd InventoryGrid
 *
 * Reads only, from `public/original/ui/`. Exits 1 when the layout or the name is not
 * found, so a script can rely on it.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLayout, parseProfile, resolveLayout, flatten, unitOf } from '../src/d2/ui/layout'
import { parseSprite } from '../src/original/sprite'
import { parseDc6 } from '../src/d2/dc6'
import { fieldNumber, fieldPair, fieldString, widgetFilename } from '../src/d2/ui/widget'
import type { UiWidget } from '../src/d2/ui/widget'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const UI_ROOT = join(HERE, '..', 'public', 'original', 'ui')
const LAYOUTS = join(UI_ROOT, 'global', 'ui', 'layouts')

function layoutPath(name: string): string {
  const file = name.toLowerCase().endsWith('.json') ? name : `${name}.json`
  return join(LAYOUTS, file.toLowerCase())
}

/**
 * A widget's art size in layout units, or undefined when it names no art.
 *
 * `cellUnits` in the app's own provider, minus the loader: a `.sprite` header states
 * its pixel size, and a `.dc6` frame is its own bitmap. A texel is two layout units,
 * which is the ratio the reference measured. GUI layouts may also state `frames`
 * and `rows`, and the grid those imply is what the loader cuts the sheet into — the
 * same `frames / rows` arithmetic is repeated here so the tool measures what the app
 * measures rather than what the file's header alone would say.
 */
function naturalSize(widget: UiWidget): { width: number; height: number } | undefined {
  const name = widgetFilename(widget)
  if (name === undefined) return undefined
  const columns = gridColumns(widget)
  const rows = Math.max(Math.trunc(fieldNumber(widget.fields, 'rows') ?? 1) || 1, 1)
  const file = pathFor(name)
  if (file === null) return undefined
  try {
    if (file.endsWith('.sprite')) {
      const sprite = parseSprite(new Uint8Array(readFileSync(file)))
      return { width: ((sprite.width / columns) * 2) | 0, height: ((sprite.height / rows) * 2) | 0 }
    }
    const dc6 = parseDc6(new Uint8Array(readFileSync(file)))
    const rects = dc6.frames[0]?.[0]
    if (rects === undefined) return undefined
    return { width: rects.width * 2, height: rects.height * 2 }
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

/** The exported file a referenced name resolves to, or null. */
function pathFor(reference: string): string | null {
  const normalized = reference
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase()
  const hd = join(UI_ROOT, 'hd', 'global', 'ui', `${normalized}.sprite`)
  const classic = join(UI_ROOT, 'global', 'ui', `${normalized}.dc6`)
  for (const candidate of [hd, classic]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {
      // Try the next candidate; the index fallback below is the last resort.
    }
  }
  const manifest = JSON.parse(readFileSync(join(UI_ROOT, 'index.json'), 'utf8')) as {
    atlases: Record<string, string>
  }
  const base = normalized.split('/').pop() ?? normalized
  const matches = Object.entries(manifest.atlases).filter(([key]) => key.split('/').pop() === base)
  if (matches.length !== 1) return null
  return join(UI_ROOT, matches[0][1].replace(/^hd\//, 'hd/').replace(/^global\//, 'global/'))
}

function describe(widget: UiWidget): string {
  const bits: string[] = []
  const rect = widget.fields.rect
  if (rect !== null && typeof rect === 'object') bits.push(`rect=${JSON.stringify(rect)}`)
  const file = fieldString(widget.fields, 'filename')
  if (file !== undefined) bits.push(`file=${JSON.stringify(file)}`)
  const cells = fieldPair(widget.fields, 'cellCount')
  if (cells !== undefined) bits.push(`cellCount=${cells.x}x${cells.y}`)
  const size = fieldPair(widget.fields, 'cellSize')
  if (size !== undefined) bits.push(`cellSize=${size.x}`)
  const frames = fieldNumber(widget.fields, 'frames')
  if (frames !== undefined) bits.push(`frames=${frames}`)
  const rows = fieldNumber(widget.fields, 'rows')
  if (rows !== undefined) bits.push(`rows=${rows}`)
  const text = fieldString(widget.fields, 'text')
  if (text !== undefined) bits.push(`text=${JSON.stringify(text)}`)
  const anchor = widget.fields.anchor
  if (anchor !== null && typeof anchor === 'object') bits.push(`anchor=${JSON.stringify(anchor)}`)
  return bits.join(' ')
}

function main(argv: string[]): number {
  const [mode, name, ...rest] = argv
  if (mode === undefined || name === undefined) {
    console.error('usage: dump-layout <tree|box> <layout> [name...]')
    return 2
  }
  const file = layoutPath(name)
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`dump-layout: no layout at ${file}`)
    return 1
  }
  const globals = parseProfile(readFileSync(join(LAYOUTS, '_profilehd.json'), 'utf8'))
  const root = parseLayout(text, globals)

  if (mode === 'tree') {
    const walk = (widget: UiWidget, depth: number): void => {
      const line = describe(widget)
      console.log(`${'  '.repeat(depth)}${widget.type} ${JSON.stringify(widget.name)}${line ? ` ${line}` : ''}`)
      for (const child of widget.children) walk(child, depth + 1)
    }
    walk(root, 0)
    return 0
  }

  const viewport = { width: 1600, height: 900 }
  const resolved = resolveLayout(root, viewport, (widget) => naturalSize(widget))
  const unit = unitOf(viewport)
  const wanted = rest.length > 0 ? rest : [name]
  let missing = 0
  for (const target of wanted) {
    const found = flatten(resolved).find((entry) => entry.widget.name === target)
    if (found === undefined) {
      console.error(`dump-layout: ${name} has no widget named ${JSON.stringify(target)}`)
      missing += 1
      continue
    }
    const box = found.box
    console.log(
      `${target}\n` +
        `  widget   ${found.widget.type}\n` +
        `  pixels   x=${box.x.toFixed(1)} y=${box.y.toFixed(1)} w=${box.width.toFixed(1)} h=${box.height.toFixed(1)}\n` +
        `  units    x=${(box.x / unit).toFixed(1)} y=${(box.y / unit).toFixed(1)} ` +
        `w=${(box.width / unit).toFixed(1)} h=${(box.height / unit).toFixed(1)}`,
    )
  }
  return missing > 0 ? 1 : 0
}

process.exit(main(process.argv.slice(2)))
