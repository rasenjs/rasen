/**
 * The front end: the game's own main menu.
 *
 * Diablo II: Resurrected opens on a title screen and then on the main menu, and both
 * are the game's own layouts. This file is the sequence of them and the wiring
 * between them; nothing on screen is drawn here. The title screen is
 * `titlescreenpanelhd`; the menu is three layouts — the ribbon with the logo, the
 * flames and the Settings/Cinematics/Credits/Exit buttons
 * (`mainmenubuttonribbonhd`), the character list (`characterselectpanelhd`) and the
 * panel that carries the Play button (`mainmenupanelhd`) — and the loading panel
 * that covers the wait for the menu's own backdrop is `mainmenuloadingpanelhd`.
 * Every frame, tile, icon and word comes from those files: the art is the atlases
 * they name (`FrontEnd/HD/Final/FrontEnd_LeftPanel`, `FrontEnd_ButtonMed`,
 * `LogoAnimation/LogoAnimation`, `SplashScreen/splash_BlizzLogo`, …) and the captions
 * are resolved through the string tables the layouts are written against
 * (`@KeyboardTitleScreenPrompt`, `@strLaunchCharSelectNewX`, `@PlayTab`,
 * `@MessageOfTheDayTitle`, …).
 *
 * ## The flow
 *
 * ```
 *   mainmenuloadingpanelhd      titlescreenpanelhd            mainmenupanelhd +
 *   (the menu's backdrop    ->  "Press Any Key to Begin"  ->  mainmenubuttonribbonhd +
 *    bakes behind it)           any key, any tap              characterselectpanelhd
 * ```
 *
 * The gate between the first two is not decoration. The menu's backdrop is baked
 * from the game's own level files, which takes long enough to be worth covering, so
 * the loading panel stands over that work and the title screen does not appear until
 * the bake has settled. `InputPrompt` — the game's own `@KeyboardTitleScreenPrompt`,
 * "Press Any Key to Begin" — is genuinely wired: a key or a tap anywhere moves the
 * front end on. (In the file this replaces, both prompts were drawn at once at their
 * shared rect and neither was connected to anything.)
 *
 * ## The one substitution
 *
 * `mainmenupanelhd` also holds five `Camera3DWidget`s (one per act), a
 * `PlayerLoaderWidget` per class and a `PlayerMoverWidget` per act: retail's main menu
 * background is a live 3D scene of the act's camp, with the player's model standing in
 * it. This renderer cannot draw a 3D scene, so that background is substituted with the
 * game's own town — "Act 1 - Town 1", the Rogue Encampment — baked from the area's
 * `.ds1` and its tilesets' `.dt1` art through the game's own palette: the same ground
 * `main.tsx` builds for `game.map`, drifting slowly behind the menu. Those widgets
 * carry no `filename`, so they draw nothing; the types the substitution stands in for
 * are `THREE_D_TYPES`, and `tools/verify-frontend.ts` reports that every one of them
 * is artless. That is the only substituted element on this screen — every other pixel
 * is a layout's own art.
 *
 * ## What a layout cannot say, and this file therefore supplies
 *
 * - **How many characters there are.** `characterselectpanelhd` describes the row
 *   *template* — a `ListItemWidget` with a tile, four flag icons and three text
 *   boxes — and not the rows, because how many there are is save data. So
 *   `CharacterList` renders that template once per character, inside the rect the
 *   layout's own list states, and marks the selected row with the layout's own
 *   `Selection` frame, which is the widget the list names in its own `selectorName`
 *   field.
 * - **Which of two states is showing.** `InputPrompt` and `LoadingPrompt` share one
 *   rect because the game shows one or the other; this front end's loading state is
 *   the loading panel, so the title screen keeps `InputPrompt`. The list's container
 *   of join requirements is hidden because none of them fails for the character this
 *   build has. Both are in `SKIPPED_WIDGETS`, and a skip for a widget that is not
 *   there is the same silent no-op as a handler for one, so the verifier checks them
 *   by layout too.
 * - **Three sizing conventions the resolver does not read.** `fitToParent`/`fitToScreen`
 *   (six of these five layouts' widgets state one, and without it their children's
 *   anchors collapse into the corner), the font size, which the layouts state as a
 *   unit-valued `style.pointSize` while `render.tsx` reads a pixel-valued field, and the
 *   height of a text box, which these layouts leave to the game and which `render.tsx`
 *   clips to nothing. `sizeWidgets` states all three; its own note has the measurements
 *   behind each.
 *
 * ## The layouts this does not draw
 *
 * Seventeen front-end layouts are in the export. The five above are drawn; the other
 * twelve — `NOT_DRAWN` — are left out, each because what the layout describes is
 * *state* this build has none of, and drawing it would put an empty frame where the
 * game puts a working control. None of them is replaced by anything hand-drawn:
 *
 * | layout | why not |
 * | --- | --- |
 * | `charactercreatepanelhd` | choosing a class *is* its eight `HDCharacterSelectorWidget` models — nine three-dimensional widgets in all — the same live 3D the menu background needs; what is left is a title, a name box and two toggles with nothing to choose. |
 * | `settingspanelhd`, `gameplayoptionspanelhd`, `videooptionspanelhd`, `soundoptionspanelhd`, `keybindingmenuhd` | their content is control state. The settings panel's tab strip says which of them is showing, and each panel is carousels, sliders, dropdowns, toggles and a binding list whose value is a setting this build has no store for: drawn, they are a column of labels beside controls that either show a fixed frame or nothing at all. `verify-frontend` prints the counts per panel. |
 * | `creditsmodalhd` | its content is `CreditsROTW.txt` scrolled by a `CreditsWidget` and its background is a movie. Neither is in the export, so what is left is an empty frame and one button. |
 * | `cinematicsmodalhd` | its seven buttons select movies and its checkbox switches to the legacy ones, and the export carries no movie files at all (no `.bik` under `original/`): every control in the panel would be inert. |
 * | `characterdifficultymodalhd` | it is a choice of Normal, Nightmare and Hell, and the front end's only way into the game is `onPlay()`, which carries no difficulty. Three buttons that would all begin the same game are a false choice, not a screen. |
 * | `logomenupanelhd` | it is a `MoviePlayerWidget` and a `Camera3DWidget` and nothing else — no art, no captions. There is nothing to draw. |
 * | `blockingpanelhd` | its `Prompt` is empty in the layout (the game fills it) and it exists to cover a blocking operation; this build never blocks. |
 * | `mainmenulinkshd` | its two buttons launch the RotW store page and a community URL, names the layout does not carry; both are network actions this build has no equivalent for. |
 */

import { each } from '@rasenjs/core'
import { when } from '@rasenjs/dom'
import { computed, ref, type SignalRef } from '@rasenjs/reactive-signals'
import {
  createAnimationClock,
  loadUiLayers,
  resolveScreen,
  UiLayers,
  type UiLayerSet,
} from './d2/ui/screen'
import { flatten, rectOf, unitOf, type ResolvedWidget, type Viewport } from './d2/ui/layout'
import { renderWidget, type SpriteProvider, type UiRenderOptions } from './d2/ui/render'
import type { UiAtlasLoader } from './d2/ui/atlas'
import type { UiStrings } from './d2/ui/strings'
import { fieldString, widgetFilename, widgetText } from './d2/ui/widget'
import type { UiWidget } from './d2/ui/widget'
import { createBrowserLevelSource, loadLevelWithFetch } from './d2/level-source'
import { parseDt1, type Dt1File } from './d2/dt1'
import { assembleTile, bitmapToCanvas, parsePalette, type Palette } from './d2/tileart'
import type { LevelSource } from './d2/levels'
import { generateWorld, type RealLevelGrid, type TileArt } from './world'

/**
 * The game's own layouts this front end is made of, by the name the layout file has.
 *
 * Names and not paths: `createUiSource` owns the path (`original/ui/global/ui/layouts/
 * <name>.json`) and the profile the HD layouts are written against.
 */
export const MENU_LAYOUTS = {
  /** The loading panel, shown while the menu's backdrop is baked. */
  loading: 'mainmenuloadingpanelhd',
  /** The title screen: the logo, the copyright and "Press Any Key to Begin". */
  title: 'titlescreenpanelhd',
  /** The main menu's own panel: the Play button, its cog and its divider. */
  menuPanel: 'mainmenupanelhd',
  /** The logo, the flames and the Settings/Cinematics/Credits/Exit ribbon. */
  ribbon: 'mainmenubuttonribbonhd',
  /** The character list. */
  characterSelect: 'characterselectpanelhd',
} as const

/** The layouts each state of the front end draws, in paint order. */
export const FRONTEND_STAGES: Readonly<Record<string, readonly string[]>> = {
  loading: [MENU_LAYOUTS.loading],
  title: [MENU_LAYOUTS.title],
  menu: [MENU_LAYOUTS.menuPanel, MENU_LAYOUTS.ribbon, MENU_LAYOUTS.characterSelect],
  off: [],
}

/** Every layout the front end loads, the stages deduplicated. */
export const FRONTEND_LAYOUTS: readonly string[] = [
  MENU_LAYOUTS.loading,
  MENU_LAYOUTS.title,
  MENU_LAYOUTS.menuPanel,
  MENU_LAYOUTS.ribbon,
  MENU_LAYOUTS.characterSelect,
]

/**
 * The front-end layouts this file deliberately does not draw.
 *
 * The reasons are in the header, one layout at a time. They are named here as well so
 * that `tools/verify-frontend.ts` can print the evidence for each of them — how much
 * of the layout is a control whose art *is* its value, or 3D, or a movie — rather than
 * leaving the decision as a paragraph nobody can check.
 */
export const NOT_DRAWN: readonly string[] = [
  'charactercreatepanelhd',
  'settingspanelhd',
  'gameplayoptionspanelhd',
  'videooptionspanelhd',
  'soundoptionspanelhd',
  'keybindingmenuhd',
  'creditsmodalhd',
  'cinematicsmodalhd',
  'characterdifficultymodalhd',
  'logomenupanelhd',
  'blockingpanelhd',
  'mainmenulinkshd',
]

/** The widget types the 3D camp scene is made of, and the backdrop stands in for. */
export const THREE_D_TYPES: readonly string[] = [
  'Camera3DWidget',
  'PlayerLoaderWidget',
  'PlayerMoverWidget',
]

/** The character list's own widget names, from `characterselectpanelhd`. */
const LIST_WIDGET = 'CharacterList'
const ROW_TEMPLATE_WIDGET = 'CharacterTemplate'
const SELECTOR_WIDGET = 'Selection'
/** The row template's text boxes: its title line, and the name and level-and-class. */
const ROW_NAME_WIDGET = 'Name'
const ROW_LEVEL_WIDGET = 'Level&Class'
/** The row template's flag icons. */
const FLAG_LADDER_WIDGET = 'LadderIcon'
const FLAG_HARDCORE_WIDGET = 'HardcoreIcon'
const FLAG_EXPANSION_WIDGET = 'ExpansionIcon'
const FLAG_CLASSIC_WIDGET = 'ClassicIcon'

/**
 * The widget names the front end looks up by name, by the layout they are in.
 *
 * Every one of them is read at runtime — for a row's text box, for a row's flag icon,
 * for the list's own frames. A name here that is not in the layout it is filed under is
 * an element that can never appear: a blank row, a flag that never shows.
 * `tools/verify-frontend.ts` reads this table back out of this module and checks every
 * name against the layout it names.
 */
export const NAMED_WIDGETS: Readonly<Record<string, readonly string[]>> = {
  [MENU_LAYOUTS.characterSelect]: [
    LIST_WIDGET,
    ROW_TEMPLATE_WIDGET,
    SELECTOR_WIDGET,
    ROW_NAME_WIDGET,
    ROW_LEVEL_WIDGET,
    FLAG_LADDER_WIDGET,
    FLAG_HARDCORE_WIDGET,
    FLAG_EXPANSION_WIDGET,
    FLAG_CLASSIC_WIDGET,
  ],
}

/**
 * The widgets the front end does not draw, by layout.
 *
 * Each one is a state rather than a decision: the two title-screen prompts share a
 * rect, the join requirements are shown only when one of them fails, the two buttons
 * are the online flow, and the selector frame is drawn by `CharacterList` instead, on
 * the selected row. Checked by the verifier as well, because a skip for a widget that
 * is not there is a silent no-op.
 */
export const SKIPPED_WIDGETS: Readonly<Record<string, readonly string[]>> = {
  [MENU_LAYOUTS.title]: ['LoadingPrompt'],
  [MENU_LAYOUTS.menuPanel]: [
    'PlayerInfoContainer',
    'OnlinePlaySettingsButton',
    'SecondaryContextButton',
  ],
  [MENU_LAYOUTS.characterSelect]: [SELECTOR_WIDGET],
}

/**
 * The game's own action names this front end can carry out.
 *
 * A name is a layout's `onClickMessage`, and the list is exact on purpose: an action
 * that is not named here is deliberately left inert, so honouring another one is a
 * decision rather than a side effect. `actionOf` is the whole mapping, and
 * `tools/verify-frontend.ts` checks that each name is really carried by a widget of a
 * layout this file draws — a name nothing states is a button that could never fire.
 */
export const WIRED_ACTIONS: readonly string[] = ['MainMenuHD:Play']

export type MenuAction = 'play' | 'inert'

export function actionOf(message: string | undefined): MenuAction {
  if (message === undefined) return 'inert'
  return WIRED_ACTIONS.includes(message) ? 'play' : 'inert'
}

/**
 * One character row, as the game's `CharacterSelectPanel` template describes it.
 *
 * The layout gives the row template; how many rows there are is save data, so the rows
 * come from the caller — see `CharacterList`.
 */
export interface FrontendCharacter {
  name: string
  className: string
  level: number
  hardcore: boolean
  expansion: boolean
  /**
   * Whether the character is a ladder character. The row template carries a
   * `LadderIcon` for it; a caller that does not say leaves the icon undrawn rather
   * than guessing, since a ladder character is the exception.
   */
  ladder?: boolean
}

/**
 * The front end, loaded: its layouts parsed, their atlases decoded, and the one
 * background it has to bake for itself.
 */
export interface FrontendScreens extends UiLayerSet {
  /**
   * The main menu's backdrop, as a CSS `url()` target, or `null` when this build has
   * no area to bake.
   *
   * A call rather than a value because it is the work the loading panel covers, and
   * memoised so a second caller does not bake it twice.
   */
  backdrop(): Promise<string | null>
}

/**
 * Loads the front end.
 *
 * `loadUiLayers` parses every layout in `FRONTEND_LAYOUTS`, collects the atlases they
 * name and decodes them: rendering cannot await, so all of that happens here rather
 * than per widget. Returns `null` when the ribbon is not exported at all, because a
 * front end with half its panels is worse than the caller's own start screen — and the
 * caller has one.
 */
export async function loadFrontend(
  base: string,
  loader: UiAtlasLoader,
  strings: UiStrings,
  viewport: Viewport,
): Promise<FrontendScreens | null> {
  const layers = await loadUiLayers(base, loader, strings, viewport, FRONTEND_LAYOUTS)
  if (layers === null || !layers.roots.has(MENU_LAYOUTS.ribbon)) return null
  const sprites = layers.source.sprites
  const roots = new Map<string, UiWidget>()
  for (const [name, root] of layers.roots) roots.set(name, sizeWidgets(root, viewport, sprites))
  let baking: Promise<string | null> | null = null
  return {
    ...layers,
    roots,
    backdrop: (): Promise<string | null> => {
      if (baking === null) baking = bakeCampBackdrop(base)
      return baking
    },
  }
}

/**
 * Reads the three sizing conventions these layouts state and this repo's resolver does not.
 *
 * All three are the game's own layout engine's, and all three matter for what the screen
 * looks like — the first two change *where* art lands, the third decides whether captions
 * are visible at all:
 *
 * 1. **`fitToParent` / `fitToScreen`.** Six of the flagged widgets in these five layouts
 *    have no rect, so they resolve to nothing — and their children are anchored to
 *    fractions of them. `titlescreenpanelhd`'s `LoadingScreen` holds the logo group
 *    anchored `{ x: 1, y: 1 }`, which against a zero-sized parent draws at (-167, -175)
 *    instead of the bottom-right; `mainmenubuttonribbonhd`'s `MotDHeaderText` fills the
 *    tile that captions it, and is clipped to nothing without the size.
 *    A filled widget is the size of *its* parent, so the pass runs top down: the root's
 *    parent is the screen.
 * 2. **The font size.** The layouts state it as `style.pointSize`, in layout units
 *    (`$XExtraLargeFontSize` is 56 — 23 px at a 900-pixel viewport, which is what a title
 *    prompt of that name measures on the original), while `render.tsx` reads a *field*
 *    named `pointSize` and uses it as pixels. So the unit value is converted here, which
 *    is what makes the two spellings in these files agree: a `ButtonWidget` states the
 *    field (the button's art gives it a height), a `TextBoxWidget` states the style.
 * 3. **The height of a text box.** Most text widgets in these layouts state a width and no
 *    height, because the game sizes the box to its own text — and `render.tsx` clips a
 *    widget to its box (`overflow: hidden`), so a box with no height draws nothing at all.
 *    The boxes that *do* state a height keep about 1.5 font heights (`Title` is 42 units
 *    for a 28-unit font, `Name` 55 for 34), so that is the height given here: one line of
 *    the font the layout itself names, in the proportion the layout itself keeps.
 *
 * (`hud-panels.tsx` answers the first of the three for the pause menu's root by resolving
 * it inside a screen-sized parent; these roots are drawn by `UiLayers` from the map it is
 * handed, so the conventions are turned into `rect`s before it gets them.)
 */
function sizeWidgets(root: UiWidget, viewport: Viewport, sprites: SpriteProvider): UiWidget {
  const unit = unitOf(viewport)
  const screenWidth = viewport.width / unit
  const screenHeight = viewport.height / unit
  /** The ratio the layouts' own text boxes keep between their height and their font. */
  const LINE_BOX = 1.5

  /** The font size a text widget states, in layout units, or undefined. */
  const fontUnits = (widget: UiWidget): number | undefined => {
    const style = widget.fields.style
    if (style === null || typeof style !== 'object') return undefined
    const size = (style as Record<string, unknown>).pointSize
    return typeof size === 'number' ? size : undefined
  }

  const walk = (widget: UiWidget, parentWidth: number, parentHeight: number): UiWidget => {
    const rect = rectOf(widget)
    const fills = widget.fields.fitToParent === true || widget.fields.fitToScreen === true
    const name = widgetFilename(widget)
    const art = name === undefined ? null : sprites.cellUnits(name)
    const font = TEXT_TYPES.has(widget.type) ? fontUnits(widget) : undefined
    const width = rect.width ?? art?.width ?? (fills ? parentWidth : 0)
    const height =
      rect.height ?? art?.height ?? (fills ? parentHeight : (font === undefined ? 0 : font * LINE_BOX))
    const fields: Record<string, unknown> = { ...widget.fields }
    if (rect.width !== width || rect.height !== height) {
      fields.rect = { ...rect, width, height }
    }
    if (font !== undefined && fields.pointSize === undefined) fields.pointSize = font * unit
    return {
      ...widget,
      fields,
      children: widget.children.map((child) => walk(child, width, height)),
    }
  }

  return walk(root, screenWidth, screenHeight)
}

/** The widget types that show text, which is what rules 2 and 3 above are about. */
const TEXT_TYPES = new Set(['TextBoxWidget', 'InputTextBoxWidget', 'LabelWidget'])

/** What the screen needs from the game, so it never reaches into the simulation. *//** What the screen needs from the game, so it never reaches into the simulation. *//** What the screen needs from the game, so it never reaches into the simulation. */
export interface FrontendProps {
  screens: FrontendScreens
  /** Called when the player commits to entering the world. */
  onPlay: () => void
  characters: readonly FrontendCharacter[]
}

/**
 * The front end's animation-frame loop.
 *
 * The layouts animate themselves: an `AnimatedImageWidget` states `fps` and
 * `createAnimationClock` turns elapsed seconds into a frame index — but nothing in the
 * renderer subscribes to that clock, because a widget's style is built once, from the
 * index the renderer was called with. So one loop drives the clock here and the stages
 * rebuild per frame (see `Stage`). It stops when the front end is done, since the game
 * has a loop of its own from then on.
 */
function startLoop(clock: { advance(dtMs: number): void }, running: () => boolean): void {
  if (typeof requestAnimationFrame === 'undefined') return
  let last = 0
  const tick = (now: number): void => {
    if (!running()) return
    if (last !== 0) clock.advance(now - last)
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * The fastest `fps` any widget of these layouts states, or 0 when nothing animates.
 *
 * It is the rebuild rate of the stage that draws them, because a rebuild is the only
 * way an animation moves on here: a layout with no animated widget is mounted once and
 * left alone, and one with the ribbon's logo is rebuilt at the rate the layout itself
 * asks for.
 */
function animationRate(
  roots: ReadonlyMap<string, UiWidget>,
  names: readonly string[],
  sprites: SpriteProvider,
): number {
  let fastest = 0
  const walk = (widget: UiWidget): void => {
    const fps = widget.fields.fps
    if (typeof fps === 'number' && fps > 0) {
      const name = typeof widget.fields.filename === 'string' ? widget.fields.filename : ''
      if (name !== '' && sprites.cellCount(name) > 1) fastest = Math.max(fastest, fps)
    }
    for (const child of widget.children) walk(child)
  }
  for (const name of names) {
    const root = roots.get(name)
    if (root !== undefined) walk(root)
  }
  return fastest
}

/**
 * One state of the front end: the layouts it draws, and the frame they are drawn in.
 *
 * The layouts are drawn by `UiLayers`, which is the HUD's renderer too — one widget
 * tree, one `rect`/`anchor` resolution, one place where captions are resolved.
 *
 * An animated layout has to be *rebuilt* to move. `when` mounts its branch when the
 * condition is truthy and, when the condition's value changes without the branch
 * changing, does nothing at all (`syncBranch` returns early) — so a frame counter as the
 * condition would mount the stage once and freeze it, because each widget's animation
 * frame is baked into its style when `renderWidget` runs. What does rebuild is a change
 * of *branch*, so the layouts alternate between two branches that draw the same thing at
 * different frames: the subtree is taken apart and put back once per frame, and because
 * both branches draw the current frame there is never a moment with nothing on screen.
 * A layout whose widgets state no `fps` at all takes `draw` directly and is mounted once.
 */
function Stage(props: {
  layers: UiLayerSet
  names: readonly string[]
  rate: number
  elapsed: SignalRef<number>
  clock: { frameIndex(widget: ResolvedWidget): number }
  visible: () => boolean
  onActivate?: (widget: ResolvedWidget, event: Event) => void
  text?: (widget: ResolvedWidget) => string | undefined
}) {
  const layers = props.layers
  const names = props.names
  const rate = props.rate
  const elapsed = props.elapsed
  const clock = props.clock
  const visible = props.visible
  const onActivate = props.onActivate
  const text = props.text
  const frameIndex = (widget: ResolvedWidget): number => clock.frameIndex(widget)
  const skip = (widget: ResolvedWidget): boolean => skippedWidget(widget)
  const staticStage = rate <= 0
  const showing = computed((): boolean => visible())
  const frame = computed((): boolean => staticStage || Math.floor(elapsed.value * rate) % 2 === 0)
  const condition = (): boolean => showing.value
  const rebuild = (): boolean => frame.value
  const draw = (): unknown => (
    <UiLayers
      layers={layers}
      names={names}
      frameIndex={frameIndex}
      onActivate={onActivate}
      text={text}
      skip={skip}
    />
  )
  const content = (): unknown => {
    if (staticStage) return draw()
    return when({
      condition: rebuild,
      then: () => draw() as never,
      else: () => draw() as never,
    })
  }
  return when({ condition, then: () => content() as never })
}

/** Whether a widget is one this front end does not draw. */
function skippedWidget(widget: ResolvedWidget): boolean {
  for (const names of Object.values(SKIPPED_WIDGETS)) {
    if (names.includes(widget.widget.name)) return true
  }
  return false
}

/** The seed the area is assembled with; `main.tsx` builds the game's map with it. */
const CAMP_SEED = 20261013

/** The widest the baked ground is scaled to before it becomes a background. */
const BACKDROP_MAX_WIDTH = 2048

/**
 * The main menu's backdrop: the game's own ground for the area the hero starts in.
 *
 * This is the substitution the header describes. `main.tsx` builds exactly this bitmap
 * for `game.map` — the town's `.ds1` through its tilesets' `.dt1` art and the game's
 * palette, composed by `world.ts` — and the front end cannot reach that canvas, so it
 * bakes the same area from the same files with the same seed. The result becomes one
 * object URL, scaled down first because a 3200-pixel-wide bitmap is wasted on a
 * backdrop.
 */
async function bakeCampBackdrop(base: string): Promise<string | null> {
  try {
    const source = await createBrowserLevelSource(base)
    if (source === null) return null
    // The town is the character's actual starting place, which is what the menu's 3D
    // background shows, so it is the area to bake.
    const town = source.tables().presets.find((preset) => preset.name.toLowerCase().includes('town'))
    if (town === undefined) return null
    const level = await loadLevelWithFetch(source, town.id, CAMP_SEED)
    if (level === null) return null
    const read = tileReader(source)
    const palette = await loadPalette(base)
    if (read === null || palette === null) return null

    // Each tileset's blocks, assembled once and cached: the town references the same
    // few dozen tiles thousands of times.
    const tilesets = new Map<string, { bytes: Uint8Array; file: Dt1File }>()
    for (const name of level.tilesets) {
      const bytes = await read(name.toLowerCase().endsWith('.dt1') ? name : `${name}.dt1`)
      if (bytes !== null) tilesets.set(name, { bytes, file: parseDt1(bytes) })
    }
    const art = new Map<string, TileArt | null>()
    const artAt = (x: number, y: number): TileArt | null => {
      const tile = level.tileAt(x, y)
      if (tile === null || !tile.resolved || tile.tileset === null || tile.blockIndex === null) {
        return null
      }
      const key = `${tile.tileset}#${tile.blockIndex}`
      const cached = art.get(key)
      if (cached !== undefined) return cached
      const set = tilesets.get(tile.tileset)
      const block = set?.file.blocks[tile.blockIndex]
      let built: TileArt | null = null
      if (set !== undefined && block !== undefined) {
        const bitmap = assembleTile(block, palette, set.bytes)
        if (bitmap !== null) {
          built = { canvas: bitmapToCanvas(bitmap), frameX: bitmap.frameX, frameY: bitmap.frameY }
        }
      }
      art.set(key, built)
      return built
    }

    const grid: RealLevelGrid = {
      width: level.width,
      height: level.height,
      // The ground kind only decides the fallback colour of a cell whose art is
      // missing, and `main.tsx` answers the same way for the same level.
      kindAt: (x, y) => (level.walkable(x, y) ? 'path' : 'stone'),
      walkable: (x, y) => level.walkable(x, y),
      artAt,
    }
    return await backgroundUrl(generateWorld(CAMP_SEED, {}, grid).ground)
  } catch (error) {
    console.warn('rasen: the menu backdrop could not be baked from the level files', String(error))
    return null
  }
}

/** The browser source's prefetch, which `LevelSource` itself does not declare. */
function tileReader(source: LevelSource): ((path: string) => Promise<Uint8Array | null>) | null {
  const reader = (
    source as LevelSource & { readTilesAsync?: (path: string) => Promise<Uint8Array | null> }
  ).readTilesAsync
  return reader ?? null
}

/** The game's 256-colour palette, without which tile art has no colours. */
async function loadPalette(base: string): Promise<Palette | null> {
  try {
    const response = await fetch(`${base}original/palette/pal.dat`, { cache: 'no-store' })
    if (!response.ok) return null
    return parsePalette(new Uint8Array(await response.arrayBuffer()))
  } catch {
    return null
  }
}

/**
 * A baked ground canvas as a CSS `url()` target.
 *
 * A blob object URL rather than a data URL: it keeps the pixels out of a JavaScript
 * string. It is not revoked, because the backdrop lives as long as the page does.
 */
async function backgroundUrl(ground: HTMLCanvasElement): Promise<string | null> {
  const scale = ground.width > BACKDROP_MAX_WIDTH ? BACKDROP_MAX_WIDTH / ground.width : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(ground.width * scale)
  canvas.height = Math.round(ground.height * scale)
  const context = canvas.getContext('2d')
  if (context === null) return null
  context.drawImage(ground, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob === null ? null : URL.createObjectURL(blob)
}

/** How far the backdrop drifts, as a fraction of the viewport, and over how long. */
const PAN_DRIFT = 0.06
const PAN_PERIOD_X = 96
const PAN_PERIOD_Y = 144

/**
 * The backdrop: the game's own town ground, drifting slowly.
 *
 * Drawn 12% wider and taller than the viewport and translated by at most half of that
 * overhang, so no edge can come into view. The drift is a very slow horizontal
 * oscillation with a slower, smaller vertical one behind it, which is what "the menu
 * background is a live scene" means when the scene can only be a picture.
 */
function Backdrop(props: {
  url: SignalRef<string | null>
  viewport: Viewport
  elapsed: SignalRef<number>
}) {
  const url = props.url
  const viewport = props.viewport
  const elapsed = props.elapsed
  const shown = computed((): boolean => url.value !== null)
  const condition = (): boolean => shown.value
  // A `computed` rather than a function: a style prop reaches the DOM binding through a
  // getter the compiler wraps around it, and a getter whose value is *itself* a function
  // is not a style object — the binding clears the declaration instead.
  const style = computed((): Record<string, string> => {
    const x = Math.sin((elapsed.value / PAN_PERIOD_X) * Math.PI * 2) * PAN_DRIFT
    const y = Math.sin((elapsed.value / PAN_PERIOD_Y) * Math.PI * 2) * PAN_DRIFT * 0.6
    return {
      position: 'absolute',
      left: `${-viewport.width * PAN_DRIFT}px`,
      top: `${-viewport.height * PAN_DRIFT}px`,
      width: `${viewport.width * (1 + PAN_DRIFT * 2)}px`,
      height: `${viewport.height * (1 + PAN_DRIFT * 2)}px`,
      'background-image': `url(${url.value ?? ''})`,
      'background-size': 'cover',
      'background-position': 'center',
      transform: `translate(${(x * viewport.width).toFixed(1)}px, ${(y * viewport.height).toFixed(1)}px)`,
      'pointer-events': 'none',
    }
  })
  return when({
    condition,
    then: () => <div class="frontend-backdrop" data-frontend="" style={style} />,
  })
}

/**
 * The title screen's own hit area: "any tap" next to "any key".
 *
 * Transparent and the size of the front end, drawn after the title screen so it is
 * over its art, and only while the title screen is showing — the menu's own buttons
 * have to be reachable.
 */
function TitleTap(props: { visible: () => boolean; onTap: () => void }) {
  const visible = props.visible
  const onTap = props.onTap
  const condition = (): boolean => visible()
  const handler = (): void => onTap()
  return when({
    condition,
    then: () => (
      <div class="frontend-anykey" data-frontend="" style={TAP_STYLE} onPointerDown={handler} />
    ),
  })
}

/** A transparent box the size of the front end, so a tap anywhere is a tap on it. */
const TAP_STYLE: Record<string, string> = {
  position: 'absolute',
  left: '0px',
  top: '0px',
  width: '100%',
  height: '100%',
  'pointer-events': 'auto',
}

/**
 * One widget of a resolved layout, drawn on its own.
 *
 * The framework must be handed a mountable from inside a `when` branch: a call left
 * directly in a child position is compiled as *text* unless the compiler can resolve
 * the callee to a factory declared above it, and `renderWidget` is an import. What that
 * looks like when it goes wrong is a thrown `renderText() received a function` — the
 * mountable refused rather than its source printed.
 */
function WidgetView(props: {
  widget: ResolvedWidget
  options: UiRenderOptions
  origin: { x: number; y: number }
}) {
  const widget = props.widget
  const options = props.options
  const origin = props.origin
  return when({
    condition: () => true,
    then: () => renderWidget(widget, options, origin) as never,
  })
}

/**
 * Whether one of the row's flag icons is drawn.
 *
 * The template carries all four and the game shows the ones the character has, which is
 * save data. `ClassicIcon` and `ExpansionIcon` share a rect on purpose: a character is
 * one or the other.
 */
function flagShown(name: string, character: FrontendCharacter): boolean {
  switch (name) {
    case FLAG_LADDER_WIDGET:
      return character.ladder === true
    case FLAG_HARDCORE_WIDGET:
      return character.hardcore
    case FLAG_EXPANSION_WIDGET:
      return character.expansion
    case FLAG_CLASSIC_WIDGET:
      return !character.expansion
    default:
      return true
  }
}

/**
 * A row's text, from the row's character.
 *
 * `Level&Class` is the game's own format for it — `@LevelAndClassDescription` is
 * `Level %d %s` in the string tables — rather than a sentence written here. The
 * template's `Title` box is left empty: no table in this build gives a character a
 * title, and an invented one would be worse than the blank the game leaves when there
 * is nothing to say.
 */
function rowText(
  widget: ResolvedWidget,
  character: FrontendCharacter,
  strings: UiStrings,
): string | undefined {
  if (widget.widget.name === ROW_NAME_WIDGET) return character.name
  if (widget.widget.name !== ROW_LEVEL_WIDGET) return undefined
  const format = strings.resolve('@LevelAndClassDescription')
  if (format === undefined) return undefined
  return format.replace('%d', String(character.level)).replace('%s', character.className)
}

/** The frames a character list needs out of the list's own resolved layout. */
interface ListFrame {
  /** The `ListWidget`'s box in pixels: the rect the rows go in. */
  readonly list: ResolvedWidget
  /** The `ListItemWidget` template: one row. */
  readonly template: ResolvedWidget
  /** The `Selection` frame, or null when the layout has none. */
  readonly selector: ResolvedWidget | null
  /** The distance between two rows: the template's own height. */
  readonly pitch: number
}

/** The list's frames out of a resolved `characterselectpanelhd`, or null. */
function listFrame(root: ResolvedWidget | null): ListFrame | null {
  if (root === null) return null
  const all = flatten(root)
  const find = (name: string): ResolvedWidget | null =>
    all.find((widget) => widget.widget.name === name) ?? null
  const list = find(LIST_WIDGET)
  const template = find(ROW_TEMPLATE_WIDGET)
  if (list === null || template === null) return null
  return { list, template, selector: find(SELECTOR_WIDGET), pitch: template.box.height }
}

/**
 * One row: the layout's own template, once.
 *
 * `renderWidget` is handed the template and the row's own content — its two text boxes
 * and which of the four flag icons are drawn. Nothing about the row's appearance is
 * written here; the tile, the icons and the text styles are all the template's.
 */
function CharacterRow(props: {
  template: ResolvedWidget
  character: FrontendCharacter
  /** The row's own position, relative to the list's rect, and its size. */
  left: number
  top: number
  sprites: SpriteProvider
  strings: UiStrings
  unit: number
  onPress: () => void
}) {
  const template = props.template
  const character = props.character
  const sprites = props.sprites
  const strings = props.strings
  const unit = props.unit
  const onPress = props.onPress
  const box = template.box
  // The wrapper is inside the list's own rect, so the row's position is relative to
  // *that* — a resolved box is absolute, and writing it here would count the list's
  // origin twice. The origin handed to `WidgetView` stays the template's own box, so
  // the template's children are placed relative to the template.
  const style: Record<string, string> = {
    position: 'absolute',
    left: `${props.left}px`,
    top: `${props.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    'pointer-events': 'auto',
    cursor: 'pointer',
  }
  const text = (widget: ResolvedWidget): string | undefined => rowText(widget, character, strings)
  const skip = (widget: ResolvedWidget): boolean => !flagShown(widget.widget.name, character)
  const options: UiRenderOptions = { sprites, unit, text, skip }
  const origin = { x: box.x, y: box.y }
  return (
    <div class="character-row" data-frontend="" style={style} onPointerDown={onPress}>
      <WidgetView widget={template} options={options} origin={origin} />
    </div>
  )
}

/**
 * The character list.
 *
 * The one thing a layout cannot state is how many rows there are, so the rows are
 * here — but they are not drawn: each row is the layout's own `CharacterTemplate`
 * rendered once per character, with the template's `Name` and `Level&Class` boxes
 * filled and its flag icons shown or skipped by what the character is. A press on a row
 * is also what begins the game in this build, which is how the example's own checks
 * start it; retail's way in — take the character with Play — is wired as well
 * (`WIRED_ACTIONS`).
 */
function CharacterList(props: {
  frame: ListFrame
  characters: readonly FrontendCharacter[]
  sprites: SpriteProvider
  strings: UiStrings
  unit: number
  selected: SignalRef<number>
  onPlay: () => void
}) {
  const frame = props.frame
  const characters = props.characters
  const sprites = props.sprites
  const strings = props.strings
  const unit = props.unit
  const selected = props.selected
  const onPlay = props.onPlay
  const box = frame.list.box
  const listStyle: Record<string, string> = {
    position: 'absolute',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    overflow: 'hidden',
    'pointer-events': 'none',
  }
  // The template's box is absolute and the list's is too: the difference is where a row
  // sits inside the list's own rect, and the pitch is the template's height.
  const rowLeft = frame.template.box.x - box.x
  const rowTop = frame.template.box.y - box.y
  const rowPitch = frame.pitch
  const rows = characters as FrontendCharacter[]
  const press = (index: number): (() => void) => (): void => {
    selected.value = index
    onPlay()
  }
  return (
    <div class="character-list" data-frontend="" data-ui-name={LIST_WIDGET} style={listStyle}>
      {each(rows, (character: FrontendCharacter, index: number) => {
        const template = frame.template
        const top = rowTop + index * rowPitch
        const onPress = press(index)
        return (
          <CharacterRow
            template={template}
            character={character}
            left={rowLeft}
            top={top}
            sprites={sprites}
            strings={strings}
            unit={unit}
            onPress={onPress}
          />
        )
      })}
    </div>
  )
}

/**
 * The list's own `Selection` frame, on the selected row.
 *
 * The `ListWidget` names it (`selectorName: "Selection"`) and the game moves it to
 * whichever item is chosen — a position a layout cannot state, since it is a selection
 * rather than a place. So it is the layout's frame, at the layout's own size, moved by
 * the row pitch, and drawn over the rows because the tile underneath it is opaque.
 */
function RowSelector(props: {
  selector: ResolvedWidget | null
  pitch: number
  selected: SignalRef<number>
  sprites: SpriteProvider
  unit: number
}) {
  const selector = props.selector
  const selected = props.selected
  const pitch = props.pitch
  const sprites = props.sprites
  const unit = props.unit
  const condition = (): boolean => selector !== null
  const body = (): unknown => {
    const frame = selector
    if (frame === null) return null
    const box = frame.box
    const options: UiRenderOptions = { sprites, unit }
    const origin = { x: box.x, y: box.y }
    // A `computed` for the same reason the backdrop's is: a style prop that answers with
    // a function is cleared rather than applied.
    const style = computed((): Record<string, string> => ({
      position: 'absolute',
      left: `${box.x}px`,
      top: `${box.y + selected.value * pitch}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      'pointer-events': 'none',
    }))
    return (
      <div class="character-selection" data-frontend="" data-ui-name={SELECTOR_WIDGET} style={style}>
        <WidgetView widget={frame} options={options} origin={origin} />
      </div>
    )
  }
  return when({ condition, then: () => body() as never })
}

/** A transparent box the size of the front end, for a state's own content. */
const FILL: Record<string, string> = {
  position: 'absolute',
  left: '0px',
  top: '0px',
  width: '100%',
  height: '100%',
  'pointer-events': 'none',
}

/**
 * The character list on the menu stage, and the frame the list itself names.
 *
 * Its own gate rather than part of the `menu` stage because the rows are this screen's
 * and not a layout's: the stage draws `characterselectpanelhd`, and the rows go inside
 * the rect that layout states, over it.
 */
function CharacterPanel(props: {
  frame: ListFrame | null
  characters: readonly FrontendCharacter[]
  screens: FrontendScreens
  viewport: Viewport
  visible: () => boolean
  selected: SignalRef<number>
  onPlay: () => void
}) {
  const frame = props.frame
  const characters = props.characters
  const screens = props.screens
  const viewport = props.viewport
  const visible = props.visible
  const selected = props.selected
  const onPlay = props.onPlay
  const sprites = screens.source.sprites
  const strings = screens.source.strings
  const unit = unitOf(viewport)
  const condition = (): boolean => visible() && frame !== null
  const body = (): unknown => {
    const list = frame
    if (list === null) return null
    return (
      <div class="character-panel" data-frontend="" style={FILL}>
        <CharacterList
          frame={list}
          characters={characters}
          sprites={sprites}
          strings={strings}
          unit={unit}
          selected={selected}
          onPlay={onPlay}
        />
        <RowSelector
          selector={list.selector}
          pitch={list.pitch}
          selected={selected}
          sprites={sprites}
          unit={unit}
        />
      </div>
    )
  }
  return when({ condition, then: () => body() as never })
}

/** The key listener, installed once for the page; see `Frontend`. */
let listening = false
/** The front end the listener speaks to: the one that is mounted. */
let listeningTo: (() => void) | null = null

/**
 * The front end.
 *
 * The stages are siblings rather than nested: each layout is its own tree with its own
 * root anchor, and nesting one in another would move it — the ribbon anchors to the
 * left edge, the character list to the right, and the menu panel to the centre.
 */
export function Frontend(props: FrontendProps) {
  const screens = props.screens
  const viewport = screens.viewport
  const sprites = screens.source.sprites
  const characters = props.characters
  const onPlay = props.onPlay

  /** Where the front end is in the retail flow. */
  const phase = ref('loading')
  /** Which row the list has selected, for the layout's own selector frame. */
  const selected = ref(0)
  /** Seconds since the front end opened, for the layouts' own `fps` animations. */
  const elapsed = ref(0)
  const clock = createAnimationClock(elapsed, sprites)
  startLoop(clock, () => phase.value !== 'off')

  // "Press Any Key to Begin": the game's own caption for the title screen, and the key
  // really does begin it. One listener for the page, installed by whichever front end
  // mounts first and pointed at the live one — a listener that captured `phase` would go
  // on talking to a screen a hot reload had already replaced.
  const advance = (): void => {
    if (phase.value !== 'title') return
    phase.value = 'menu'
  }
  listeningTo = advance
  if (!listening) {
    listening = true
    window.addEventListener('keydown', () => listeningTo?.())
  }

  // The backdrop is the one asset the front end does not have at mount, and the loading
  // panel is what covers the wait for it. A bake that fails is not fatal: the title
  // screen appears over whatever the game is already drawing.
  const backdrop = ref<string | null>(null)
  let asked = false
  const prepare = (): void => {
    if (asked) return
    asked = true
    const settled = (url: string | null): void => {
      backdrop.value = url
      if (phase.value === 'loading') phase.value = 'title'
    }
    void screens.backdrop().then(settled, (error: unknown) => {
      console.warn('rasen: the menu backdrop is unavailable', String(error))
      settled(null)
    })
  }
  prepare()

  const strings = screens.source.strings
  const text = (widget: ResolvedWidget): string | undefined => strings.resolve(widgetText(widget.widget))
  // Both ways into the game end here: the main menu's Play button (through
  // `activate`) and a press on a character row (`CharacterList`). The front end is
  // finished with at that point — the caller's own `started` flag unmounts it.
  const play = (): void => {
    phase.value = 'off'
    onPlay()
  }
  const activate = (widget: ResolvedWidget, event: Event): void => {
    event.stopPropagation()
    if (actionOf(fieldString(widget.widget.fields, 'onClickMessage')) === 'play') play()
  }

  const visible = (state: string): (() => boolean) => (): boolean => phase.value === state
  const loadingVisible = visible('loading')
  const titleVisible = visible('title')
  const menuVisible = visible('menu')
  const loadingNames = FRONTEND_STAGES.loading
  const titleNames = FRONTEND_STAGES.title
  const menuNames = FRONTEND_STAGES.menu
  const loadingRate = animationRate(screens.roots, loadingNames, sprites)
  const titleRate = animationRate(screens.roots, titleNames, sprites)
  const menuRate = animationRate(screens.roots, menuNames, sprites)

  // The character list's frames, out of the layout's own resolved tree: the rows go in
  // the rect the list states, and the selector is the list's own named frame.
  const characterRoot = screens.roots.get(MENU_LAYOUTS.characterSelect) ?? null
  const resolvedList = characterRoot === null ? null : resolveScreen(characterRoot, viewport, sprites)
  const frame = listFrame(resolvedList)

  return (
    // `data-hud` as well as `data-frontend`: that attribute is the input layer's own
    // rule for "this is interface, not the world" (`bindInput`'s `ignoreTargets`), so
    // the whole screen is inert to the tap-to-move and thumbstick machines. Without it
    // the press that starts the game is also a tap on the ground, and the hero walks to
    // wherever the menu was pressed.
    <div class="frontend" data-frontend="" data-hud="">
      <Backdrop url={backdrop} viewport={viewport} elapsed={elapsed} />
      <Stage
        layers={screens}
        names={loadingNames}
        rate={loadingRate}
        elapsed={elapsed}
        clock={clock}
        visible={loadingVisible}
      />
      <Stage
        layers={screens}
        names={titleNames}
        rate={titleRate}
        elapsed={elapsed}
        clock={clock}
        visible={titleVisible}
        text={text}
      />
      <Stage
        layers={screens}
        names={menuNames}
        rate={menuRate}
        elapsed={elapsed}
        clock={clock}
        visible={menuVisible}
        onActivate={activate}
        text={text}
      />
      <CharacterPanel
        frame={frame}
        characters={characters}
        screens={screens}
        viewport={viewport}
        visible={menuVisible}
        selected={selected}
        onPlay={play}
      />
      <TitleTap visible={titleVisible} onTap={advance} />
    </div>
  )
}
