/**
 * Screens: a layout file, its profile, its strings and its atlases.
 *
 * The four pieces are deliberately separate modules — `jsonc`/`layout` read the
 * description, `atlas` supplies the art, `strings` supplies the words, `render`
 * draws — and this is where they meet. Nothing here knows what any particular
 * screen is: a screen is a layout name.
 *
 * ## Loading
 *
 * A layout references a profile (`_profilehd.json` for the HD interface) whose
 * named globals every field may point at, so the profile is fetched first and the
 * layout parsed against it. Both are optional: a missing profile parses the
 * layout with its `$Name` references left as strings, and a missing layout is
 * `null`, so a partially exported build shows the screens it has instead of
 * nothing at all.
 */

import { computed, ref, type SignalRef } from '@rasenjs/reactive-signals'
import { when } from '@rasenjs/dom'
import {
  parseLayout,
  parseProfile,
  resolveLayout,
  uiBoxOf,
  unitOf,
  type LayoutGlobals,
  type ResolvedWidget,
  type Viewport,
} from './layout'
import {
  renderScreen,
  renderWidget,
  UNITS_PER_TEXEL,
  type SpriteProvider,
  type UiFrame,
  type UiRenderOptions,
} from './render'
import type { UiAtlas, UiAtlasLoader } from './atlas'
import type { UiStrings } from './strings'
import type { UiWidget } from './widget'

/** The HD interface profile, which every `*hd` layout is written against. */
export const HD_PROFILE = '_profilehd'

/**
 * Where a layout file lives under the served UI root.
 *
 * The export mirrors the package, so the tree is `original/ui/global/ui/layouts/`
 * and not a flattened one — the same shape the atlases keep, which is what lets a
 * caller see the package path in the file path.
 */
export function layoutFileFor(name: string): string {
  return `original/ui/global/ui/layouts/${name.toLowerCase()}.json`
}

export interface UiScreenSource {
  /** The parsed layout, or null when it has not been exported. */
  layout(name: string): Promise<UiWidget | null>
  readonly sprites: SpriteProvider
  readonly strings: UiStrings
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * Builds the source a screen reads from.
 *
 * The profile is cached because every screen uses the same one and it is 12 KB;
 * layouts are cached too, since opening and closing a panel re-reads it.
 */
export function createUiSource(base: string, sprites: SpriteProvider, strings: UiStrings): UiScreenSource {
  const profiles = new Map<string, Promise<LayoutGlobals | undefined>>()
  const layouts = new Map<string, Promise<UiWidget | null>>()

  const profile = (name: string): Promise<LayoutGlobals | undefined> => {
    const cached = profiles.get(name)
    if (cached !== undefined) return cached
    const loading = (async (): Promise<LayoutGlobals | undefined> => {
      const text = await fetchText(`${base}original/ui/global/ui/layouts/${name}.json`)
      if (text === null) return undefined
      try {
        return parseProfile(text)
      } catch (error) {
        console.warn(`rasen: profile ${name} did not parse`, String(error))
        return undefined
      }
    })()
    profiles.set(name, loading)
    return loading
  }

  return {
    sprites,
    strings,
    layout: (name: string): Promise<UiWidget | null> => {
      const key = name.toLowerCase()
      const cached = layouts.get(key)
      if (cached !== undefined) return cached
      const loading = (async (): Promise<UiWidget | null> => {
        const text = await fetchText(`${base}${layoutFileFor(name)}`)
        if (text === null) return null
        const globals = await profile(HD_PROFILE)
        try {
          return parseLayout(text, globals)
        } catch (error) {
          console.warn(`rasen: layout ${name} did not parse`, String(error))
          return null
        }
      })()
      layouts.set(key, loading)
      return loading
    },
  }
}

/**
 * A synchronous sprite provider built from an asynchronously loaded set.
 *
 * Rendering cannot await: the DOM pass is synchronous, and a widget whose atlas
 * had not arrived would either be skipped for a frame or drawn at the wrong size.
 * So the atlases a screen needs are collected from its widget tree first, loaded
 * once, and then read synchronously. `frames`/`rows` come from the widget that
 * named the atlas, because that is where the layout states the grid.
 *
 * A name that fails to load is remembered as failed rather than retried per
 * widget: the same missing file would otherwise be fetched once per frame.
 */
export async function loadScreenSprites(
  loader: UiAtlasLoader,
  root: UiWidget,
): Promise<SpriteProvider> {
  const grids = new Map<string, { frames?: number; rows?: number }>()
  const walk = (widget: UiWidget): void => {
    const name = typeof widget.fields.filename === 'string' ? widget.fields.filename : undefined
    if (name !== undefined && name !== '' && !grids.has(name)) {
      // A nine-tile widget draws the sheet as one picture and stretches its edges,
      // so it asks for one frame whatever the sheet's own frame grid is. Without
      // this the tooltip border — 252x24 with a header that reads as 11 frames —
      // would be sliced out of a single 22-texel cell and the nine-slice would
      // then be built from that.
      if (widget.type === 'NineTileImageWidget') {
        grids.set(name, { frames: 1, rows: 1 })
      } else {
        const frames = typeof widget.fields.frames === 'number' ? widget.fields.frames : undefined
        const rows = typeof widget.fields.rows === 'number' ? widget.fields.rows : undefined
        grids.set(name, { frames, rows })
      }
    }
    for (const child of widget.children) walk(child)
  }
  walk(root)

  const loaded = new Map<string, UiAtlas | null>()
  await Promise.all(
    [...grids].map(async ([name, grid]) => {
      loaded.set(name, await loader.load(name, grid))
    }),
  )

  const missing = [...loaded].filter(([, atlas]) => atlas === null).map(([name]) => name)
  if (missing.length > 0) {
    console.warn(
      `rasen: ${missing.length} of ${loaded.size} atlases for "${root.name}" are not exported: ` +
        missing.slice(0, 6).join(', ') +
        (missing.length > 6 ? ` … (${missing.length - 6} more)` : ''),
    )
  }

  const atlasOf = (name: string): UiAtlas | null => loaded.get(name) ?? null

  return {
    frame: (name: string, index: number): UiFrame | null => {
      const atlas = atlasOf(name)
      if (atlas === null) return null
      const cell = atlas.frame(index)
      return {
        url: atlas.url,
        atlasWidth: atlas.width,
        atlasHeight: atlas.height,
        sx: cell.sx,
        sy: cell.sy,
        sw: cell.sw,
        sh: cell.sh,
      }
    },
    cellUnits: (name: string): { width: number; height: number } | null => {
      const atlas = atlasOf(name)
      if (atlas === null) return null
      // A texel is 2 layout units — the ratio the reference measured on the
      // original, which is why a widget with no rect still lands at the right size.
      return { width: atlas.frameWidth * UNITS_PER_TEXEL, height: atlas.frameHeight * UNITS_PER_TEXEL }
    },
    cellCount: (name: string): number => {
      const atlas = atlasOf(name)
      return atlas === null ? 0 : atlas.columns * atlas.rows
    },
  }
}

/** A parsed screen, ready to resolve and draw. */
export interface UiScreen {
  readonly root: UiWidget
  readonly viewport: Viewport
}

/**
 * Resolves a screen for a viewport.
 *
 * The art's own size is given to the resolver for widgets whose rect omits a
 * width or height, which the layouts do constantly — `Ribbon`, `Logo`,
 * `FullGlow` in the main menu all carry only a position. A texel is 2 layout
 * units, the ratio the reference measured on the original.
 */
export function resolveScreen(
  root: UiWidget,
  viewport: Viewport,
  sprites: SpriteProvider,
): ResolvedWidget {
  return resolveLayout(root, viewport, (widget) => {
    const name = typeof widget.fields.filename === 'string' ? widget.fields.filename : undefined
    return name === undefined ? undefined : (sprites.cellUnits(name) ?? undefined)
  })
}

/**
 * A ticker the animated widgets share.
 *
 * The layouts carry `fps` per animated widget, and the numbers differ on purpose
 * (`fps: 24, // To not be in sync with mana`), so a single clock with a per
 * widget frame index keeps them out of phase as the game intends.
 */
export function createAnimationClock(
  elapsed: SignalRef<number>,
  sprites: SpriteProvider,
): {
  frameIndex(widget: ResolvedWidget): number
  advance(dtMs: number): void
} {
  let seconds = 0
  return {
    frameIndex: (widget: ResolvedWidget): number => {
      const fps = typeof widget.widget.fields.fps === 'number' ? widget.widget.fields.fps : 0
      if (fps <= 0) {
        // A grid image widget picks its cell from `image`/`index` rather than time.
        const fixed = widget.widget.fields.image ?? widget.widget.fields.index
        return typeof fixed === 'number' ? fixed : 0
      }
      const name = typeof widget.widget.fields.filename === 'string' ? widget.widget.fields.filename : ''
      const cell = sprites.cellCount(name)
      if (cell <= 1) return 0
      return Math.floor(seconds * fps) % cell
    },
    advance: (dtMs: number): void => {
      seconds += dtMs / 1000
      elapsed.value = seconds
    },
  }
}

/**
 * A set of layouts loaded together, sharing one sprite provider.
 *
 * Screens overlap in the game: the in-game HUD is one layout, the panels that
 * open over it are others, and they name many of the same atlases. Loading them
 * as a set fetches each atlas once, and giving them one provider means a widget
 * in any of them measures and crops identically.
 */
export interface UiLayerSet {
  source: UiScreenSource
  viewport: Viewport
  /** The parsed layouts, by the name they were asked for. */
  roots: ReadonlyMap<string, UiWidget>
}

export async function loadUiLayers(
  base: string,
  loader: UiAtlasLoader,
  strings: UiStrings,
  viewport: Viewport,
  names: readonly string[],
): Promise<UiLayerSet | null> {
  const scratch = createUiSource(base, emptySpriteProvider(), strings)
  const parsed: UiWidget[] = []
  const roots = new Map<string, UiWidget>()
  await Promise.all(
    names.map(async (name) => {
      const widget = await scratch.layout(name)
      if (widget === null) return
      parsed.push(widget)
      roots.set(name, widget)
    }),
  )
  if (roots.size === 0) return null

  const sprites = await loadScreenSprites(loader, {
    type: 'Widget',
    name: 'layers',
    fields: {},
    children: parsed,
  })
  return { source: createUiSource(base, sprites, strings), viewport, roots }
}

/** A provider that finds nothing, for the pass that only reads layouts. */
export function emptySpriteProvider(): SpriteProvider {
  return { frame: () => null, cellUnits: () => null, cellCount: () => 0 }
}

/**
 * Every widget of a layer set, resolved and drawn.
 *
 * Each layout is its own tree with its own root anchor, so they are drawn as
 * siblings rather than nested: the HUD's bar anchors to the bottom of the screen
 * and a panel anchors to the middle, and nesting one in the other would move it.
 */
export function UiLayers(props: {
  layers: UiLayerSet
  names: readonly string[]
  frameIndex?: (widget: ResolvedWidget) => number
  onActivate?: (widget: ResolvedWidget, event: Event) => void
  text?: (widget: ResolvedWidget) => string | undefined
  /** A name prefix to skip, for a layout whose widgets this app draws itself. */
  skip?: (widget: ResolvedWidget) => boolean
}) {
  const layers = props.layers
  const resolved = new Map<string, ResolvedWidget>()
  for (const [name, widget] of layers.roots) {
    resolved.set(name, resolveScreen(widget, layers.viewport, layers.source.sprites))
  }
  // The wrapper is the interface box, and it sits at its parent's origin **on purpose**.
  //
  // The block's *position* belongs to the one ancestor of everything the interface
  // draws, not to each `UiLayers`: a screen is drawn by several of these (the bar, then
  // each open panel) plus a great deal the app draws itself — the globes' liquid, an
  // item on a grid, a panel's rows — and every one of those boxes is in interface
  // coordinates. When the offset lived here, the layouts got it and the app's own
  // content did not, so on a screen that is not 16:9 the globes' fill sat exactly one
  // block-height above their own art. `hud.tsx`'s `.hud-layer` carries it instead, and
  // `uiOffsetOf` is documented there as the single place it is applied.
  const ui = uiBoxOf(layers.viewport)
  const style: Record<string, string> = {
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: `${ui.width}px`,
    height: `${ui.height}px`,
    'pointer-events': 'none',
  }
  const drawn: unknown[] = []
  for (const name of props.names) {
    const root = resolved.get(name)
    if (root === undefined) continue
    drawn.push(
      renderWidget(root, {
        sprites: layers.source.sprites,
        unit: unitOf(layers.viewport),
        frameIndex: props.frameIndex,
        onActivate: props.onActivate,
        text: props.text,
        skip: props.skip,
      }) as never,
    )
  }
  return (
    <div data-ui-layers="" style={style}>
      {drawn as never[]}
    </div>
  )
}

export interface UiScreenViewProps extends UiRenderOptions {
  /** The layout is rendered once it has been fetched. */
  screen: SignalRef<ResolvedWidget | null>
  viewport: Viewport
}

/**
 * Renders the fetched screen, or nothing.
 *
 * The condition is a `computed` rather than a plain read because this framework
 * calls a function child once: a plain read would freeze on the null the screen
 * had before its layout arrived.
 */
export function UiScreenView(props: UiScreenViewProps) {
  const screen = props.screen
  const viewport = props.viewport
  const present = computed(() => screen.value !== null)
  const draw = (): unknown => {
    const resolved = screen.value
    if (resolved === null) return null
    const options: UiRenderOptions = {
      sprites: props.sprites,
      frameIndex: props.frameIndex,
      onActivate: props.onActivate,
      text: props.text,
    }
    return renderScreen(resolved, viewport, options)
  }
  return when({
    condition: () => present.value,
    then: () => draw() as never,
  })
}

export { computed, ref, UNITS_PER_TEXEL }
export type { UiFrame }
