/**
 * Drawing a resolved layout, in the DOM.
 *
 * The interface is the game's own widget tree, so this is a mapping from widget
 * `type` to a node plus a sprite, and almost nothing else. The four things that
 * carry meaning:
 *
 * | field | use |
 * | --- | --- |
 * | `rect`, `anchor` | where the widget goes, in layout units — `layout.ts` resolves these |
 * | `filename`, `frames`, `rows` | which atlas and which cell of it |
 * | `text`, `style`, `fontType` | what a text widget says and how it is drawn |
 * | `color` | a rectangle widget's fill, a colour from the profile |
 *
 * ## Why the DOM, and why `background-image`
 *
 * The HUD is DOM because the rest of this app's overlays are, and because a
 * widget tree is a tree of positioned boxes — which is what the DOM is. Cropping
 * one cell out of an atlas is then `background-image` plus a negative
 * `background-position`, the only way to address a sub-rectangle of an image in
 * CSS. That is why an atlas has to hand out a URL rather than a bitmap.
 *
 * A widget type this file does not know is drawn as a plain transparent box that
 * still lays out its children: the game has 199 widget types and most of them are
 * behaviour (scroll controllers, focus managers, tab bars), not appearance, so
 * an unknown type costs the interaction and not the picture.
 */

import { each } from '@rasenjs/core'
import type { ResolvedWidget, ResolvedBox, Viewport } from './layout'
import { uiBoxOf, unitOf } from './layout'
import { fieldNumber, widgetFilename, widgetText } from './widget'

/** One cell of an atlas, with a URL the DOM can crop from. */
export interface UiFrame {
  readonly url: string
  /** The whole atlas, in device pixels — `background-size`. */
  readonly atlasWidth: number
  readonly atlasHeight: number
  /** The cell, in device pixels — `background-position` and the box size. */
  readonly sx: number
  readonly sy: number
  readonly sw: number
  readonly sh: number
}

/**
 * Where the renderer gets its art.
 *
 * An interface rather than the loader itself so the renderer can be tested
 * against synthetic frames, and so a widget whose art is missing is a null here
 * rather than an exception in the middle of a screen.
 */
export interface SpriteProvider {
  /** The cell a widget shows at a given animation index, or null. */
  frame(name: string, index: number): UiFrame | null
  /**
   * One cell's size in **layout units**, for a widget whose rect gives none.
   *
   * Layout units, not pixels, because a widget with only a `filename` is drawn at
   * its sprite's own size and that size is part of the layout's coordinate space.
   */
  cellUnits(name: string): { width: number; height: number } | null
  /** How many cells the atlas holds, so an animation can wrap. 0 when unknown. */
  cellCount(name: string): number
}

/** Layout units per sprite texel. Measured by the reference; see `layout.ts`. */
export const UNITS_PER_TEXEL = 2

/** Widgets that show text. */
const TEXT_TYPES = new Set(['TextBoxWidget', 'InputTextBoxWidget', 'LabelWidget'])

/** Widgets whose only job is to receive pointer events. */
const CATCHER_TYPES = new Set(['ClickCatcherWidget', 'HoverWidget'])

export interface UiRenderOptions {
  sprites: SpriteProvider
  /** Animation frame per widget name, for widgets that animate. Defaults to 0. */
  frameIndex?: (widget: ResolvedWidget) => number
  /** A pointer handler, attached to widgets whose type can act. */
  onActivate?: (widget: ResolvedWidget, event: Event) => void
  /** Text a widget shows, when the layout leaves `text` empty. */
  text?: (widget: ResolvedWidget) => string | undefined
  /**
   * One layout unit in CSS pixels, from `unitOf(viewport)`.
   *
   * Needed only by the widgets that are measured in *texels* rather than in units
   * and have no rect to convert with — a nine-tile's border slice is a texel count,
   * and a texel is `UNITS_PER_TEXEL` units. A caller that omits it gets the texel
   * treated as a pixel, which is what a screen with no viewport would mean.
   */
  unit?: number
  /**
   * A widget to draw nothing for, children included.
   *
   * For art the loader cannot measure yet: drawing a mis-sized frame is worse than
   * drawing the caller's own stand-in, and skipping is the one decision only the
   * caller can make.
   */
  skip?: (widget: ResolvedWidget) => boolean
}

/**
 * The origin a widget's box is measured from, in pixels.
 *
 * A resolved box is **absolute**: `resolveBox` adds the parent's resolved origin,
 * so a nested widget's `box.x` already includes every ancestor. But `position:
 * absolute` is relative to the nearest positioned ancestor, which here is always the
 * parent element — so writing `left: box.x` double-counts every level of nesting and
 * a three-deep widget lands several hundred pixels away. Subtracting the parent's
 * origin once per level is what makes the two agree.
 *
 * The symptom that found this: the HUD's mini-menu buttons, two levels inside
 * `hudpanelhd`, measured at y ≈ 2457 on a 900-pixel viewport.
 */
interface Origin {
  x: number
  y: number
}

/**
 * One atlas cell, drawn at a given size, as CSS.
 *
 * The whole atlas is scaled so that the cell lands at `width` x `height` and then
 * offset by the scaled cell origin: CSS can address a sub-rectangle of an image no
 * other way. This is the only place that ratio is written down, because getting it
 * wrong is invisible — a sprite drawn at the wrong scale still paints.
 *
 * `mask` additionally clips the cell to its own alpha, which is what the HUD's liquid
 * fills need: the liquid is the globe's own art, and the globe's own silhouette is
 * what keeps it inside the glass.
 */
export function spriteCellStyle(
  frame: UiFrame,
  width: number,
  height: number,
  mask = false,
): Record<string, string> {
  const scaleX = width / frame.sw
  const scaleY = height / frame.sh
  const style: Record<string, string> = {
    'background-image': `url(${frame.url})`,
    'background-size': `${frame.atlasWidth * scaleX}px ${frame.atlasHeight * scaleY}px`,
    'background-position': `${-frame.sx * scaleX}px ${-frame.sy * scaleY}px`,
    'background-repeat': 'no-repeat',
    'background-color': 'transparent',
  }
  if (mask) {
    const size = style['background-size'] as string
    const position = style['background-position'] as string
    style['mask-image'] = `url(${frame.url})`
    style['mask-size'] = size
    style['mask-position'] = position
    style['mask-repeat'] = 'no-repeat'
    style['-webkit-mask-image'] = `url(${frame.url})`
    style['-webkit-mask-size'] = size
    style['-webkit-mask-position'] = position
    style['-webkit-mask-repeat'] = 'no-repeat'
  }
  return style
}

function imageStyle(box: ResolvedBox, frame: UiFrame, origin: Origin): Record<string, string> {
  // The cell is `sw` texels wide but the box may be a different size, so the
  // whole atlas is scaled by the ratio and offset by the scaled cell origin.
  // This is the only way to address a sub-rectangle of an image in CSS.
  //
  // The ratio is `box.width / sw` and **not** `box.width / (sw * UNITS_PER_TEXEL)`:
  // `box.width` is already CSS pixels, so dividing by the texel count is the whole
  // conversion and the units-per-texel ratio has already been spent computing the
  // box (`cellUnits` returns texels * `UNITS_PER_TEXEL` units, and `resolveBox`
  // multiplies by the unit). Dividing by it a second time drew every sprite at half
  // scale, so a 172-texel button cell filled half of its 145-pixel box and the other
  // half showed the next frame of the atlas. Measured on the real HUD's
  // `hudpanelhd` mini-menu: atlas 8096x175, cell 172x175, box 144.8x147.3 at a
  // 909-pixel viewport, which asks for a scale of 0.8417 — twice the `unit` of
  // 0.4208 the old expression produced.
  return {
    position: 'absolute',
    left: `${box.x - origin.x}px`,
    top: `${box.y - origin.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    ...spriteCellStyle(frame, box.width, box.height),
  }
}

function plainStyle(box: ResolvedBox, origin: Origin): Record<string, string> {
  return {
    position: 'absolute',
    left: `${box.x - origin.x}px`,
    top: `${box.y - origin.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  }
}

/** An RGBA array from a layout, whose alpha is a 0..1 fraction. */
function colourArray(value: unknown[]): string {
  const channel = (v: unknown, d: number): number => (typeof v === 'number' ? v : d)
  return `rgba(${channel(value[0], 0)}, ${channel(value[1], 0)}, ${channel(value[2], 0)}, ${channel(value[3], 1)})`
}

/** A colour from the profile, as CSS. */
function colourOf(value: unknown, fallback = 'transparent'): string {
  if (value === null || typeof value !== 'object') return fallback
  const c = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
  const channel = (v: unknown, d: number): number => (typeof v === 'number' ? v : d)
  const alpha = typeof c.a === 'number' ? c.a / 255 : 1
  return `rgba(${channel(c.r, 0)}, ${channel(c.g, 0)}, ${channel(c.b, 0)}, ${alpha})`
}

/**
 * A text widget's CSS, from the layout's own `style` block.
 *
 * The colour lives at `style.fontColor`, not `style.color`, and the size at
 * `style.pointSize` — outside the block, in counts. The layouts also carry
 * `style.fontFace`, which is the game's own face (`BlizzardGlobal`) and the one
 * this app ships.
 */
function textStyleOf(widget: ResolvedWidget, unit: number): Record<string, string> {
  const style: Record<string, string> = {
    'white-space': 'pre-wrap',
    'pointer-events': 'none',
    'font-family': 'var(--font-game)',
  }
  // A text widget whose layout states no height is clipped to nothing by `overflow`
  // and renders invisibly — the title screen's prompts and the character row's
  // `Level&Class` both did. Clipping is only meaningful when there is a box to clip
  // to, so it is set here rather than unconditionally.
  if (widget.box.height > 0) style.overflow = 'hidden'
  const raw = widget.widget.fields.style
  if (raw !== null && typeof raw === 'object') {
    const source = raw as Record<string, unknown>
    style.color = colourOf(source.fontColor ?? source.color, 'rgb(240, 240, 240)')
    const alignment = source.alignment
    if (alignment !== null && typeof alignment === 'object') {
      const a = alignment as { h?: unknown; v?: unknown }
      style['text-align'] =
        a.h === 'right' ? 'right' : a.h === 'center' || a.h === 'centre' ? 'center' : 'left'
      // Vertical placement is a flex decision, so the box has to be a flex
      // container for `align-items` to mean anything.
      style.display = 'flex'
      style['flex-direction'] = 'column'
      style['justify-content'] =
        a.v === 'bottom' ? 'flex-end' : a.v === 'center' || a.v === 'centre' ? 'center' : 'flex-start'
    }
    const leading = (source.spacing as { leading?: unknown } | undefined)?.leading
    if (typeof leading === 'number') style['line-height'] = String(leading)
    const shadow = source.dropShadow
    if (shadow !== null && typeof shadow === 'object') {
      const s = shadow as { shadowOffsetX?: unknown; shadowOffsetY?: unknown; shadowColor?: unknown }
      const ox = typeof s.shadowOffsetX === 'number' ? s.shadowOffsetX : 2
      const oy = typeof s.shadowOffsetY === 'number' ? s.shadowOffsetY : 2
      style['text-shadow'] = `${ox}px ${oy}px 0 ${colourOf(s.shadowColor, 'rgba(0,0,0,0.67)')}`
    }
  }
  // The size is `style.pointSize`, inside the block — not a field beside `rect` —
  // and it is in **layout units**, which is what the layouts' own arithmetic says:
  // comparing a text widget's `style.pointSize` with the `rect.height` of the same
  // widget gives 0.62 to 0.67 across `characterselectpanelhd` (28/42, 34/55),
  // `playerinventoryexpansionlayouthd` (32/48) and the rest, which is a font's em
  // against its line box and only means anything if the two are in the same unit.
  // Reading it as pixels drew every caption in every panel at the wrong size, and
  // reading it from the wrong place (`fields.pointSize`, where nothing states it)
  // drew them all at the browser's default. No `line-height` is set: the layouts
  // state their own `style.spacing.leading` where they want one, and inventing a
  // ratio for the rest would be a number the data does not carry.
  const rawStyle = widget.widget.fields.style
  const inBlock =
    rawStyle !== null && typeof rawStyle === 'object'
      ? (rawStyle as { pointSize?: unknown }).pointSize
      : undefined
  const pointSize =
    typeof inBlock === 'number' ? inBlock : fieldNumber(widget.widget.fields, 'pointSize')
  if (pointSize !== undefined) style['font-size'] = `${pointSize * unit}px`
  return style
}

/**
 * A nine-tile widget, stretched as the game stretches it.
 *
 * The border art is a frame: its corners keep their size and only the edges and
 * middle stretch, which is exactly what CSS `border-image` does. Drawing it as
 * one scaled image — the naive reading — smears the corners.
 *
 * `tileScale` scales the border width, and the slice is the corner size in the
 * art. The layouts do not state the slice, so it is taken as a quarter of the
 * smaller side of the cell, which is what the game's tooltip border measures and
 * is documented here rather than hidden.
 *
 * Exported because the app has one place that draws a frame the *layout* does not
 * describe: the NPC dialogue box, whose border the game names from code rather than
 * from a layout file. That box was computing its own `border-image` inline, with the
 * slice in texels read as pixels; this function is the one implementation of the
 * arithmetic, and `nineTileBorder` is the part a caller with no widget tree needs.
 */
export function nineTileBorder(
  frame: UiFrame,
  tileScale: number,
  unit: number,
): Record<string, string> {
  const slice = Math.round(Math.min(frame.sw, frame.sh) / 4)
  // `slice` counts texels and a border width is pixels, so the ratio is the same one
  // the sprite is drawn at: a texel is `UNITS_PER_TEXEL` units and a unit is `unit`
  // pixels. Reading the texel count as pixels drew the border 2.4x too thick at a
  // 909-pixel viewport.
  const border = Math.round(slice * UNITS_PER_TEXEL * unit * tileScale)
  return {
    'background-image': 'none',
    'border-image-source': `url(${frame.url})`,
    'border-image-slice': `${frame.sy + slice} ${frame.atlasWidth - frame.sx - frame.sw + slice} ${
      frame.atlasHeight - frame.sy - frame.sh + slice
    } ${frame.sx + slice}`,
    'border-image-width': `${border}px`,
    'border-image-repeat': 'stretch',
    'border-style': 'solid',
    'border-width': `${border}px`,
    'border-color': 'transparent',
    'box-sizing': 'border-box',
  }
}

function nineTileStyle(
  widget: ResolvedWidget,
  frame: UiFrame,
  base: Record<string, string>,
  unit: number,
): Record<string, string> {
  const tileScale = fieldNumber(widget.widget.fields, 'tileScale') ?? 1
  return { ...base, ...nineTileBorder(frame, tileScale, unit) }
}

/**
 * Renders one widget and its subtree.
 *
 * Every prop that comes from a call is bound to an identifier first: this
 * framework's JSX compiler wraps member and call expressions in getters, and a
 * `style={f(x)}` would hand the DOM the function's own source text instead of
 * the object.
 */
/*
 * The return type is `unknown` rather than the framework's child type because
 * that type is not exported. Both call sites cast, and the cast is the whole
 * cost of the omission.
 */
export function renderWidget(
  widget: ResolvedWidget,
  options: UiRenderOptions,
  origin: Origin = { x: 0, y: 0 },
): unknown {
  const type = widget.widget.type
  const box = widget.box
  const name = widgetFilename(widget.widget)
  const isText = TEXT_TYPES.has(type) && name === undefined
  const isCatcher = CATCHER_TYPES.has(type)

  const index = options.frameIndex?.(widget) ?? 0
  const frame = name === undefined ? null : options.sprites.frame(name, index)

  if (options.skip?.(widget) === true) return null

  let base = frame === null ? plainStyle(box, origin) : imageStyle(box, frame, origin)
  if (frame !== null && type === 'NineTileImageWidget') {
    base = nineTileStyle(widget, frame, base, options.unit ?? 1)
  }
  // A nine-tile widget's `backgroundColor` is an RGBA array whose alpha is a
  // fraction, unlike every other colour in the layouts.
  const background = widget.widget.fields.backgroundColor
  if (Array.isArray(background)) {
    base['background-color'] = colourArray(background)
  }

  // A button is a button whether or not its art has arrived.
  //
  // The frame decides nothing here, and using it did: an atlas loads asynchronously, so
  // the *first* render of a widget has `frame === null` and this was `false` — the
  // element was written `pointer-events: none` — while every later render had the frame
  // and computed `true`. The element is reused, its style binding is not re-read, and
  // the handler *is* patched in later, so the result was a widget that was drawn, whose
  // `pointerdown` worked when dispatched, and that no real click could reach. That is
  // exactly how the front end's Play button behaved.
  const isButton = type === 'ButtonWidget'
  const interactive = options.onActivate !== undefined && (frame !== null || isCatcher || isButton)
  const style: Record<string, string> = {
    ...base,
    'pointer-events': isCatcher || interactive ? 'auto' : 'none',
  }

  // Text can sit on three kinds of node: a text widget, a button whose caption
  // is drawn over its frame, and a plain widget carrying a `text` field.
  const caption = widgetText(widget.widget)
  let text: string | undefined
  if (isText || caption !== undefined) {
    Object.assign(style, textStyleOf(widget, options.unit ?? 1))
    text = options.text?.(widget) ?? caption ?? ''
  }

  const onActivate = options.onActivate
  const handler = interactive ? (event: Event) => onActivate?.(widget, event) : undefined

  const children: unknown[] = []
  if (text !== undefined) children.push(text)
  for (let i = 0; i < widget.children.length; i += 1) {
    // The child's origin is this widget's own resolved box, because that is what
    // its `position: absolute` is measured against.
    children.push(renderWidget(widget.children[i], options, { x: box.x, y: box.y }))
  }

  return (
    <div
      data-ui={widget.widget.name}
      data-ui-type={type}
      style={style}
      onPointerDown={handler}
    >
      {children as never[]}
    </div>
  )
}

/**
 * Renders a whole screen.
 *
 * `viewport` is the surface the units were resolved against, so the root box is
 * the viewport and every child is absolute within it.
 */
export function renderScreen(
  root: ResolvedWidget,
  viewport: Viewport,
  options: UiRenderOptions,
): unknown {
  // The wrapper is the interface box, not the viewport: a widget anchored to the
  // bottom of the interface must land at the bottom of a 16:9 block, so the block is
  // what the children are positioned inside.
  // Origin at the parent's, for the same reason `UiLayers`' wrapper is: the interface
  // block's position is applied once, by the container that holds everything the
  // interface draws. See `uiOffsetOf` in `layout.ts` and `.hud-layer` in `hud.tsx`.
  const ui = uiBoxOf(viewport)
  const style: Record<string, string> = {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${ui.width}px`,
    height: `${ui.height}px`,
    'pointer-events': 'none',
  }
  // `unit` is defaulted here rather than by every caller, because a screen always
  // has one. The options object is built as its own identifier first: the JSX
  // compiler resolves a call it can read and falls back to treating an unresolvable
  // one as **text**, so `renderWidget(root, { ...options, unit: … })` inside a child
  // position compiles to `renderText(content)` and throws "renderText() received a
  // function" at mount. Naming both the options and the result keeps the call in the
  // shape the compiler recognises.
  const resolved: UiRenderOptions = { ...options, unit: options.unit ?? unitOf(viewport) }
  // The call stays **in the child position**, and its options are an identifier. Both
  // halves matter: the JSX compiler only treats a child as a mountable when it can
  // read the call, so hoisting it to `const content = …` makes it fall back to text —
  // `renderText()` then throws "received a function", which is what this function did
  // from the day it was written. Nothing called it until the panel overlays did.
  return (
    <div data-ui-root={root.widget.name} style={style}>
      {renderWidget(root, resolved) as never}
    </div>
  )
}

/**
 * The text a widget shows, with its string-table key resolved.
 *
 * Kept apart from `renderWidget` so the screens can substitute live content — an
 * item name, a character's level — for a layout's placeholder without touching
 * the widget tree.
 */
export function widgetCaption(widget: ResolvedWidget, strings: (text: string | undefined) => string | undefined): string | undefined {
  return strings(widgetText(widget.widget))
}

export { each }
