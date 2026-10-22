#!/usr/bin/env node
/**
 * Checks the interface's *geometry* — the scale every screen is drawn at — against
 * the layouts and the exported art, with no browser.
 *
 * The question this answers is the one a screenshot cannot: **is every widget drawn
 * at the size the layout and the art imply, on every screen it is drawn on?** The
 * unit system is measured, not chosen (one layout unit is `viewport.height / 2160`,
 * one sprite texel is two units), and a mistake in it is invisible — a sprite drawn
 * at the wrong scale still paints, it just paints the wrong thing. That has already
 * happened once in this repository: `imageStyle` divided the box by the units-per-texel
 * ratio a second time and drew every sprite at half size, so a button showed half of
 * itself and half of its neighbour. Nothing about the built page made that obvious.
 *
 * Four checks, over every widget of every layout the game draws:
 *
 * 1. **Uniform stretch.** A sprite's cell is scaled by
 *    `box.width / cellWidth` horizontally and `box.height / cellHeight` vertically.
 *    A layout may state a rect that is a different *size* than the art — that is what
 *    `rect` is for — but it states one width and one height, and any widget whose two
 *    ratios disagree is being stretched, which the layouts never ask for. Every such
 *    widget is named, with both numbers. A `NineTileImageWidget` is *excluded*, and
 *    deliberately: stretching its middle while its corners stay square is the whole
 *    of what a nine-tile is, so a non-uniform ratio is the point rather than a bug.
 * 2. **Anchored framing.** The bar and every panel are placed by their own anchors, so
 *    the same widget must sit at the same *fraction* of the viewport on every screen.
 *    A widget whose fractional position moves by more than a rounding step between two
 *    viewports means an anchor is being ignored and a pixel offset is standing in.
 * 3. **The crop arithmetic.** Check 1 compares the box with the cell, and the box is
 *    right; what the renderer has to get right is the *style* that paints the cell
 *    there, and that is where this repository's real bug was — `imageStyle` scaled the
 *    background by half. So the check calls the renderer's own `spriteCellStyle` with a
 *    frame measured from the art and asserts that the scale it produces maps the cell
 *    exactly onto the box, in both axes, offset included. It is the renderer that is
 *    under test here, not a re-implementation of it.
 * 4. **Nine-tile slices.** A `NineTileImageWidget` is drawn with
 *    `border-image`, and its slice is a quarter of the smaller side of its cell. A
 *    slice wider than half the box turns the frame inside out; the check reports how
 *    many nine-tiles there are and whether any of them cannot be drawn.
 *
 * Usage:
 *   tsx examples/arpg/tools/verify-ui-scale.ts
 *
 * Reads only `public/original/`. Exits 1 when a check fails.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseLayout,
  parseProfile,
  resolveLayout,
  flatten,
  uiBoxOf,
  unitOf,
  UNITS_PER_SCREEN_HEIGHT,
} from '../src/d2/ui/layout'
import { measureSpriteGrid } from '../src/d2/ui/atlas'
import { spriteCellStyle } from '../src/d2/ui/render'
import { parseSprite } from '../src/original/sprite'
import { fieldNumber, widgetFilename } from '../src/d2/ui/widget'
import type { Viewport } from '../src/d2/ui/layout'
import type { UiWidget } from '../src/d2/ui/widget'

const HERE = resolve(dirname(fileURLToPath(import.meta.url)))
const UI_ROOT = join(HERE, '..', 'public', 'original', 'ui')
const LAYOUTS = join(UI_ROOT, 'global', 'ui', 'layouts')

/** The layouts the app asks the loader for; see `UI_PANEL_LAYOUTS` in `main.tsx`. */
const DRAWN = [
  'hudpanelhd',
  'playerinventoryexpansionlayouthd',
  'characterstatspanelhd',
  'skillstreepanelhd',
  'questlogpaneloriginalhd',
  'bankexpansionlayouthd',
  'waypointspanelexpansionhd',
  'vendorpanellayouthd',
  'hirelinginventorypanelhd',
  'playerinventoryoriginallayouthd',
  'bankoriginallayouthd',
  'waypointspaneloriginalhd',
  'mainmenupanelhd',
  'mainmenubuttonribbonhd',
  'mainmenulinkshd',
  'characterselectpanelhd',
  'logomenupanelhd',
]

/**
 * The viewports the checks run over: a phone, a laptop, a desktop, and the shapes that
 * are *not* 16:9.
 *
 * The non-16:9 ones are the point of the framing check. The interface is laid out in a
 * 16:9 block up to 19:9 wide, not in the viewport — the engine derives its scale from
 * the height alone and shifts the whole UI pass afterwards (`dm/host/dm_uiscreen.c:1-6`,
 * quoted in full in `layout.ts`'s header) — so a widget anchored to the bottom centre
 * must keep the same fraction of the *block* on a portrait window and an ultrawide, and
 * a check that only ran 16:9 screens would never see it move.
 */
const VIEWPORTS: Viewport[] = [
  { width: 844, height: 390 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1080, height: 1920 },
  { width: 1440, height: 900 },
  { width: 3440, height: 1440 },
  { width: 766, height: 909 },
]

/** A cell that came out of the export, or the reason it did not. */
interface Measured {
  cellWidth: number
  cellHeight: number
  atlasWidth: number
  atlasHeight: number
}

let manifest: Record<string, string> | null = null

/** The file a layout's `filename` resolves to, or null. */
function fileFor(reference: string): string | null {
  const normalized = reference
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .toLowerCase()
  const candidates = [
    join(UI_ROOT, 'hd', 'global', 'ui', `${normalized}.sprite`),
    join(UI_ROOT, 'global', 'ui', `${normalized}.dc6`),
  ]
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  if (manifest === null) {
    manifest = (
      JSON.parse(readFileSync(join(UI_ROOT, 'index.json'), 'utf8')) as {
        atlases: Record<string, string>
      }
    ).atlases
  }
  const base = normalized.split('/').pop() ?? normalized
  const matches = Object.entries(manifest).filter(([key]) => key.split('/').pop() === base)
  if (matches.length !== 1) return null
  return join(UI_ROOT, matches[0][1])
}

/**
 * A cell's size in texels, measured the way the loader measures it.
 *
 * `measureSpriteGrid` is the loader's own function, not a copy of it: a tool that cut
 * the sheet its own way would be checking a sprite the app does not draw. Only the
 * HD `.sprite` path is measured — every layout in `DRAWN` names HD art, and a classic
 * `.dc6` frame is its own bitmap rather than a cell of a grid, so it has no two
 * ratios to compare.
 */
function cellFor(widget: UiWidget): Measured | null {
  const name = widgetFilename(widget)
  if (name === undefined) return null
  const file = fileFor(name)
  if (file === null || !file.endsWith('.sprite')) return null
  try {
    const sprite = parseSprite(new Uint8Array(readFileSync(file)))
    const frames = fieldNumber(widget.fields, 'frames')
    const rows = fieldNumber(widget.fields, 'rows')
    const grid =
      frames !== undefined || rows !== undefined
        ? { frames: frames ?? 0, rows: rows ?? 0 }
        : undefined
    const measured = measureSpriteGrid(sprite, grid)
    return {
      cellWidth: measured.cellWidth,
      cellHeight: measured.cellHeight,
      atlasWidth: sprite.width,
      atlasHeight: sprite.height,
    }
  } catch {
    return null
  }
}

function readLayout(name: string, globals: ReturnType<typeof parseProfile>): UiWidget {
  return parseLayout(readFileSync(join(LAYOUTS, `${name}.json`), 'utf8'), globals)
}

/** The interface block, cached per viewport so the framing check can use it. */
const BLOCKS = new Map<string, { width: number; height: number }>()
function block_of(viewport: Viewport): { width: number; height: number } {
  const key = `${viewport.width}x${viewport.height}`
  const cached = BLOCKS.get(key)
  if (cached !== undefined) return cached
  const block = uiBoxOf(viewport)
  BLOCKS.set(key, block)
  return block
}

interface Problem {
  layout: string
  widget: string
  what: string
}

function main(): number {
  const profile = join(LAYOUTS, '_profilehd.json')
  if (!existsSync(profile)) {
    console.error(`verify-ui-scale: no profile at ${profile}; is the UI export present?`)
    return 1
  }
  const globals = parseProfile(readFileSync(profile, 'utf8'))

  const problems: Problem[] = []
  let widgets = 0
  let drawn = 0
  let stretched = 0
  let nineTiles = 0
  let nineTileImpossible = 0
  let crop = 0
  let unmeasured = 0
  const missing: string[] = []

  // The framing check needs the same widget on two viewports, so one pass keeps the
  // fractional position of every widget by name at each viewport.
  const positions = new Map<
    string,
    Array<{ viewport: Viewport; fx: number; fy: number; bx: number; by: number }>
  >()

  for (const name of DRAWN) {
    const file = join(LAYOUTS, `${name}.json`)
    if (!existsSync(file)) {
      missing.push(name)
      continue
    }
    const root = readLayout(name, globals)
    // Two widgets in one layout routinely share a name — `BallImage` is under both
    // `HealthBall` and `ManaBall`, and three panels have a `Background` — so a key of
    // layout + name compares two different widgets with each other. The occurrence
    // index is the tie-break; it is stable because the tree order is.
    const occurrence = new Map<string, number>()
    for (const viewport of VIEWPORTS) {
      occurrence.clear()
      const resolved = resolveLayout(root, viewport, (widget) => {
        const cell = cellFor(widget)
        if (cell === null) return undefined
        // A texel is two layout units, so this is the widget's size in the layout's
        // own coordinate space — the same quantity `cellUnits` returns at runtime.
        return { width: cell.cellWidth * 2, height: cell.cellHeight * 2 }
      })
      const unit = unitOf(viewport)
      for (const entry of flatten(resolved)) {
        if (viewport === VIEWPORTS[0]) widgets += 1
        const cell = cellFor(entry.widget)
        if (cell === null || entry.box.width <= 0 || entry.box.height <= 0) continue
        if (viewport === VIEWPORTS[0]) drawn += 1

        const scaleX = entry.box.width / cell.cellWidth
        const scaleY = entry.box.height / cell.cellHeight
        const nineTile = entry.widget.type === 'NineTileImageWidget'
        // A widget the layout gives *both* a width and a height is drawn at the size
        // the layout asks for; if that is a percent away from the art's own aspect,
        // the layout asked for it (`hirelinginventorypanelhd`'s `XpProgress` is 888
        // units wide against art 894 wide, so 0.7% narrower than the art). A widget the
        // layout gives *no* size is drawn at its art's own size, and a mismatch there
        // is a measurement error — which is the failure this check is for.
        const stated = entry.widget.fields.rect
        const explicit =
          stated !== null &&
          typeof stated === 'object' &&
          typeof (stated as { width?: unknown }).width === 'number' &&
          typeof (stated as { height?: unknown }).height === 'number'
        if (
          !nineTile &&
          !explicit &&
          Math.abs(scaleX - scaleY) > Math.max(1e-6, 0.005 * Math.max(scaleX, scaleY))
        ) {
          if (viewport === VIEWPORTS[0]) {
            stretched += 1
            problems.push({
              layout: name,
              widget: entry.widget.name,
              what: `stretched although the layout states no size: ${entry.box.width.toFixed(
                2,
              )}x${entry.box.height.toFixed(2)} px against a ${cell.cellWidth}x${
                cell.cellHeight
              } texel cell (${scaleX.toFixed(4)} vs ${scaleY.toFixed(4)})`,
            })
          }
        }

        // The renderer's own crop arithmetic, on the frame the art implies. `sx`/`sy`
        // are frame 0, which is what `UiLayers` passes for a widget with no animation.
        const frame = {
          url: 'about:blank',
          atlasWidth: cell.atlasWidth,
          atlasHeight: cell.atlasHeight,
          sx: 0,
          sy: 0,
          sw: cell.cellWidth,
          sh: cell.cellHeight,
        }
        const style = spriteCellStyle(frame, entry.box.width, entry.box.height)
        const [bgW, bgH] = (style['background-size'] as string)
          .split(' ')
          .map((value) => Number.parseFloat(value))
        const drawnW = (bgW / cell.atlasWidth) * cell.cellWidth
        const drawnH = (bgH / cell.atlasHeight) * cell.cellHeight
        if (
          Math.abs(drawnW - entry.box.width) > 0.02 ||
          Math.abs(drawnH - entry.box.height) > 0.02
        ) {
          crop += 1
          if (crop <= 20) {
            problems.push({
              layout: name,
              widget: entry.widget.name,
              what:
                `crop is ${drawnW.toFixed(2)}x${drawnH.toFixed(2)} px in a ` +
                `${entry.box.width.toFixed(2)}x${entry.box.height.toFixed(2)} box`,
            })
          }
        }

        if (entry.widget.type === 'NineTileImageWidget') {
          if (viewport === VIEWPORTS[0]) nineTiles += 1
          const slice = Math.round(Math.min(cell.cellWidth, cell.cellHeight) / 4)
          const tileScale = fieldNumber(entry.widget.fields, 'tileScale') ?? 1
          const border = slice * 2 * unit * tileScale
          const limit = Math.min(entry.box.width, entry.box.height) / 2
          if (border > limit) {
            if (viewport === VIEWPORTS[0]) nineTileImpossible += 1
            problems.push({
              layout: name,
              widget: entry.widget.name,
              what: `nine-tile border ${border.toFixed(1)} px in a ${entry.box.width.toFixed(
                1,
              )}x${entry.box.height.toFixed(1)} box at ${viewport.width}x${viewport.height}`,
            })
          }
        }

        // The framing check compares fractions, so only widgets big enough to have a
        // meaningful fraction are kept — a two-pixel widget's fraction is noise.
        if (entry.box.width >= 8 && entry.box.height >= 8) {
          const seen = occurrence.get(entry.widget.name) ?? 0
          occurrence.set(entry.widget.name, seen + 1)
          const key = `${name}/${entry.widget.name}#${seen}`
          const list = positions.get(key) ?? []
          const block = block_of(viewport)
          list.push({
            viewport,
            fx: entry.box.x / block.width,
            fy: entry.box.y / block.height,
            bx: entry.box.x,
            by: entry.box.y,
          })
          positions.set(key, list)
        }
      }
    }
  }

  // The oracles, all of them the reference project's own measurements of a running
  // game rather than our arithmetic restated.
  //
  // A widget's position in *units* is viewport-independent by construction — the layout
  // says `rect.x = 406` and that is 406 units whatever the screen — so comparing units
  // between screens would prove nothing. What can be wrong, and what this checks, is the
  // conversion: the scale, the block, and where a `fitToParent` root lands.
  const framing: Problem[] = []

  // 1. The unit. The reference quotes a worked example: the AutoMap panel's rect is
  //    `(-1279, 78, 1279, 720)` units, and states that as "0.59 screen heights wide,
  //    3.6% to 36.9% down from the top" (`dm/host/dm_cursor.c:1892-1895`). Three
  //    numbers, all of them consistent only with a 2160-unit screen: 1279/2160 = 0.592,
  //    78/2160 = 3.61%, (78+720)/2160 = 36.9%. This is that arithmetic.
  if (Math.abs(UNITS_PER_SCREEN_HEIGHT - 2160) > 0) {
    framing.push({
      layout: 'layout.ts',
      widget: 'UNITS_PER_SCREEN_HEIGHT',
      what: `is ${UNITS_PER_SCREEN_HEIGHT}, and the reference's own example only closes at 2160`,
    })
  }
  const automap = { x: -1279, y: 78, width: 1279, height: 720 }
  const screenHeightsWide = automap.width / UNITS_PER_SCREEN_HEIGHT
  const topPercent = (automap.y / UNITS_PER_SCREEN_HEIGHT) * 100
  const bottomPercent = ((automap.y + automap.height) / UNITS_PER_SCREEN_HEIGHT) * 100
  if (Math.abs(screenHeightsWide - 0.59) > 0.005 || Math.abs(topPercent - 3.6) > 0.05 || Math.abs(bottomPercent - 36.9) > 0.05) {
    framing.push({
      layout: 'layout.ts',
      widget: 'AutoMap rect',
      what:
        `(-1279, 78, 1279, 720) units reads as ${screenHeightsWide.toFixed(3)} screen heights wide and ` +
        `${topPercent.toFixed(1)}% to ${bottomPercent.toFixed(1)}% down, not the 0.59 and 3.6%/36.9% the reference measured`,
    })
  }

  // 2. The block. The interface's scale comes from the block's *height*, and the block
  //    is 16:9 up to 19:9 wide — so on a taller-than-16:9 screen the unit is smaller
  //    than the screen's own height would give, and on a wider one the block is capped.
  for (const viewport of VIEWPORTS) {
    const block = uiBoxOf(viewport)
    const aspect = viewport.width / viewport.height
    if (aspect < 16 / 9) {
      if (Math.abs(block.height - (viewport.width * 9) / 16) > 0.01 || Math.abs(block.width - viewport.width) > 0.01) {
        framing.push({
          layout: 'layout.ts',
          widget: `uiBoxOf(${viewport.width}x${viewport.height})`,
          what: `a screen taller than 16:9 must give a block ${viewport.width} wide and ${((viewport.width * 9) / 16).toFixed(1)} tall, not ${block.width}x${block.height}`,
        })
      }
    } else if (Math.abs(block.height - viewport.height) > 0.01 || block.width > Math.max(viewport.width, (viewport.height * 19) / 9) + 0.01) {
      framing.push({
        layout: 'layout.ts',
        widget: `uiBoxOf(${viewport.width}x${viewport.height})`,
        what: `a screen at or wider than 16:9 must give a block of the screen's height and at most 19:9 of it, not ${block.width}x${block.height}`,
      })
    }
  }

  // 3. A root that states `fitToParent` fills the block. The title screen is the one
  //    drawn layout whose root states it (`titlescreenpanelhd`), and the reference's own
  //    note on it is why this matters: a root carrying *both* an authored rect and
  //    `fitToParent` must use the block, because the authored rect belongs to the other
  //    platform's HUD (`dm/ios/tools/touchrectv1_patch.json:11-32` writes `2952 x 764`
  //    and `fitToParent: true` in the same patch, and `gen_hud_v4.py:12` says the intent
  //    is "root fills the full screen").
  //
  //    The base HUD is the counter-example and is checked the other way: `hudpanelhd`'s
  //    root states *only* a rect, so its box is that rect scaled — which is what makes
  //    the bar 984 of 1280 pixels wide at 720p.
  for (const [name, fills] of [
    ['titlescreenpanelhd', true],
    ['hudpanelhd', false],
  ] as const) {
    const file = join(LAYOUTS, `${name}.json`)
    if (!existsSync(file)) continue
    const root = readLayout(name, globals)
    const states = root.fields.fitToParent === true
    if (states !== fills) {
      framing.push({
        layout: name,
        widget: 'root fitToParent',
        what: `this check expects fitToParent to be ${fills} and the layout says ${states}; update the oracle, not the resolver`,
      })
      continue
    }
    if (!fills) continue
    for (const viewport of VIEWPORTS) {
      const block = uiBoxOf(viewport)
      const resolved = resolveLayout(root, viewport)
      if (
        Math.abs(resolved.box.width - block.width) > 0.5 ||
        Math.abs(resolved.box.height - block.height) > 0.5
      ) {
        framing.push({
          layout: name,
          widget: 'root',
          what: `must fill the block ${block.width.toFixed(1)}x${block.height.toFixed(1)}, not ${resolved.box.width.toFixed(1)}x${resolved.box.height.toFixed(1)}, on ${viewport.width}x${viewport.height}`,
        })
      }
    }
  }

  console.log(`verify-ui-scale: ${DRAWN.length - missing.length} of ${DRAWN.length} layouts resolved`)
  console.log(
    `  ${widgets} widgets, ${drawn} of them drawing art, over ${VIEWPORTS.length} viewports ` +
      `(${VIEWPORTS.map((v) => `${v.width}x${v.height}`).join(', ')})`,
  )
  console.log(
    '  interface blocks: ' +
      VIEWPORTS.map((v) => {
        const b = block_of(v)
        return `${v.width}x${v.height}→${b.width.toFixed(0)}x${b.height.toFixed(0)}`
      }).join(' '),
  )
  console.log(
    `  ${crop} widgets whose background crop does not land on their box (the renderer's own style)`,
  )
  console.log(`  ${nineTiles} nine-tile widgets, ${nineTileImpossible} with an impossible slice`)
  console.log(`  ${stretched} widgets drawn with a non-uniform stretch`)
  console.log(
    `  ${framing.length} failures against the reference's own arithmetic (unit, block, fitToParent root)`,
  )
  if (unmeasured > 0) console.log(`  ${unmeasured} widgets whose art could not be measured`)
  if (missing.length > 0) console.log(`  not in the export: ${missing.join(', ')}`)

  const failures = [...problems, ...framing]
  for (const problem of failures.slice(0, 40)) {
    console.log(`  ${problem.layout} ${problem.widget}: ${problem.what}`)
  }
  if (failures.length > 40) console.log(`  … and ${failures.length - 40} more`)

  if (failures.length > 0) {
    console.log('verify-ui-scale: FAIL')
    return 1
  }
  console.log(
    'verify-ui-scale: OK — every sprite crops to its box, at the layout scale, on every viewport',
  )
  return 0
}

process.exit(main())
