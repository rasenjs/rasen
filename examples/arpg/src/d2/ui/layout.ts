/**
 * The layout engine: the game describes its interface, this walks that
 * description.
 *
 * A layout file is a tree of widgets. Each has a `type`, a `name`, a `fields`
 * bag and `children`. Almost all of the meaning lives in `fields.rect` (in
 * *layout units*, not pixels) and `fields.anchor` (a fraction of the parent),
 * with `fields.filename` naming the sprite.
 *
 * ## Units
 *
 * The scale the game uses was measured on the running original by the reference
 * project (`dm/ios/tools/gen_hud_v4.py`, "1 layout unit = screen height/2160"),
 * and it is the only way to make sense of the numbers: the HUD panel's root rect
 * is 2952 x 764 with `fitToParent` beside it, and on a raw pixel reading it would be
 * larger than any display.
 *
 * - `unit = uiBoxOf(viewport).height / 2160`.
 * - `fields.rect.width`/`height` are in units, so pixels are `units * unit`.
 * - One raw `.sprite` texel is **two units** (`UNITS_PER_TEXEL`), which is what makes
 *   a widget with only a `filename` measurable at all.
 * - `fields.rect.scale` multiplies the drawn size **rounded to one decimal**: the
 *   reference measured a scale written as 0.8182 behaving as 0.8, and positions have
 *   to be computed from the rounded value or the bar drifts.
 *
 * ## The interface is laid out in a 16:9 block, not in the viewport
 *
 * This is the correction the reference's own notes force, and it is the difference
 * between an interface that lines up and one that does not on every screen that is
 * not exactly 16:9.
 *
 * From `dm/host/dm_uiscreen.c:1-6`: the game has a pair of screen width/height
 * globals, **the interface derives its scale from the height alone and its placement
 * rectangle from width and height, and 3-D rendering and hit boxes do not read those
 * globals at all**; "when the frame is narrower than 16:9, write 'height' as
 * width/16*9, and the UI falls entirely within 16:9 while 3-D still fills the
 * screen". The UI is drawn flush with the top edge of the frame and the graphics layer
 * shifts the whole UI pass down to centre or bottom-align it. The UI pass's width is
 * capped at `2160 * 19/9 = 4560` units (`dm/tools/patch_nso.py:107-109`).
 *
 * So the interface's coordinate space is a box up to 19:9 wide and exactly 2160 units
 * tall, and its *height in pixels* is what a unit is derived from. On a 16:9 screen
 * that box is the screen and nothing here changes; on a portrait window, a 16:10
 * laptop or an ultrawide it is not, and using the viewport instead stretches every
 * anchored widget away from where the game puts it. `uiOffsetOf` is then where that box
 * sits on the screen, which is the second half of the engine's rule.
 *
 * ## Anchors
 *
 * A widget's `anchor` is a fraction of its parent's resolved box, so
 * `{"x": 0.5}` means "halfway across the parent". The widget's own `rect.x`/`y`
 * are offsets from that point. The root is anchored against the interface box, which
 * is how `{"x": 0.5, "y": 1}` puts the HUD bar along the bottom centre.

 * ## `fitToParent` and `fitToScreen`
 *
 * Two fields take a widget's size from somewhere other than its own `rect`, and both
 * are stated without one — so reading them as "no size" collapses the widget to a
 * point. `fitToScreen` is the interface box; `fitToParent` is the parent's resolved
 * box. The HUD's root states `fitToParent`, which is why its authored `2952 x 764`
 * must not be used as its box.
 *
 * ## Named globals
 *
 * `fields` values may be `"$Name"`, resolved against the profile
 * (`_profilehd.json`) before use — colours, font sizes, panel rects and anchors
 * all come through this. A reference to a name the profile does not define is
 * left as the literal string rather than thrown on, because exactly which
 * profile a layout needs depends on the platform it was written for.
 */

import type { UiRect, UiWidget } from './widget'
import { parseJsonc } from './jsonc'

/** Layout units per screen height. Measured, not chosen; see the file header. */
export const UNITS_PER_SCREEN_HEIGHT = 2160

/** The drawn size of a widget, in pixels, for one viewport. */
export interface ResolvedBox {
  x: number
  y: number
  width: number
  height: number
  /** The effective `fields.scale`, already rounded the way the game rounds it. */
  scale: number
}

export interface ResolvedWidget {
  widget: UiWidget
  box: ResolvedBox
  children: ResolvedWidget[]
}

export interface Viewport {
  width: number
  height: number
}

/** Named values from a profile file, e.g. `_profilehd.json`. */
export type LayoutGlobals = ReadonlyMap<string, unknown>

/**
 * Reads a profile into a name → value map.
 *
 * Globals refer to each other (`"FontColorGold": "$FontColorGoldYellow"`), so
 * resolution is against the profile's own table and is memoised per name. A
 * cycle leaves the literal string rather than looping, which is what a caller
 * reading an unresolved value would want to see.
 */
export function parseProfile(text: string): LayoutGlobals {
  const raw = parseJsonc(text)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('layout: a profile must be an object')
  }
  const table = raw as Record<string, unknown>
  const resolved = new Map<string, unknown>()

  const resolveName = (name: string, seen: Set<string>): unknown => {
    const cached = resolved.get(name)
    if (cached !== undefined || resolved.has(name)) return cached
    if (seen.has(name)) return `$${name}`
    seen.add(name)
    const value = resolveValue(table[name], seen, resolveName)
    seen.delete(name)
    resolved.set(name, value)
    return value
  }

  for (const name of Object.keys(table)) resolveName(name, new Set())
  return resolved
}

/** Resolves references against the profile's own table, not a prebuilt map. */
function resolveValue(
  value: unknown,
  seen: Set<string>,
  resolveName: (name: string, seen: Set<string>) => unknown,
): unknown {
  if (typeof value === 'string') {
    if (value.length < 2 || value[0] !== '$') return value
    return resolveName(value.slice(1), seen)
  }
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, seen, resolveName))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = resolveValue(entry, seen, resolveName)
    }
    return out
  }
  return value
}

/**
 * Replaces `"$Name"` references throughout a value.
 *
 * A reference is only a reference when the *whole* string is `$Name`, which is
 * how the game writes it; a string that merely contains a dollar sign is text.
 */
export function resolveRefs(
  value: unknown,
  globals: LayoutGlobals | undefined,
  internalSeen?: Set<string>,
): unknown {
  if (typeof value === 'string') {
    if (value.length < 2 || value[0] !== '$') return value
    const name = value.slice(1)
    if (globals === undefined || !globals.has(name)) return value
    const seen = internalSeen ?? new Set<string>()
    if (seen.has(name)) return value
    seen.add(name)
    const resolved = resolveRefs(globals.get(name), globals, seen)
    seen.delete(name)
    return resolved
  }
  if (Array.isArray(value)) return value.map((entry) => resolveRefs(entry, globals, internalSeen))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) out[key] = resolveRefs(entry, globals, internalSeen)
    return out
  }
  return value
}

/** Parses a layout file into a widget tree, with its `$` references resolved. */
export function parseLayout(text: string, globals?: LayoutGlobals): UiWidget {
  const raw = parseJsonc(text)
  return toWidget(resolveRefs(raw, globals))
}

function toWidget(value: unknown): UiWidget {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('layout: a widget must be an object')
  }
  const source = value as Record<string, unknown>
  const type = typeof source.type === 'string' ? source.type : 'Widget'
  const name = typeof source.name === 'string' ? source.name : ''
  const fields =
    source.fields !== null && typeof source.fields === 'object' && !Array.isArray(source.fields)
      ? (source.fields as Record<string, unknown>)
      : {}
  const rawChildren = Array.isArray(source.children) ? source.children : []
  return {
    type,
    name,
    fields,
    children: rawChildren.map((child) => toWidget(child)),
  }
}

/**
 * The box the interface is laid out in, in pixels.
 *
 * Up to 19:9 wide and exactly `UNITS_PER_SCREEN_HEIGHT` units tall; see the header for
 * where the rule comes from and why it is not the viewport. On a 16:9 screen this is
 * the screen, so nothing that was measured at 16:9 moves.
 */
export function uiBoxOf(viewport: Viewport): { width: number; height: number } {
  if (viewport.height <= 0 || viewport.width <= 0) return { width: 0, height: 0 }
  const SIXTEEN_NINE = 16 / 9
  const NINETEEN_NINE = 19 / 9
  const aspect = viewport.width / viewport.height
  if (aspect < SIXTEEN_NINE) {
    // Taller than 16:9. The interface is as wide as the screen and as tall as 16:9
    // across that width would be, so the rest of the screen is the world's.
    return { width: viewport.width, height: (viewport.width * 9) / 16 }
  }
  // Wider than 16:9: full height, and no wider than 19:9 — the cap the engine puts on
  // its UI canvas. A screen narrower than 19:9 therefore keeps all of its width.
  return { width: Math.min(viewport.width, viewport.height * NINETEEN_NINE), height: viewport.height }
}

/**
 * Where the interface block goes on the screen.
 *
 * The engine draws the interface flush with the *top* of the frame and then shifts the
 * whole interface pass: `dm/host/dm_uiscreen.c:51-52` gives its `yoff()` three values —
 * `0`, `(rh - uh) / 2` and `rh - uh` — for top, centre and bottom alignment, and says the
 * shift is the graphics layer's job rather than the layout's.
 *
 * The reference does not record which of the three a given screen gets, so this picks and
 * states one: **bottom-aligned on a screen taller than 16:9**, top-aligned otherwise.
 * The reason is the one the user sees — on a portrait window a top-aligned block puts the
 * HUD bar and every panel in the middle of the screen with world below them, and the game
 * puts its interface on the floor of the frame.
 */
export function uiOffsetOf(viewport: Viewport): { x: number; y: number } {
  const ui = uiBoxOf(viewport)
  if (ui.height <= 0) return { x: 0, y: 0 }
  const taller = viewport.height > ui.height + 0.5
  return {
    // Horizontally the block is the screen's width except past the 19:9 cap, where the
    // engine's own canvas is capped too; centring it is what a capped canvas means.
    x: (viewport.width - ui.width) / 2,
    y: taller ? viewport.height - ui.height : 0,
  }
}

/** The pixels one layout unit is worth at this viewport. */
export function unitOf(viewport: Viewport): number {
  return uiBoxOf(viewport).height / UNITS_PER_SCREEN_HEIGHT
}

/**
 * The scale factor the game actually applies.
 *
 * Rounded to a tenth because the original does: the reference measured a layout
 * scale of 0.8182 changing an image's width by 2.4%, i.e. behaving as 0.8.
 */
export function effectiveScale(rect: UiRect): number {
  const scale = typeof rect.scale === 'number' && Number.isFinite(rect.scale) ? rect.scale : 1
  return Math.round(scale * 10) / 10
}

/** A `{x, y}` field, defaulted, so callers never have to test for it. */
function pair(value: unknown, fallback = 0): { x: number; y: number } {
  if (value === null || typeof value !== 'object') return { x: fallback, y: fallback }
  const source = value as { x?: unknown; y?: unknown }
  return {
    x: typeof source.x === 'number' ? source.x : fallback,
    y: typeof source.y === 'number' ? source.y : fallback,
  }
}

/** The rect of a widget's `fields`, absent fields left absent. */
export function rectOf(widget: UiWidget): UiRect {
  const value = widget.fields.rect
  if (value === null || typeof value !== 'object') return {}
  const source = value as Record<string, unknown>
  return {
    x: typeof source.x === 'number' ? source.x : undefined,
    y: typeof source.y === 'number' ? source.y : undefined,
    width: typeof source.width === 'number' ? source.width : undefined,
    height: typeof source.height === 'number' ? source.height : undefined,
    scale: typeof source.scale === 'number' ? source.scale : undefined,
  }
}

/**
 * Resolves one widget's box against its parent's.
 *
 * `naturalSize` is the widget's art size in layout units, used when the rect
 * gives no width or height: an `ImageWidget` with only a `filename` is drawn at
 * its sprite's own size, which the caller knows and this does not.
 *
 * `screen` is the viewport box, and is read only by `fitToScreen`; see the comment
 * inside for the two fields that take the widget's size from somewhere other than its
 * own rect.
 */
export function resolveBox(
  widget: UiWidget,
  parent: ResolvedBox,
  unit: number,
  naturalUnits?: { width: number; height: number },
  screen?: { width: number; height: number },
): ResolvedBox {
  const rect = rectOf(widget)
  const anchor = pair(widget.fields.anchor)
  const scale = effectiveScale(rect)

  // Two fields ask for a box that is *not* in the widget's own coordinates, and both
  // are stated without a `rect` at all, so reading them as "no size" collapses the
  // widget to a point:
  //
  // - `fitToScreen: true` — the widget is the whole screen. `titlescreenpanelhd`'s
  //   `Background` (`RectangleWidget`) is one, as is `mainmenuloadingpanelhd`'s.
  // - `fitToParent: true` — the widget is its parent's box. Every screen's *root*
  //   states it, which is how a layout says "I am the viewport" without repeating the
  //   size.
  //
  // Six of the interface layouts state one of the two and, unhandled, drew their
  // background at the parent's origin with no extent. That is what the front end's
  // own pass was working around; it is the layout engine's job.
  const fillsScreen = widget.fields.fitToScreen === true && screen !== undefined
  const fillsParent = widget.fields.fitToParent === true
  if (fillsScreen || fillsParent) {
    const width = fillsScreen ? (screen as { width: number }).width : parent.width
    const height = fillsScreen ? (screen as { height: number }).height : parent.height
    return {
      x: parent.x + (rect.x ?? 0) * unit,
      y: parent.y + (rect.y ?? 0) * unit,
      width,
      height,
      scale,
    }
  }

  const widthUnits = rect.width ?? naturalUnits?.width ?? 0
  const heightUnits = rect.height ?? naturalUnits?.height ?? 0

  const x = parent.x + anchor.x * parent.width + (rect.x ?? 0) * unit
  const y = parent.y + anchor.y * parent.height + (rect.y ?? 0) * unit

  return {
    x,
    y,
    width: widthUnits * unit * scale,
    height: heightUnits * unit * scale,
    scale,
  }
}

/**
 * Resolves a whole tree.
 *
 * `naturalSize` is consulted per widget and may be undefined, in which case a
 * widget without a rect is zero-sized rather than guessed at — a caller that
 * wants the art's size can measure it before resolving.
 */
export function resolveLayout(
  root: UiWidget,
  viewport: Viewport,
  naturalSize?: (widget: UiWidget) => { width: number; height: number } | undefined,
): ResolvedWidget {
  const unit = unitOf(viewport)
  // The root is anchored against the *interface box*, not the viewport: that is what a
  // widget anchored to `{x: 0.5, y: 1}` is a fraction of.
  const ui = uiBoxOf(viewport)
  const viewportBox: ResolvedBox = {
    x: 0,
    y: 0,
    width: ui.width,
    height: ui.height,
    scale: 1,
  }

  const walk = (widget: UiWidget, parent: ResolvedBox): ResolvedWidget => {
    const box = resolveBox(widget, parent, unit, naturalSize?.(widget), ui)
    return { widget, box, children: widget.children.map((child) => walk(child, box)) }
  }

  return walk(root, viewportBox)
}

/** Every widget in a resolved tree, depth first — for counting and for tests. */
export function flatten(root: ResolvedWidget): ResolvedWidget[] {
  const out: ResolvedWidget[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop() as ResolvedWidget
    out.push(current)
    for (const child of current.children) stack.push(child)
  }
  return out
}
