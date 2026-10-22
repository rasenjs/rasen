/**
 * The in-game interface layouts that are not the HUD bar and not the eight docked
 * panels.
 *
 * The HUD bar and the panels live in `hud.tsx`; everything else the game draws over
 * the play area is here. The split is by *when* a layout is on screen: the bar is
 * always there, a panel is open on demand, and these appear because something
 * happened — a monster was hit, an NPC is talking, the player picked an item up,
 * the game was paused.
 *
 * Each of these is a layout of the game's own, loaded with the rest of the UI in
 * `main.tsx` and drawn by `UiLayers`, which is the same renderer the bar uses. The
 * content inside them — how full the bar is, what the NPC says — is the app's,
 * because a layout can say what a widget looks like but not what it contains.
 *
 * `EXTRA_UI_LAYOUTS` is the list `main.tsx` asks the loader for, so adding a layout
 * here is the whole of making it available.
 *
 * ## Where a box comes from
 *
 * Every box below is either the layout's own resolved box (`resolveScreen`, the
 * same call `UiLayers` makes) or, where the layout states none, a box the *engine*
 * computes at runtime from something the layout does state — the text of a dialogue
 * box, the cursor an item tooltip follows, the fraction of the screen an automap
 * takes. Each of those says so in a comment at the point it is computed; a box this
 * module picks for itself is a bug, and `tools/verify-ui-extra.ts` reports the
 * resolved box of everything it can.
 *
 * ## What is not drawn, and why
 *
 * Five of the layouts in the package's in-game set are named but not drawn, because
 * the simulation has none of the state they exist to show:
 *
 * - `hudwarningshd` — every warning it carries is about state this build does not
 *   have: item durability, thrown-weapon quantity, a hostile player in the game
 *   (`HostileWarning` takes `PANEL/hostilepic`), the console's battery, and terror
 *   zones (`TerrorZoneInfoText`, whose text comes from the desecrated-level tables).
 *   Drawing the frame with invented text would be a stand-in, which is what this
 *   file exists to remove.
 * - `horadriccubelayouthd` — the cube is a container: its `grid` is 3x4 cells of 98
 *   units and its `convert` button runs the cube recipes. `Game` has no cube and no
 *   recipe table, so the panel would be a frame around nothing.
 * - `imbueitemspanelhd` — Charsi's imbue needs a blacksmith, an item to hand over and
 *   the imbue rules; none of the three is in the simulation.
 * - `hireablespanelhd` — the roster lists party members and hirelings (`Name`,
 *   `Counter`, `HealthBarWidget` per row). The simulation has neither: `hud.tsx`'s
 *   mercenary panel is `hirelinginventorypanelhd`, which takes no data either.
 * - `tradelayouthd` — a trade window is two inventories and two offers
 *   (`grid_them`/`grid_us`, `gold_amount_them`/`gold_amount_us`); there is no second
 *   party in a single-player build.
 *
 * ## Input this module owns
 *
 * A layout can say which widget a press activates but not which key raises it, and
 * the package's key tables (`strings_keybinds.json`) are key *names*, not defaults.
 * So the four overlays that need raising carry this module's own bindings, and the
 * signals behind them are exported so a HUD button can raise them instead:
 *
 * - `Tab`      → {@link automapVisible}, the automap, which is the game's own key
 * - `F`        → {@link skillSelectVisible}, the skill chooser (`hud.tsx`'s skill
 *                slots are the retail entry point; `S` is movement in this app)
 * - `L`        → {@link messageLogVisible}, the message log
 * - `Alt` held → {@link itemLabelsVisible}, the item labels on the ground
 */

import { each } from '@rasenjs/core'
import { when } from '@rasenjs/dom'
import { ref, type SignalRef } from '@rasenjs/reactive-signals'
import type { Drop, Game, LogEntry, MinimapBlip, Rarity, SkillId, SkillView } from './game'
import { hudIcon } from './hud-icons'
import { toScreen, toWorld } from './iso'
import { fieldFlag, fieldNumber, fieldPair, fieldString, widgetText, type UiWidget } from './d2/ui/widget'
import {
  parseProfile,
  unitOf,
  type LayoutGlobals,
  type ResolvedWidget,
  type Viewport,
} from './d2/ui/layout'
import { HD_PROFILE, resolveScreen, type UiLayerSet } from './d2/ui/screen'
import { renderScreen, type UiFrame, type UiRenderOptions } from './d2/ui/render'

/**
 * The layouts this module draws, as `main.tsx` asks for them.
 *
 * `messagelogpanel_640x480hd` is the base of the 800x600 log (`basedOn`), so it is
 * loaded and merged but never drawn on its own — see {@link mergeLayout}.
 */
export const EXTRA_UI_LAYOUTS: readonly string[] = [
  'automaphd',
  'hudmonsterhealthhd',
  'hudlevelnameshd',
  'hudmessagepanelhd',
  'npcdialogpanelhd',
  'messagelogpanel_800x600hd',
  'messagelogpanel_640x480hd',
  'tooltipspanelhd',
  'pauselayouthd',
  'skillselecthd',
  'showitemspanelhd',
]

/**
 * A layout whose file is `basedOn` another one.
 *
 * The loader parses a layout on its own, so a derived file that only carries the
 * differences (`messagelogpanel_800x600hd` is `basedOn` `MessageLogPanel_640x480HD`)
 * arrives with every inherited rect missing. The merge is the one `main.tsx` applies
 * to the three panels `hud.tsx` draws, kept here as a local copy because these are a
 * different set of files.
 */
const BASED_ON: ReadonlyArray<readonly [derived: string, base: string]> = [
  ['messagelogpanel_800x600hd', 'messagelogpanel_640x480hd'],
]

/**
 * The merges the loader cannot do for itself, exported for `tools/verify-ui-extra.ts`
 * so that the verifier checks the same tree the overlays are handed.
 */
export const EXTRA_UI_MERGES: readonly (readonly [derived: string, base: string])[] = BASED_ON

export function mergeLayout(base: UiWidget, derived: UiWidget): UiWidget {
  const fields: Record<string, unknown> = { ...base.fields, ...derived.fields }
  const claimed = new Set<number>()
  const children: UiWidget[] = base.children.map((child: UiWidget) => {
    const index =
      child.name === ''
        ? -1
        : derived.children.findIndex((entry, at) => !claimed.has(at) && entry.name === child.name)
    if (index === -1) return child
    claimed.add(index)
    return mergeLayout(child, derived.children[index])
  })
  derived.children.forEach((child, index) => {
    if (!claimed.has(index)) children.push(child)
  })
  return { type: derived.type, name: derived.name, fields, children }
}

/**
 * A widget reached by following names down from a layout's root.
 *
 * The same rule `hud.tsx` uses, and a path rather than a name because layouts reuse
 * names across branches. A path that is not there is a silently empty overlay —
 * this codebase's most expensive bug class — so every path this module resolves is
 * listed in {@link HUD_EXTRA_LOOKUPS} and checked against the layout by
 * `tools/verify-ui-extra.ts`.
 */
export function widgetAt(root: ResolvedWidget | null, path: readonly string[]): ResolvedWidget | null {
  let node = root
  for (const name of path) {
    if (node === null) return null
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
  return node
}

/** One lookup this module makes, and the layout it makes it in. */
export interface ExtraLookup {
  readonly layout: string
  readonly path: readonly string[]
  /** What the overlay needs the widget for, printed by the verifier. */
  readonly why: string
}

/** The paths themselves, so the code and the table cannot drift apart. */
const P = {
  autoMapPanel: ['AutoMap'],
  monsterHealthPanel: ['HUDMonsterHealth'],
  monsterHealthBar: ['HUDMonsterHealth', 'Health'],
  monsterHealthName: ['HUDMonsterHealth', 'Health', 'Name'],
  monsterHealthUnique: ['HUDMonsterHealth', 'Unique'],
  monsterHealthAdditional: ['HUDMonsterHealth', 'Additional'],
  levelNamePanel: ['HUDLevelNames'],
  levelNameText: ['HUDLevelNames', 'NameText'],
  levelNameDesecrated: ['HUDLevelNames', 'DesecratedText'],
  messagePanel: ['HUDMessagePanel'],
  messageList: ['HUDMessagePanel', 'GlobalChatListContainer'],
  messageEntry: ['HUDMessagePanel', 'GlobalChatListContainer', 'ChatEntryTemplate'],
  messageEntryText: ['HUDMessagePanel', 'GlobalChatListContainer', 'ChatEntryTemplate', 'MessageText'],
  messageBackground: ['HUDMessagePanel', 'GlobalChatListContainer', 'MessageBackground'],
  dialogPanel: ['NpcDialogPanel'],
  dialogBorder: ['NpcDialogPanel', 'DialogBorder'],
  dialogTemplates: ['NpcDialogPanel', 'Templates'],
  dialogText: ['NpcDialogPanel', 'Templates', 'TextTemplate'],
  dialogButton: ['NpcDialogPanel', 'Templates', 'ButtonTemplate'],
  logPanel: ['MessageLogPanel_800x600'],
  logBackground: ['MessageLogPanel_800x600', 'MessageLogBackground'],
  logList: ['MessageLogPanel_800x600', 'ListContainer'],
  logEntry: ['MessageLogPanel_800x600', 'ListContainer', 'ChatEntryTemplate'],
  logEntryText: ['MessageLogPanel_800x600', 'ListContainer', 'ChatEntryTemplate', 'MessageText'],
  logScrollBar: ['MessageLogPanel_800x600', 'ScrollBar'],
  tooltipsPanel: ['TooltipsPanel'],
  pausePanel: ['PauseLayout'],
  pauseBackground: ['PauseLayout', 'TransparentBG'],
  pauseTitle: ['PauseLayout', 'PauseText'],
  pauseLogo: ['PauseLayout', 'LogoWidget'],
  pauseTable: ['PauseLayout', 'PauseTable'],
  pauseSettings: ['PauseLayout', 'PauseTable', 'Row Options', 'Settings'],
  pauseExit: ['PauseLayout', 'PauseTable', 'Row Save and Exit Game', 'Exit'],
  pauseResume: ['PauseLayout', 'PauseTable', 'Row Return to Game', 'ReturnToGame'],
  skillSelectPanel: ['SkillSelect'],
  skillTray: ['SkillSelect', 'SelectionTray'],
  skillHighlight: ['SkillSelect', 'SelectionTray', 'SelectionHighlight'],
  skillBorder: ['SkillSelect', 'SelectionTray', 'SelectionHighlight', 'SelectionBorder'],
  skillButton: ['SkillSelect', 'ButtonTemplate'],
  skillHotkey: ['SkillSelect', 'ButtonTemplate', 'HotkeyText'],
  skillQuantity: ['SkillSelect', 'ButtonTemplate', 'QuantityText'],
  skillBindText: ['SkillSelect', 'SkillBindText'],
  showItemsPanel: ['ShowItemsPanel'],
} as const

/**
 * Every widget path this module resolves.
 *
 * This table is the contract `tools/verify-ui-extra.ts` checks: a path listed here
 * that the layout does not have is a silently empty overlay, and the verifier fails
 * on it rather than leaving it to be noticed on screen.
 */
export const HUD_EXTRA_LOOKUPS: readonly ExtraLookup[] = [
  { layout: 'automaphd', path: P.autoMapPanel, why: 'the panel whose fields size and fade the minimap' },
  { layout: 'hudmonsterhealthhd', path: P.monsterHealthPanel, why: 'the panel the boss bar anchors from' },
  { layout: 'hudmonsterhealthhd', path: P.monsterHealthBar, why: 'the bar: its rect, colours and transparencies' },
  { layout: 'hudmonsterhealthhd', path: P.monsterHealthName, why: 'the name drawn on the bar' },
  { layout: 'hudmonsterhealthhd', path: P.monsterHealthUnique, why: 'the monster class line under the bar' },
  { layout: 'hudmonsterhealthhd', path: P.monsterHealthAdditional, why: 'the modifiers line under the bar' },
  { layout: 'hudlevelnameshd', path: P.levelNamePanel, why: 'the plaque: its anchor, and how long it stays up' },
  { layout: 'hudlevelnameshd', path: P.levelNameText, why: 'the area name' },
  { layout: 'hudlevelnameshd', path: P.levelNameDesecrated, why: 'the desecrated (terror zone) name' },
  { layout: 'hudmessagepanelhd', path: P.messagePanel, why: 'the message area' },
  { layout: 'hudmessagepanelhd', path: P.messageList, why: 'the box the messages are listed in' },
  { layout: 'hudmessagepanelhd', path: P.messageEntry, why: 'a message row: its box' },
  { layout: 'hudmessagepanelhd', path: P.messageEntryText, why: 'a message row: its text style' },
  { layout: 'hudmessagepanelhd', path: P.messageBackground, why: 'the row background' },
  { layout: 'npcdialogpanelhd', path: P.dialogPanel, why: 'the panel: its rect, padding and vertical offset' },
  { layout: 'npcdialogpanelhd', path: P.dialogBorder, why: 'the frame, and its background colour' },
  { layout: 'npcdialogpanelhd', path: P.dialogTemplates, why: 'the subtree holding the text and the button' },
  { layout: 'npcdialogpanelhd', path: P.dialogText, why: 'the body text, drawn in the layout\'s own style' },
  { layout: 'npcdialogpanelhd', path: P.dialogButton, why: 'the continue button, and its @ok caption' },
  { layout: 'messagelogpanel_800x600hd', path: P.logPanel, why: 'the merged log panel: its box' },
  { layout: 'messagelogpanel_800x600hd', path: P.logBackground, why: 'the panel background, and its colour' },
  { layout: 'messagelogpanel_800x600hd', path: P.logList, why: 'the list box the rows sit in' },
  { layout: 'messagelogpanel_800x600hd', path: P.logEntry, why: 'a row: its box, and how rows stack' },
  { layout: 'messagelogpanel_800x600hd', path: P.logEntryText, why: 'a row: its text style' },
  { layout: 'messagelogpanel_800x600hd', path: P.logScrollBar, why: 'the scroll bar, which this app has nothing to scroll' },
  { layout: 'tooltipspanelhd', path: P.tooltipsPanel, why: 'the tooltip panel: its delay and nothing else' },
  { layout: 'pauselayouthd', path: P.pausePanel, why: 'the pause panel, whose root the engine sizes to the screen' },
  { layout: 'pauselayouthd', path: P.pauseBackground, why: 'the dimmer, and its colour' },
  { layout: 'pauselayouthd', path: P.pauseLogo, why: 'the animated logo block' },
  { layout: 'pauselayouthd', path: P.pauseTitle, why: 'the @Paused title, and its text style' },
  { layout: 'pauselayouthd', path: P.pauseTable, why: 'the row the buttons are laid out in' },
  { layout: 'pauselayouthd', path: P.pauseSettings, why: 'the Options button' },
  { layout: 'pauselayouthd', path: P.pauseExit, why: 'the Save and Exit button' },
  { layout: 'pauselayouthd', path: P.pauseResume, why: 'the Return to Game button' },
  { layout: 'skillselecthd', path: P.skillSelectPanel, why: 'the chooser, and its anchor' },
  { layout: 'skillselecthd', path: P.skillTray, why: 'the tray the skills are laid out in' },
  { layout: 'skillselecthd', path: P.skillHighlight, why: 'the selection highlight' },
  { layout: 'skillselecthd', path: P.skillBorder, why: 'the frame around the chosen skill' },
  { layout: 'skillselecthd', path: P.skillButton, why: 'a skill button: its cell comes from its hotkey text rect' },
  { layout: 'skillselecthd', path: P.skillHotkey, why: 'a skill button\'s cell, and its caption style' },
  { layout: 'skillselecthd', path: P.skillQuantity, why: 'a skill button\'s second caption' },
  { layout: 'skillselecthd', path: P.skillBindText, why: 'the help line under the row' },
  { layout: 'showitemspanelhd', path: P.showItemsPanel, why: 'the panel of item labels on the ground' },
]

export interface HudExtrasProps {
  readonly game: Game
  /** Every layout the loader produced, including the bar's; look up by name. */
  readonly layers: UiLayerSet | null
  /** The served root, for art the layouts reference by file (`skillicons/`). */
  readonly base: string
  /** Whether the pause layout is up. */
  readonly paused: SignalRef<boolean>
}

// ---------------------------------------------------------------------------
// Raising an overlay
// ---------------------------------------------------------------------------

/**
 * The overlays a layout can describe but not raise.
 *
 * Exported because the retail way to raise three of them is a HUD button (`AutoMap`,
 * `Messages`, and the skill slots), and the HUD is `hud.tsx`: a button there can set
 * these instead of this module owning the only way in.
 */
export const automapVisible: SignalRef<boolean> = ref(false)
export const skillSelectVisible: SignalRef<boolean> = ref(false)
export const messageLogVisible: SignalRef<boolean> = ref(false)
export const itemLabelsVisible: SignalRef<boolean> = ref(false)

/** Whether Alt is down, which is the game's own "show items" gesture. */
const altHeld: SignalRef<boolean> = ref(false)

/** The ground item the cursor is over, or null. */
const hoveredDrop: SignalRef<Drop | null> = ref(null)

const ALT_CODES = new Set(['AltLeft', 'AltRight'])
let inputInstalled = false

/**
 * The keys and the pointer this module reads.
 *
 * Installed once, on the first render, because a layout cannot say which key raises
 * it. `Tab` and `Alt` are the game's own keys; `F` and `L` are this app's, and the
 * signals above are the interface a HUD button uses instead.
 */
function installExtraInput(game: Game): void {
  if (inputInstalled || typeof window === 'undefined') return
  inputInstalled = true
  window.addEventListener('keydown', (event) => {
    if (ALT_CODES.has(event.code)) {
      // The browser's own menu bar is on Alt, which would take focus out of the game.
      event.preventDefault()
      altHeld.value = true
      return
    }
    if (event.repeat) return
    if (event.code === 'Tab') {
      event.preventDefault()
      automapVisible.value = !automapVisible.value
    } else if (event.code === 'KeyF') skillSelectVisible.value = !skillSelectVisible.value
    else if (event.code === 'KeyL') messageLogVisible.value = !messageLogVisible.value
  })
  window.addEventListener('keyup', (event) => {
    if (ALT_CODES.has(event.code) && !event.repeat) altHeld.value = false
  })
  window.addEventListener('blur', () => {
    altHeld.value = false
  })
  window.addEventListener('pointermove', (event) => {
    const drop = groundItemAt(game, event.clientX, event.clientY)
    // Only a change of item writes the signal: a write per pointer move would
    // re-render the tooltip on every event.
    if (drop !== hoveredDrop.value) hoveredDrop.value = drop
  })
}

/**
 * The ground item under a screen point, or null.
 *
 * The same projection the canvas draws with — `toScreen` plus the camera — inverted,
 * so a point on screen lands on the tile the item is on. Kept to a tile of slack
 * because a 2:1 diamond is a poor hit target for a fingertip.
 */
function groundItemAt(game: Game, clientX: number, clientY: number): Drop | null {
  const world = toWorld(clientX - game.cameraX.value, clientY - game.cameraY.value)
  for (const drop of game.drops) {
    if (drop.item === null) continue
    if (Math.max(Math.abs(drop.x - world.x), Math.abs(drop.y - world.y)) > 1) continue
    return drop
  }
  return null
}

// ---------------------------------------------------------------------------
// Reading a layout
// ---------------------------------------------------------------------------

/** A pixel box in the viewport, which is what a `style` prop wants. */
interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** One layout's resolved tree, or null when it is not in the set. */
function rootOf(layers: UiLayerSet, name: string): ResolvedWidget | null {
  const root = layers.roots.get(name)
  if (root === undefined) return null
  return resolveScreen(root, layers.viewport, layers.source.sprites)
}

/** A panel's tree with its `basedOn` base merged in, for the files that need it. */
function mergedRoot(layers: UiLayerSet, name: string): UiWidget | null {
  const root = layers.roots.get(name)
  if (root === undefined) return null
  const base = BASED_ON.find(([derived]) => derived === name)
  if (base === undefined) return root
  const baseRoot = layers.roots.get(base[1])
  return baseRoot === undefined ? root : mergeLayout(baseRoot, root)
}

/** A widget's own resolved box, or null when the layout leaves it at zero size. */
function boxOf(widget: ResolvedWidget | null): Box | null {
  if (widget === null) return null
  const box = widget.box
  if (box.width <= 0 || box.height <= 0) return null
  return { left: box.x, top: box.y, width: box.width, height: box.height }
}

/** A box as a CSS object, for a `style` prop. */
function css(box: Box | null, fallback: Box): Record<string, string> {
  const source = box ?? fallback
  return {
    position: 'absolute',
    left: `${source.left}px`,
    top: `${source.top}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
  }
}

/**
 * A colour from the layouts and the profile, in any of the three spellings they use.
 *
 * The layouts write colours as `{r, g, b, a}` with 0-255 channels or as
 * `[r, g, b, a]` with 0-1 ones; the profile has both, and its alpha is a *fraction*
 * where an object's is a byte. `render.tsx` has the same reader; this copy exists
 * because the overlays colour text and labels the layout does not draw a widget for.
 */
function colour(value: unknown, fallback: string): string {
  const channel = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  if (Array.isArray(value)) {
    const a = value.length > 3 ? channel(value[3]) : 1
    return `rgba(${Math.round(channel(value[0]) * 255)}, ${Math.round(channel(value[1]) * 255)}, ${Math.round(
      channel(value[2]) * 255,
    )}, ${a})`
  }
  if (value !== null && typeof value === 'object') {
    const c = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
    const a = typeof c.a === 'number' ? c.a / 255 : 1
    // The two files spell a channel differently: the profile writes bytes
    // (`FontColorWhite: {r: 240}`, which needs no conversion) and a layout writes
    // fractions (`normalColor: {r: 0.31}`, which is 79). A set that is all at or below
    // one is the fractional spelling; `{r: 0, g: 0, b: 0}` is black either way.
    const raw = [channel(c.r), channel(c.g), channel(c.b)]
    const scale = raw.every((entry) => entry <= 1) ? 255 : 1
    return `rgba(${Math.round(raw[0] * scale)}, ${Math.round(raw[1] * scale)}, ${Math.round(raw[2] * scale)}, ${a})`
  }
  return fallback
}

/**
 * A text widget's style, for text this module draws itself.
 *
 * The same reading `render.tsx` does (`style.fontColor`, `pointSize` outside the
 * block, the drop shadow), kept local because a tooltip's lines and a log row are
 * text the layout has no widget for — the layout states the style, this draws it.
 */
function textStyle(widget: ResolvedWidget | null, fallbackSize = 26): Record<string, string> {
  const style: Record<string, string> = {
    'font-family': 'var(--font-game)',
    'font-size': `${fallbackSize}px`,
    'white-space': 'pre-wrap',
    'pointer-events': 'none',
  }
  if (widget === null) return style
  const fields = widget.widget.fields
  // Two spellings: a widget styles itself with `style`, and a box that draws text it
  // is handed styles it under `text/style` (the message rows do both, in different
  // files of the same family).
  const raw = fields.style ?? fields['text/style']
  if (raw !== null && raw !== undefined && typeof raw === 'object') {
    const source = raw as Record<string, unknown>
    style.color = colour(source.fontColor ?? source.color, 'rgb(240,240,240)')
    const alignment = source.alignment as { h?: unknown } | undefined
    if (alignment !== undefined && typeof alignment === 'object') {
      style['text-align'] = alignment.h === 'center' ? 'center' : alignment.h === 'right' ? 'right' : 'left'
    }
    const shadow = source.dropShadow as { shadowOffsetX?: unknown; shadowOffsetY?: unknown; shadowColor?: unknown } | undefined
    if (shadow !== null && shadow !== undefined && typeof shadow === 'object') {
      const ox = typeof shadow.shadowOffsetX === 'number' ? shadow.shadowOffsetX : 2
      const oy = typeof shadow.shadowOffsetY === 'number' ? shadow.shadowOffsetY : 2
      style['text-shadow'] = `${ox}px ${oy}px 0 ${colour(shadow.shadowColor, 'rgba(0,0,0,0.67)')}`
    }
  }
  const pointSize = fieldNumber(fields, 'pointSize') ?? fieldNumber(fields, 'text/pointSize')
  if (pointSize !== undefined) style['font-size'] = `${pointSize}px`
  return style
}

/** The text a widget's own layout definition carries, resolved through the tables. */
function captionOf(layers: UiLayerSet, widget: ResolvedWidget | null): string | undefined {
  if (widget === null) return undefined
  return layers.source.strings.resolve(widgetText(widget.widget))
}

/** Draw one resolved layout, with the options a screen is drawn with. */
function draw(root: ResolvedWidget, layers: UiLayerSet, options: Omit<UiRenderOptions, 'sprites'> = {}): unknown {
  return renderScreen(root, layers.viewport, {
    sprites: layers.source.sprites,
    unit: unitOf(layers.viewport),
    ...options,
  })
}

/**
 * One resolved layout, as a component.
 *
 * A layout is drawn by `renderScreen`, and the value it returns is a mountable — not
 * text. Writing that call in a child position would have the compiler render it as
 * text (`renderText(...)`), which throws on anything that is not text, so the two
 * layouts this module draws through the renderer are elements of this component
 * instead. `as never` is what the return needs: `renderScreen` is typed `unknown`, and
 * `never` is the one thing a component may return besides an element.
 */
function LayoutScreen(props: {
  layers: UiLayerSet
  root: ResolvedWidget
  text?: (widget: ResolvedWidget) => string | undefined
  onActivate?: (widget: ResolvedWidget, event: Event) => void
  skip?: (widget: ResolvedWidget) => boolean
}) {
  const layers = props.layers
  const root = props.root
  const text = props.text
  const onActivate = props.onActivate
  const skip = props.skip
  return draw(root, layers, { text, onActivate, skip }) as never
}

/**
 * The nine-tile border a `NineTileImageWidget` names, as a CSS `border-image`.
 *
 * The four slice values are measured from the *atlas'* edges, so they have to be
 * offset by the cell's own origin: the corner a border draws is a quarter of the cell's
 * shorter side, and the cell sits somewhere in a 2048-texel sheet. A texel is two
 * layout units, which is what turns the slice into the border's width in pixels.
 */
function borderImageOf(frame: UiFrame, unit: number, tileScale = 1): Record<string, string> {
  const slice = Math.round(Math.min(frame.sw, frame.sh) / 4)
  const border = Math.round(slice * 2 * unit * tileScale)
  const right = frame.atlasWidth - frame.sx - frame.sw + slice
  const bottom = frame.atlasHeight - frame.sy - frame.sh + slice
  return {
    borderStyle: 'solid',
    borderWidth: `${border}px`,
    borderColor: 'transparent',
    borderImageSource: `url(${frame.url})`,
    borderImageSlice: `${frame.sy + slice} ${right} ${bottom} ${frame.sx + slice}`,
    borderImageRepeat: 'stretch',
    boxSizing: 'border-box',
  }
}

// ---------------------------------------------------------------------------
// The profile
// ---------------------------------------------------------------------------

/**
 * The HD profile, whose named values the engine reads directly.
 *
 * A layout resolves its `$Name` references at parse time, so a widget's own fields
 * arrive resolved. The two things this module needs are *not* on a widget: the item
 * tooltip's style and the label on an item lying on the ground. Both live in
 * `_profilehd.json` (`TooltipStyle`, with its padding, background colours and the
 * per-rarity text colours), so the file is fetched once per served root.
 */
const profiles = new Map<string, SignalRef<LayoutGlobals | null>>()

function profileFor(base: string): SignalRef<LayoutGlobals | null> {
  const cached = profiles.get(base)
  if (cached !== undefined) return cached
  const signal: SignalRef<LayoutGlobals | null> = ref(null)
  profiles.set(base, signal)
  void (async (): Promise<void> => {
    try {
      const response = await fetch(`${base}original/ui/global/ui/layouts/${HD_PROFILE}.json`, { cache: 'no-store' })
      if (!response.ok) return
      signal.value = parseProfile(await response.text())
    } catch (error) {
      console.warn('rasen: the HD profile could not be read, the tooltip draws without it', String(error))
    }
  })()
  return signal
}

/** `$TooltipStyle`, the profile's item tooltip, or null before it has been read. */
function tooltipStyle(profile: LayoutGlobals | null): Record<string, unknown> | null {
  const style = profile?.get('TooltipStyle')
  return style !== null && style !== undefined && typeof style === 'object'
    ? (style as Record<string, unknown>)
    : null
}

/** A tooltip padding, as a CSS shorthand: `[left, top, right, bottom]` in units. */
function paddingCss(value: unknown, unit: number, fallback: readonly number[]): string {
  const list = Array.isArray(value) ? value : fallback
  const at = (index: number, def: number): number => {
    const entry = list[index]
    return Math.round((typeof entry === 'number' && Number.isFinite(entry) ? entry : def) * unit)
  }
  return `${at(1, fallback[1])}px ${at(2, fallback[2])}px ${at(3, fallback[3])}px ${at(0, fallback[0])}px`
}

/**
 * An item's name in the rarity colour the profile gives it.
 *
 * The five colours are the profile's own (`DefaultColor`, `MagicColor`, `RareColor`,
 * `UniqueColor`); this is the same mapping `hud.tsx` draws in CSS, from the data
 * instead of from a table of hex strings.
 */
function rarityColour(style: Record<string, unknown> | null, rarity: Rarity): string {
  const key =
    rarity === 'magic' ? 'MagicColor' : rarity === 'rare' ? 'RareColor' : rarity === 'unique' ? 'UniqueColor' : 'DefaultColor'
  return colour(style?.[key], '#e8e2d0')
}

// ---------------------------------------------------------------------------
// State that outlives one render
// ---------------------------------------------------------------------------

/**
 * The area the plaque is showing, its timer, and whether it is up.
 *
 * Module level rather than a ref made in a component: `HudExtras` is called as a
 * function inside the HUD's own render, so anything created in a component body here
 * would be created again on every re-render of the HUD, and the plaque's timer would
 * be lost between frames.
 */
let levelNameShown = ''
let levelNameTimer: ReturnType<typeof setTimeout> | null = null
const levelNameVisible: SignalRef<boolean> = ref(false)

/** Which skill the chooser's frame is on. */
const skillSelectIndex: SignalRef<number> = ref(0)

// ---------------------------------------------------------------------------
// The overlays
// ---------------------------------------------------------------------------

/** The whole viewport, for the widgets the layout marks `fitToScreen`/`fitToParent`. */
function fullScreenBox(viewport: Viewport): Box {
  return { left: 0, top: 0, width: viewport.width, height: viewport.height }
}

/**
 * The colour the game fills a `RectangleWidget` with.
 *
 * The layouts write it as `[r, g, b, a]` with 0-1 channels, which is the spelling
 * `TransparentBG`, `MessageLogBackground` and `MessageBackground` all use. `render.tsx`
 * reads `backgroundColor` arrays and not `color`, so the four dimmers in these screens
 * are painted here rather than drawn as empty boxes.
 */
function rectangleColour(widget: ResolvedWidget | null, fallback: string): string {
  const value = widget?.widget.fields.color ?? widget?.widget.fields.backgroundColor
  return colour(value, fallback)
}

/** The art a layout widget names, for the frames this module draws itself. */
function frameName(widget: ResolvedWidget): string {
  return fieldString(widget.widget.fields, 'filename') ?? ''
}

/** A resolved widget's own `style` block, for the readers that need one value out of it. */
function styleOf(widget: ResolvedWidget | null): Record<string, unknown> {
  const raw = widget?.widget.fields.style
  return raw !== null && raw !== undefined && typeof raw === 'object'
    ? (raw as Record<string, unknown>)
    : {}
}

/** The keys `main.tsx` binds the simulation's three action slots to. */
const SLOT_KEYS: Record<SkillId, string> = {
  fireball: '2',
  nova: '3',
  potion: 'Space',
}

/**
 * A string table's colour codes, as runs of text.
 *
 * Twenty-two of the UI strings carry D2's own colour escapes — the skill line is
 * `Press ÿc4%s-%sÿc0 to bind a skill` — and the game's text renderer turns them into a
 * colour change mid-line. The palette is D2's own: the character after `ÿc` is its
 * index.
 */
const TEXT_COLOURS: readonly string[] = [
  '#ffffff', // 0
  '#ff4d4d', // 1
  '#00ff00', // 2
  '#6969ff', // 3
  '#c7b377', // 4 gold
  '#808080', // 5
  '#000000', // 6
  '#dcdcdc', // 7
  '#ffa800', // 8
  '#ffff64', // 9
]

function colourRuns(text: string): Array<{ text: string; colour: string }> {
  const runs: Array<{ text: string; colour: string }> = []
  let current = TEXT_COLOURS[0]
  let rest = text
  while (rest.length > 0) {
    const at = rest.indexOf('\u00ffc')
    if (at === -1) break
    if (at > 0) runs.push({ text: rest.slice(0, at), colour: current })
    current = TEXT_COLOURS[Number(rest[at + 2])] ?? current
    rest = rest.slice(at + 3)
  }
  if (rest.length > 0) runs.push({ text: rest, colour: current })
  return runs.length > 0 ? runs : [{ text, colour: current }]
}

/** The retail icon for one of the simulation's skill slots. */
function skillIcon(game: Game, base: string, id: SkillId, size: number): string {
  const file = game.iconFor(id)
  return file === null ? hudIcon(id, size) : `${base}original/${file}`
}

/** One row of a list: the box the layout gives the row template, stacked. */
function listRowBox(list: Box, row: Box, index: number, bottomUp: boolean): Box {
  const top = bottomUp
    ? list.top + list.height - (index + 1) * row.height
    : row.top + index * row.height
  return { left: row.left, top, width: row.width, height: row.height }
}

/**
 * The automap.
 *
 * The layout for this one is a *setting* rather than a drawing: `automaphd` carries no
 * art and no rect, and what it does carry is how the automap behaves — a third of the
 * screen (`miniScreenSizeFraction`), its inset from the edge it docks to
 * (`miniOffsetRight`, and `miniOffsetLeft` for the other side), and the four opacities
 * its fade modes use. The map itself is drawn by the game's own code from the level the
 * player is standing in, which is why the picture below is the level this simulation
 * holds and the dots are the blips it publishes: the *map* is the simulation's own
 * state, the *geometry, the fade and the docking side* are the layout's.
 *
 * The per-tile sheets the layout names (`AUTOMAP/Default00/Tiles` … `Default14`, plus
 * the act-specific ones) are not in this export: the package ships only the Act 4 and
 * Act 5 town sheets, which no Act 1 area uses, so the tile-by-tile automap the retail
 * game assembles cannot be drawn from this data.
 */
function AutoMapOverlay(props: {
  game: Game
  layers: UiLayerSet | null
  open: SignalRef<boolean>
}) {
  const layers = props.layers
  const open = props.open
  const game = props.game
  if (layers === null) return null
  const loaded = layers
  const hud = game.hud
  const mapImage = game.minimapImage

  const drawAutoMap = (): unknown => {
    const viewport = loaded.viewport
    const unit = unitOf(viewport)
    const fields = widgetAt(rootOf(loaded, 'automaphd'), P.autoMapPanel)?.widget.fields ?? {}
    const fraction = fieldNumber(fields, 'miniScreenSizeFraction') ?? 1 / 3
    const offset = fieldPair(fields, 'miniOffsetRight') ?? { x: 0, y: 0 }
    const opacity = fieldNumber(fields, 'maxOpacity') ?? 1
    // A square on the screen's shorter side, docked to its right edge, inset by the
    // pair's own units.
    const side = Math.round(fraction * Math.min(viewport.width, viewport.height))
    const box: Box = {
      left: viewport.width - side + offset.x * unit,
      top: offset.y * unit,
      width: side,
      height: side,
    }
    return (
      <div
        data-ui-extra="automaphd"
        data-ui-name="AutoMap"
        style={{
          ...css(box, fullScreenBox(viewport)),
          opacity: String(opacity),
          background: 'rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        <img
          src={mapImage}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '100%',
            height: '100%',
            'image-rendering': 'pixelated',
          }}
        />
        {each(hud.minimap, (blip: MinimapBlip) => {
          // Bound rather than read in the prop: a member expression in a prop arrives
          // as a getter.
          const kind = blip.kind
          return (
          <div
            data-ui-extra="automap-blip"
            data-ui-blip={kind}
            style={() => ({
              position: 'absolute',
              width: kind === 'monster' ? '5px' : '8px',
              height: kind === 'monster' ? '5px' : '8px',
              margin: kind === 'monster' ? '-2.5px 0 0 -2.5px' : '-4px 0 0 -4px',
              'border-radius': '50%',
              // The dots are the engine's own drawing — the package has no art for
              // them — and these are the colours the HUD's own minimap draws them in.
              background: kind === 'hero' ? '#ffe9a8' : kind === 'boss' ? '#ff8a2e' : '#d8493a',
              'box-shadow':
                kind === 'monster' ? '0 0 4px rgba(216,73,58,0.9)' : '0 0 8px rgba(232,215,94,0.8)',
              left: `${(blip.x.value / hud.mapWidth) * 100}%`,
              top: `${(blip.y.value / hud.mapHeight) * 100}%`,
            })}
          />
          )
        })}
      </div>
    )
  }

  return when({
    condition: () => open.value,
    then: () => drawAutoMap() as never,
  })
}

/**
 * The boss and elite health bar.
 *
 * The layout stacks three things at the top centre of the screen: the bar
 * (`HealthBarWidget "Health"` — a *procedural* bar: it names no art and carries its
 * colours and transparencies instead), the monster's name centred in it, and two
 * caption lines below (`Unique` at 85 units, `Additional` at 130, which is what fixes
 * the bar's height at 74 units). The health it shows is the simulation's own boss:
 * `hud.boss` carries the name and the fraction of life left.
 *
 * The one number here that cannot be read as units is the bar's *width*: 45 units is
 * 18.75 px at a 900-pixel height, narrower than the bar is tall, and no art sizes the
 * widget (the only monster-bar art in the package is the controller set,
 * `Controller/HUD/MonsterHealth/*`, which the *controller* layout points at and this
 * one does not). Read as a share of the viewport the same number draws the long bar
 * the game has, so `45` and `74` are read as *percent of the viewport width* and
 * *layout units* — the one place in this file where a layout number is read that way.
 * The verifier prints the widget's resolved box either way, so the reading is visible.
 *
 * `Unique` and `Additional` are drawn empty: they are the monster's class label and its
 * modifiers, and `BossView` carries neither (`monster.kind === 'brute'` is the whole of
 * what the simulation knows about a boss). Empty is the honest state; a label invented
 * here would be a stand-in for the game's own text.
 */
function MonsterHealthOverlay(props: { game: Game; layers: UiLayerSet | null }) {
  const layers = props.layers
  const game = props.game
  if (layers === null) return null
  const loaded = layers
  const boss = game.hud.boss

  const drawBar = (): unknown => {
    const root = rootOf(loaded, 'hudmonsterhealthhd')
    const bar = widgetAt(root, P.monsterHealthBar)
    const name = widgetAt(root, P.monsterHealthName)
    const unique = widgetAt(root, P.monsterHealthUnique)
    const additional = widgetAt(root, P.monsterHealthAdditional)
    const viewport = loaded.viewport
    const barBox = boxOf(bar)
    if (barBox === null) return null
    const fields = bar?.widget.fields ?? {}
    const rect = (fields.rect ?? {}) as { width?: unknown }
    // The layout's own number for the length: a share of the viewport width where the
    // layout states one, and the resolved box when it does not.
    const width =
      typeof rect.width === 'number'
        ? Math.round((rect.width / 100) * viewport.width)
        : barBox.width
    const track: Box = { left: barBox.left, top: barBox.top, width, height: barBox.height }
    const background = colour(fields.normalColor, 'rgba(79,0,0,1)')
    const trackOpacity = String(fieldNumber(fields, 'backgroundTransparency') ?? 0.75)
    const fillOpacity = String(fieldNumber(fields, 'transparency') ?? 0.75)
    const captionTop = (widget: ResolvedWidget | null): string =>
      `${Math.round((widget?.box.y ?? track.top) - track.top)}px`
    const trackStyle = css(track, track)
    // A plain object, not a function: `style={() => ({…})}` is bound as
    // `bindStyle(node, () => () => ({…}))` by this compiler, so the element receives the
    // *function* rather than the object and nothing is styled. The bar's ratio is read
    // here instead, and the whole subtree is rebuilt whenever the boss view changes —
    // which it does on every sync, because the view is a new object each time.
    const fillStyle: Record<string, string> = {
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: `${Math.max(0, Math.min(1, boss.value?.hp ?? 0)) * 100}%`,
      height: '100%',
      background,
      opacity: fillOpacity,
    }
    return (
      <div data-ui-extra="hudmonsterhealthhd" style={trackStyle}>
        <div
          data-ui-name="Health"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '100%',
            height: '100%',
            background,
            opacity: trackOpacity,
          }}
        />
        <div data-ui-extra="health-fill" style={fillStyle} />
        <div
          data-ui-name="Name"
          style={{
            ...textStyle(name, 38),
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '100%',
            height: '100%',
            display: 'flex',
            'flex-direction': 'column',
            'justify-content': 'center',
            'align-items': 'center',
          }}
        >
          {boss.value?.name ?? ''}
        </div>
        <div
          data-ui-name="Unique"
          style={{ ...textStyle(unique, 26), position: 'absolute', left: '0px', top: captionTop(unique), width: '100%' }}
        />
        <div
          data-ui-name="Additional"
          style={{
            ...textStyle(additional, 26),
            position: 'absolute',
            left: '0px',
            top: captionTop(additional),
            width: '100%',
          }}
        />
      </div>
    )
  }

  return when({
    condition: () => boss.value !== null,
    then: () => drawBar() as never,
  })
}

/**
 * The area name plaque.
 *
 * Text and nothing else: the layout places `NameText` a quarter of the way down the
 * screen in the game's own red 54-point face, and `displaySeconds` (2.5) is how long the
 * game leaves it up. Position, face, colour and duration are the layout's; the name is
 * the one the level tables give the area the hero is standing in.
 *
 * The change is noticed inside the condition because `when` is this framework's only
 * reactive primitive: the condition re-runs when the area changes — exactly when the
 * count starts — and the timer's own write is what takes the plaque down again.
 */
function LevelNameOverlay(props: { game: Game; layers: UiLayerSet | null }) {
  const layers = props.layers
  const game = props.game
  if (layers === null) return null
  const loaded = layers
  const areaName = game.hud.areaName

  const condition = (): boolean => {
    const name = areaName.value
    if (name !== levelNameShown) {
      levelNameShown = name
      const panel = widgetAt(rootOf(loaded, 'hudlevelnameshd'), P.levelNamePanel)
      const seconds = fieldNumber(panel?.widget.fields ?? {}, 'displaySeconds') ?? 2.5
      if (levelNameTimer !== null) clearTimeout(levelNameTimer)
      if (name !== '') {
        levelNameVisible.value = true
        levelNameTimer = setTimeout(() => {
          levelNameVisible.value = false
        }, seconds * 1000)
      }
    }
    return levelNameVisible.value
  }
  const plaqueText = (widget: ResolvedWidget): string | undefined =>
    widget.widget.name === P.levelNameText[1] ? areaName.value : undefined

  const drawLevelName = (): unknown => {
    const root = rootOf(loaded, 'hudlevelnameshd')
    if (root === null) return null
    // `DesecratedText` is left empty because it is the terror-zone name and the sim has
    // no terror zones; `denOfEvilQuestHack`, the panel's other text field, is the
    // engine's quest trigger, which this simulation does not model either.
    return <LayoutScreen layers={loaded} root={root} text={plaqueText} />
  }

  return when({
    condition,
    then: () => drawLevelName() as never,
  })
}

/**
 * The message log.
 *
 * `messagelogpanel_800x600hd` is `basedOn` `MessageLogPanel_640x480HD` and inherits
 * every box from it, which is why that base is loaded too and merged in here. The rows
 * are the simulation's log — what the game announced — in the row style the base file
 * states, coloured by the rarity colour the profile gives that kind of message, stacked
 * upwards because the list says `growsBottomUp`.
 *
 * The scroll bar is not drawn: the simulation keeps five entries, so there is nothing to
 * scroll, and its art (`PauseMenu\VerticalIndicator` and two arrows) is named by
 * `ScrollControllerWidget` fields rather than by a `filename`, so no renderer would draw
 * it as it stands.
 */
function MessageLogOverlay(props: { game: Game; layers: UiLayerSet | null; base: string }) {
  const layers = props.layers
  const game = props.game
  const base = props.base
  if (layers === null) return null
  const loaded = layers
  const log = game.hud.log
  const profile = profileFor(base)

  const drawLog = (): unknown => {
    const root = mergedRoot(loaded, 'messagelogpanel_800x600hd')
    const panel = root === null ? null : resolveScreen(root, loaded.viewport, loaded.source.sprites)
    const background = widgetAt(panel, P.logBackground)
    const list = widgetAt(panel, P.logList)
    const entry = widgetAt(panel, P.logEntry)
    const entryText = widgetAt(panel, P.logEntryText)
    const panelBox = boxOf(panel)
    const listBox = boxOf(list) ?? panelBox
    const rowBox = boxOf(entry)
    if (listBox === null || rowBox === null) return null
    const bottomUp = list === null ? true : fieldFlag(list.widget.fields, 'growsBottomUp', true)
    const style = tooltipStyle(profile.value)
    const rows = log.value
    // Bound above the JSX: a call expression in a prop is wrapped in a getter by this
    // compiler, so the attribute would receive the wrapper rather than the object.
    const frameBox = css(panelBox ?? listBox, listBox)
    return (
      <div
        data-ui-extra="messagelogpanel_800x600hd"
        data-ui-name="MessageLogPanel_800x600"
        style={frameBox}
      >
        <div
          data-ui-name="MessageLogBackground"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '100%',
            height: '100%',
            background: rectangleColour(background, 'rgba(0,0,0,0.7)'),
          }}
        />
        {each(rows, (line: LogEntry, index: number) => (
          <div
            data-ui-extra="log-row"
            style={{
              ...textStyle(entryText, 26),
              color: rarityColour(style, line.rarity),
              position: 'absolute',
              left: `${listRowBox(listBox, rowBox, index, bottomUp).left - (panelBox ?? listBox).left}px`,
              top: `${listRowBox(listBox, rowBox, index, bottomUp).top - (panelBox ?? listBox).top}px`,
              width: `${rowBox.width}px`,
              height: `${rowBox.height}px`,
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
    )
  }

  return when({
    condition: () => messageLogVisible.value && log.value.length > 0,
    then: () => drawLog() as never,
  })
}

/**
 * The centre-screen messages.
 *
 * `HUDMessagePanel` is the game's own message area: `ChatEntryTemplate` is the row the
 * engine clones per message, `MessageBackground` the dimmer behind them and the list
 * grows upwards. The rows are the same simulation log the message log shows — the two
 * panels are ten units apart on screen — so only the newest line is drawn here, and only
 * while the log is shut: together they are one list in two sizes, as in the game, where
 * this one is the message that just happened and the log is the history you open.
 */
function MessageOverlay(props: { game: Game; layers: UiLayerSet | null; base: string }) {
  const layers = props.layers
  const game = props.game
  const base = props.base
  if (layers === null) return null
  const loaded = layers
  const log = game.hud.log
  const profile = profileFor(base)

  const drawMessages = (): unknown => {
    const root = rootOf(loaded, 'hudmessagepanelhd')
    const list = widgetAt(root, P.messageList)
    const entry = widgetAt(root, P.messageEntry)
    const entryText = widgetAt(root, P.messageEntryText)
    const background = widgetAt(root, P.messageBackground)
    const listBox = boxOf(list)
    const rowBox = boxOf(entry)
    if (listBox === null || rowBox === null) return null
    const bottomUp = list === null ? true : fieldFlag(list.widget.fields, 'growsBottomUp', true)
    const style = tooltipStyle(profile.value)
    const newest = log.value.slice(0, 1)
    const frameBox = css(listBox, listBox)
    return (
      <div data-ui-extra="hudmessagepanelhd" data-ui-name="HUDMessagePanel" style={frameBox}>
        <div
          data-ui-name="MessageBackground"
          style={{
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '100%',
            height: '100%',
            background: rectangleColour(background, 'rgba(0,0,0,0.7)'),
          }}
        />
        {each(newest, (line: LogEntry, index: number) => (
          <div
            data-ui-extra="message"
            style={{
              ...textStyle(entryText, 26),
              color: rarityColour(style, line.rarity),
              position: 'absolute',
              left: `${listRowBox(listBox, rowBox, index, bottomUp).left - listBox.left}px`,
              top: `${listRowBox(listBox, rowBox, index, bottomUp).top - listBox.top}px`,
              width: `${rowBox.width}px`,
              height: `${rowBox.height}px`,
            }}
          >
            {line.text}
          </div>
        ))}
      </div>
    )
  }

  return when({
    condition: () => log.value.length > 0 && !messageLogVisible.value,
    then: () => drawMessages() as never,
  })
}

/**
 * The item labels on the ground.
 *
 * `showitemspanelhd` states a panel and a duration and nothing else, because the labels
 * are drawn at the items: this projects each item's tile through the same transform the
 * canvas draws it with and lifts the label off it. The label's colour is the profile's
 * `inGameBackgroundColor` — the comment beside it in the profile says it is exactly the
 * in-game item label background — and the name is the item's rarity colour.
 *
 * Held Alt is the game's own gesture for these, and {@link itemLabelsVisible} is the same
 * switch for a host with no Alt. The panel's `showDurationMilliseconds` (10 000) is the
 * linger the game gives a label after the gesture ends; nothing here ticks while the game
 * is idle, so the labels go with the key rather than outliving it.
 */
function ShowItemsOverlay(props: { game: Game; layers: UiLayerSet | null; base: string }) {
  const layers = props.layers
  const game = props.game
  const base = props.base
  if (layers === null) return null
  const loaded = layers
  const profile = profileFor(base)

  const drawLabels = (): unknown => {
    const style = tooltipStyle(profile.value)
    const font = textStyle(null, fieldNumber((style?.fontStyle ?? {}) as Record<string, unknown>, 'pointSize') ?? 36)
    const unit = unitOf(loaded.viewport)
    const screen = fullScreenBox(loaded.viewport)
    const frameBox = css(screen, screen)
    return (
      <div data-ui-extra="showitemspanelhd" data-ui-name="ShowItemsPanel" style={frameBox}>
        {each(visibleLabels(game), (drop: Drop) => (
          <div
            data-ui-extra="item-label"
            style={() => {
              const point = toScreen(drop.x, drop.y)
              return {
                position: 'absolute',
                left: `${Math.round(point.x + game.cameraX.value)}px`,
                top: `${Math.round(point.y + game.cameraY.value)}px`,
                transform: 'translate(-50%, -100%)',
                padding: paddingCss(style?.padding, unit, [20, 12, 20, 12]),
                background: colour(style?.inGameBackgroundColor, 'rgba(0,0,0,0.6)'),
                'white-space': 'nowrap',
              }
            }}
          >
            <span
              data-ui-extra="item-label-name"
              style={{ ...font, color: rarityColour(style, drop.item?.rarity ?? 'common') }}
            >
              {drop.item?.name ?? ''}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return when({
    condition: () => {
      if (!altHeld.value && !itemLabelsVisible.value) return false
      // The loot list is a signal, and it is what moves when an item drops or is taken.
      return game.renderList.value.length > 0 && visibleLabels(game).length > 0
    },
    then: () => drawLabels() as never,
  })
}

/** The items lying on the ground, which are the ones a label is drawn for. */
function visibleLabels(game: Game): Drop[] {
  return game.drops.filter((drop) => drop.item !== null)
}

/**
 * The item tooltip.
 *
 * `tooltipspanelhd` is another panel the engine draws by code: it states the panel's
 * priority (the game's topmost) and its `showDelayMilliseconds`, and nothing else,
 * because the frame, the padding, the background and the per-rarity text colours are all
 * in the profile's `TooltipStyle`, which is where these come from.
 *
 * It is raised by hovering the ground: the cursor is projected back through the same
 * `toScreen` transform the canvas draws with, and the item under it gets the tooltip its
 * *generator* wrote — its name, and the affix lines it was rolled with. The box is
 * anchored on the item's own tile rather than on the cursor so that it does not have to
 * re-render on every pointer move.
 */
function TooltipOverlay(props: { game: Game; layers: UiLayerSet | null; base: string }) {
  const layers = props.layers
  const game = props.game
  const base = props.base
  if (layers === null) return null
  const loaded = layers
  const profile = profileFor(base)

  const drawTooltip = (): unknown => {
    const hovered = hoveredDrop.value
    const item = hovered?.item ?? null
    if (hovered === null || item === null) return null
    const style = tooltipStyle(profile.value)
    const unit = unitOf(loaded.viewport)
    const font = textStyle(null, fieldNumber((style?.fontStyle ?? {}) as Record<string, unknown>, 'pointSize') ?? 36)
    const point = toScreen(hovered.x, hovered.y)
    const tooltipLines = (item.tooltip ?? []).join('\n')
    return (
      <div
        data-ui-extra="tooltipspanelhd"
        data-ui-name="TooltipsPanel"
        style={() => ({
          position: 'absolute',
          left: `${Math.round(point.x + game.cameraX.value)}px`,
          top: `${Math.round(point.y + game.cameraY.value)}px`,
          transform: 'translate(-50%, -100%)',
          padding: paddingCss(style?.padding, unit, [20, 12, 20, 12]),
          background: colour(style?.backgroundColor, 'rgba(0,0,0,0.75)'),
          'max-width': `${Math.round(loaded.viewport.width * 0.4)}px`,
        })}
      >
        <div
          data-ui-extra="tooltip-name"
          style={{ ...font, color: rarityColour(style, item.rarity), 'text-align': 'center' }}
        >
          {item.name}
        </div>
        {tooltipLines === '' ? null : (
          <div
            data-ui-extra="tooltip-lines"
            style={{ ...font, color: colour(style?.DefaultColor, '#ffffff'), 'text-align': 'center' }}
          >
            {tooltipLines}
          </div>
        )}
      </div>
    )
  }

  return when({
    condition: () => {
      const hovered = hoveredDrop.value
      if (hovered === null) return false
      // `renderList` moves when loot is picked up or despawns; it is the signal that
      // takes the tooltip down when the item under the cursor goes away.
      return game.renderList.value.length > 0 && game.drops.includes(hovered)
    },
    then: () => drawTooltip() as never,
  })
}

/**
 * The skill chooser.
 *
 * `skillselecthd` is a tray of `SkillSelectButtonWidget`s the engine lays out: the layout
 * states the tray (`SelectionTray`, 1440 units wide, anchored to the bottom of the
 * screen), the cell a button occupies (`$SkillHotkeyTextRect`, 132 x 124 units — the same
 * rect its hotkey caption is drawn in), the gap between them (`skillPadding`) and the
 * frame that marks the chosen one (`PANEL/SkillSelect/Selected`), but not the positions,
 * which follow from how many skills there are.
 *
 * The skills are the simulation's own action slots, with the retail icons the export
 * turned into `skillicons/`, the app's key in the hotkey caption, the mana cost in the
 * second caption and the layout's own help line below — with the two `%s` the game
 * substitutes for the keys its two mouse buttons carry. Pressing one uses it. The
 * layout's `displayGroups` groups skills by `skills.txt` categories, which
 * `Game.classSkills()` does not expose, so the tray is one row rather than five.
 */
function SkillSelectOverlay(props: { game: Game; layers: UiLayerSet | null; base: string }) {
  const layers = props.layers
  const game = props.game
  const base = props.base
  if (layers === null) return null
  const loaded = layers
  const skills = game.hud.skills

  const drawChooser = (): unknown => {
    const root = rootOf(loaded, 'skillselecthd')
    const panel = widgetAt(root, P.skillSelectPanel)
    const tray = widgetAt(root, P.skillTray)
    const cellRef = widgetAt(root, P.skillHotkey)
    const border = widgetAt(root, P.skillBorder)
    const quantity = widgetAt(root, P.skillQuantity)
    const bindText = widgetAt(root, P.skillBindText)
    const trayBox = boxOf(tray)
    const cell = boxOf(cellRef)
    if (trayBox === null || cell === null) return null
    const unit = unitOf(loaded.viewport)
    const padding = fieldPair(panel?.widget.fields ?? {}, 'skillPadding') ?? { x: 4, y: 4 }
    const step = cell.width + padding.x * unit
    const rows = skills.value
    const chosen = rows[skillSelectIndex.value % Math.max(rows.length, 1)]
    const borderFrame = border === null ? null : loaded.source.sprites.frame(frameName(border), 0)
    const help = captionOf(loaded, bindText) ?? ''
    const helpText = help
      .replace('%s-%s', rows.slice(0, 2).map((view) => SLOT_KEYS[view.id] ?? view.id).join('-'))
      .replace(/%s/g, '')
    // Bound above the JSX: a call in a child position is hoisted as text by this
    // framework's compiler, and the runs are objects because `each` keys them.
    const helpRuns = colourRuns(helpText)
    const onUse = (id: SkillId): void => {
      game.useSkill(id)
      skillSelectVisible.value = false
    }
    const screen = fullScreenBox(loaded.viewport)
    const frameBox = css(screen, screen)
    return (
      <div data-ui-extra="skillselecthd" data-ui-name="SkillSelect" style={frameBox}>
        <div data-ui-name="SelectionTray" style={{ ...css(trayBox, trayBox), overflow: 'hidden' }}>
          {each(rows, (view: SkillView, index: number) => {
            const skillId = view.id
            const hotkey = SLOT_KEYS[skillId] ?? ''
            const mana = view.mana > 0 ? String(view.mana) : ''
            const iconUrl = skillIcon(game, base, skillId, Math.round(cell.width))
            return (
              <div
                data-ui-extra="skill-slot"
                data-ui-skill={skillId}
                onPointerDown={() => onUse(skillId)}
                style={() => ({
                  position: 'absolute',
                  left: `${padding.x * unit + index * step}px`,
                  top: `${padding.y * unit}px`,
                  width: `${cell.width}px`,
                  height: `${cell.height}px`,
                  background: 'rgba(0,0,0,0.55)',
                  opacity: view.ready && view.affordable ? '1' : '0.55',
                  'pointer-events': 'auto',
                  'background-image': `url(${iconUrl})`,
                  'background-size': 'contain',
                  'background-repeat': 'no-repeat',
                  'background-position': 'center',
                })}
              >
                <span
                  data-ui-extra="skill-hotkey"
                  style={{
                    ...textStyle(cellRef, 22),
                    position: 'absolute',
                    left: '0px',
                    bottom: '0px',
                    width: '100%',
                    'text-align': 'center',
                  }}
                >
                  {hotkey}
                </span>
                <span
                  data-ui-extra="skill-mana"
                  style={{
                    ...textStyle(quantity, 22),
                    position: 'absolute',
                    left: '0px',
                    top: '0px',
                    width: '100%',
                    'text-align': 'center',
                  }}
                >
                  {mana}
                </span>
              </div>
            )
          })}
          {chosen === undefined || borderFrame === null ? null : (
            <div
              data-ui-name="SelectionBorder"
              style={{
                position: 'absolute',
                left: `${padding.x * unit + rows.indexOf(chosen) * step - 3 * unit}px`,
                top: `${padding.y * unit - 4 * unit}px`,
                width: `${cell.width + 6 * unit}px`,
                height: `${cell.height + 8 * unit}px`,
                'background-image': `url(${borderFrame.url})`,
                'background-size': '100% 100%',
              }}
            />
          )}
        </div>
        <div
          data-ui-name="SkillBindText"
          style={{
            ...textStyle(bindText, 34),
            position: 'absolute',
            left: `${Math.round(trayBox.left + trayBox.width / 2 - loaded.viewport.width * 0.3)}px`,
            top: `${Math.round(bindText?.box.y ?? trayBox.top)}px`,
            width: `${Math.round(loaded.viewport.width * 0.6)}px`,
            'text-align': 'center',
          }}
        >
          {each(helpRuns, (run: { text: string; colour: string }) => (
            <span data-ui-extra="skill-help-run" style={{ color: run.colour }}>
              {run.text}
            </span>
          ))}
        </div>
      </div>
    )
  }

  return when({
    condition: () => skillSelectVisible.value,
    then: () => drawChooser() as never,
  })
}

/**
 * The NPC dialogue box.
 *
 * `npcdialogpanelhd` states a zero-sized panel, a frame (`DialogBorder` — the
 * `PANEL/TooltipBorder/TooltipBorder` nine-tile, with its own background colour), a text
 * template, a `@ok` button, and the two fields that place it: a padding and a vertical
 * offset. The box has no rect because the engine measures it, and `rect.y +
 * verticalOffset` units above the bottom of the screen is where its floor sits — 725
 * pixels at a 900-pixel height, which is the top edge of the HUD bar at 728. The box
 * below is that box, sized by the browser from the text it holds rather than by a number
 * this file picked.
 *
 * The speaker's name has no widget in the layout, so it is drawn above the line in the
 * template's own gold; the body is the panel's list style. The button is placed at the
 * box's bottom-right inside the layout's own padding, because the layout's
 * `ButtonTemplate` offset (90 x 375 units) is measured from a box the engine computes.
 * Its art, `PANEL\Modals\Modal_Button`, is **not in the package** — the tree was searched
 * and the name is nowhere in it — so its caption is drawn in the layout's text style and
 * no frame is faked for it.
 */
function DialogueOverlay(props: { game: Game; layers: UiLayerSet | null }) {
  const layers = props.layers
  const game = props.game
  if (layers === null) return null
  const loaded = layers
  const dialogue = game.hud.dialogue

  const drawDialogue = (): unknown => {
    const view = dialogue.value
    if (view === null) return null
    const root = rootOf(loaded, 'npcdialogpanelhd')
    const panel = widgetAt(root, P.dialogPanel)
    const border = widgetAt(root, P.dialogBorder)
    const text = widgetAt(root, P.dialogText)
    const button = widgetAt(root, P.dialogButton)
    const viewport = loaded.viewport
    const unit = unitOf(viewport)
    const fields = panel?.widget.fields ?? {}
    const rect = fieldPair(fields, 'rect') ?? { x: 0, y: 0 }
    const verticalOffset = fieldNumber(fields, 'verticalOffset') ?? 0
    const padding = (fields.padding ?? {}) as Record<string, unknown>
    const pad = (key: string, fallback: number): number =>
      Math.round((typeof padding[key] === 'number' ? (padding[key] as number) : fallback) * unit)
    const frame = border === null ? null : loaded.source.sprites.frame(frameName(border), 0)
    const listStyle = (fields.listStyle ?? {}) as Record<string, unknown>
    const done = view.index + 1 >= view.keys.length
    // Every value a call produces is bound above the JSX: this framework's compiler
    // hoists a call in a child position as text rather than calling it.
    const buttonCaption = captionOf(loaded, button) ?? 'ok'
    const progress = `${view.index + 1} / ${view.keys.length}`
    // The layout's `alignment.h` is `center` throughout, which is what makes the box
    // centred on the screen with `rect.x` as the engine's measuring start.
    const boxStyle: Record<string, string> = {
      position: 'absolute',
      left: '50%',
      bottom: `${Math.round((rect.y + verticalOffset) * unit)}px`,
      // Per cent widths are of a parent that covers the screen, but this one is stated
      // in pixels so the box does not depend on the container at all.
      'max-width': `${Math.round(viewport.width * 0.6)}px`,
      transform: 'translateX(-50%)',
      background: rectangleColour(border, 'rgba(0,0,0,0.7)'),
      padding: `${pad('top', 24)}px ${pad('right', 32)}px ${pad('bottom', 24)}px ${pad('left', 32)}px`,
      'pointer-events': 'auto',
      ...(frame === null
        ? {}
        : borderImageOf(frame, unit, fieldNumber(border?.widget.fields ?? {}, 'tileScale') ?? 1)),
    }
    const onAdvance = (): void => {
      if (done) game.closeDialogue()
      else game.advanceDialogue()
    }
    return (
      // The panel's own `ClickCatcherWidget` is what makes the whole box the target in
      // the game, so the box carries the gesture and the pieces inside it — whose text
      // styles set `pointer-events: none` — let the press through to it.
      <div
        data-ui-extra="npcdialogpanelhd"
        data-ui-name="NpcDialogPanel"
        style={boxStyle}
        onPointerDown={onAdvance}
      >
        <div
          data-ui-extra="dialogue-speaker"
          style={{
            ...textStyle(text, 26),
            color: colour(styleOf(text).fontColor, '#c7b377'),
            'margin-bottom': '6px',
          }}
        >
          {view.displayName}
        </div>
        <div data-ui-extra="dialogue-body" style={{ ...textStyle(text, 26), color: colour(listStyle.fontColor, '#ffffff') }}>
          {view.text}
        </div>
        <div
          data-ui-name="ButtonTemplate"
          style={{
            ...textStyle(button, 26),
            position: 'absolute',
            right: `${pad('right', 32)}px`,
            bottom: `${pad('bottom', 24)}px`,
          }}
        >
          {buttonCaption}
        </div>
        <div
          data-ui-extra="dialogue-progress"
          style={{ ...textStyle(null, 22), color: '#808080', 'margin-top': '4px' }}
        >
          {progress}
        </div>
      </div>
    )
  }

  return when({
    condition: () => dialogue.value !== null,
    then: () => drawDialogue() as never,
  })
}

/**
 * The pause menu.
 *
 * The layout is whole: the dimmer (`TransparentBG`, `fitToScreen`), the animated Diablo
 * II logo block, the `@Paused` title, the three buttons (`PauseButton` art with
 * `@OptionsHD`, `@SaveAndExit` and `@ReturnToGame` captions) and the age and violence
 * descriptors. Everything drawn is the layout's, and the words are `strings_ui.json`'s.
 *
 * Two things the layout leaves to the engine are done here: the root is sized to the
 * screen (see {@link fullScreenRoot} — its children anchor to fractions of it), and the
 * dimmer is painted, because a `RectangleWidget`'s `color` is not something the renderer
 * reads. Options and Save and Exit lead to screens this build does not have, so they do
 * nothing rather than something invented; Return to Game is the layout's own
 * `PausePanelMessage:Close`, and resumes.
 */
function PauseOverlay(props: { game: Game; layers: UiLayerSet | null; paused: SignalRef<boolean> }) {
  const layers = props.layers
  const paused = props.paused
  const game = props.game
  if (layers === null) return null
  const loaded = layers
  const pauseText = (widget: ResolvedWidget): string | undefined => captionOf(loaded, widget)

  /**
   * The press a menu button takes, resolved against the layout's own boxes.
   *
   * The engine hit-tests its widget tree; the renderer this app draws layouts with gives
   * a widget pointer events only when it hands it an activation handler *and* it has a
   * frame, which is a decision the renderer makes and not one a layout states. So the
   * three buttons' boxes are read from the layout — the only boxes on this panel the
   * engine measures — and a press inside one runs what the layout says it runs
   * (`PausePanelMessage:Close` on Return to Game; the other two lead to screens this
   * build does not have, so they do nothing rather than something invented).
   */
  /**
   * The three menu buttons, at the boxes the layout's table gives them.
   *
   * `PauseTable` is a `TableWidget` with `rowHeight: 140` and one column 658 units
   * wide, and its rows hold one `ButtonWidget` each. A table's rows are laid out by the
   * engine and not by a rect, so the resolver leaves every row and every button at the
   * table's origin, on top of each other. The rows are therefore stacked here with the
   * layout's own `rowHeight`, each button centred in its row and its row's column, which
   * is what the column's alignment says — and that same box is what a press is resolved
   * against.
   */
  const menuButtons = (root: ResolvedWidget): Array<{ box: Box; caption: string; name: string; widget: ResolvedWidget }> => {
    const table = widgetAt(root, P.pauseTable)
    if (table === null) return []
    // The table's own origin, not a box: a table states a row height and a column width
    // and no size of its own, so the resolver leaves it at zero and a size test would
    // throw the rows away.
    const tableBox: Box = { left: table.box.x, top: table.box.y, width: 0, height: 0 }
    const unit = unitOf(loaded.viewport)
    const rowHeight = (fieldNumber(table.widget.fields, 'rowHeight') ?? 0) * unit
    const columns = table.widget.fields.columns
    const column = Array.isArray(columns) ? (columns[0] as { width?: unknown }) : undefined
    const columnWidth = (typeof column?.width === 'number' ? column.width : 0) * unit
    const out: Array<{ box: Box; caption: string; name: string; widget: ResolvedWidget }> = []
    table.children.forEach((row: ResolvedWidget, index: number) => {
      const button = row.children.find((child: ResolvedWidget) => child.widget.type === 'ButtonWidget')
      if (button === undefined) return
      const art = boxOf(button)
      const width = columnWidth > 0 ? columnWidth : (art?.width ?? 0)
      const height = art?.height ?? rowHeight
      out.push({
        box: {
          left: tableBox.left + (columnWidth > width ? (columnWidth - width) / 2 : 0),
          top: tableBox.top + index * rowHeight + Math.max(0, (rowHeight - height) / 2),
          width,
          height,
        },
        caption: captionOf(loaded, button) ?? '',
        name: button.widget.name,
        widget: button,
      })
    })
    return out
  }

  /**
   * The press a menu button takes.
   *
   * The engine hit-tests its widget tree; the renderer this app draws layouts with
   * gives a widget pointer events only when it is handed an activation handler *and* it
   * has a frame, which is the renderer's decision and not the layout's. So a press is
   * resolved against the boxes above — the only buttons on this panel, and the boxes the
   * layout's own table places them at.
   */
  const pressOnMenu = (buttons: Array<{ box: Box; name: string }>, event: PointerEvent): void => {
    for (const entry of buttons) {
      const box = entry.box
      if (
        event.clientX >= box.left &&
        event.clientX <= box.left + box.width &&
        event.clientY >= box.top &&
        event.clientY <= box.top + box.height
      ) {
        event.stopPropagation()
        // Return to Game is the layout's own `PausePanelMessage:Close`; Options and Save
        // and Exit lead to screens this build does not have, so they do nothing rather
        // than something invented.
        if (entry.name === P.pauseResume[3]) {
          paused.value = false
          game.setPaused(false)
        }
        return
      }
    }
  }

  const drawPause = (): unknown => {
    // `pauselayouthd`'s root states `fitToParent`, which is how a layout says "I am the
    // viewport" without repeating its size; the resolver honours it, so the logo, the
    // title and the button table anchor to fractions of the screen as the game's own
    // engine places them. The root was resolved at zero before the resolver read that
    // flag, and every anchored child landed in the top-left corner.
    const root = rootOf(loaded, 'pauselayouthd')
    if (root === null) return null
    const background = widgetAt(root, P.pauseBackground)
    const screen = fullScreenBox(loaded.viewport)
    const frameBox = css(screen, screen)
    // The dimmer is painted here (a `RectangleWidget`'s `color` is not something the
    // renderer reads); the table is drawn here (its rows are laid out by the engine, and
    // the resolver leaves all three buttons on top of each other at its origin); and the
    // title is drawn here because its box is a bare anchor — the engine measures it from
    // the text, while a resolved text widget with no rect is zero-sized and clipped.
    const skipPauseOwn = (widget: ResolvedWidget): boolean =>
      widget.widget.name === P.pauseBackground[1] ||
      widget.widget.type === 'TableWidget' ||
      widget.widget.name === P.pauseTitle[1]
    const title = widgetAt(root, P.pauseTitle)
    const titleText = captionOf(loaded, title) ?? ''
    const titleStyle: Record<string, string> | null =
      title === null
        ? null
        : {
            ...textStyle(title, 56),
            position: 'absolute',
            left: `${Math.round(title.box.x)}px`,
            top: `${Math.round(title.box.y)}px`,
            transform: 'translate(-50%, -50%)',
          }
    const buttons = menuButtons(root)
    const buttonFrames = buttons.map((entry) => {
      const art = fieldString(entry.widget.widget.fields, 'filename')
      const frame = art === undefined ? null : loaded.source.sprites.frame(art, 0)
      return {
        box: entry.box,
        name: entry.name,
        caption: entry.caption,
        style: {
          ...css(entry.box, entry.box),
          ...(frame === null ? {} : { 'background-image': `url(${frame.url})`, 'background-size': '100% 100%' }),
        } as Record<string, string>,
        captionStyle: {
          ...textStyle(entry.widget, 28),
          position: 'absolute',
          left: '0px',
          top: '0px',
          width: '100%',
          height: '100%',
          display: 'flex',
          'flex-direction': 'column',
          'justify-content': 'center',
          'align-items': 'center',
        } as Record<string, string>,
      }
    })
    const onPress = (event: PointerEvent): void => pressOnMenu(buttons, event)
    return (
      <div
        data-ui-extra="pauselayouthd"
        data-ui-name="PauseLayout"
        style={frameBox}
        onPointerDown={onPress}
      >
        <div
          data-ui-name="TransparentBG"
          style={{
            ...css(screen, screen),
            background: rectangleColour(background, 'rgba(0,0,0,0.5)'),
            // The dimmer carries the layout's own click catcher, so a press on it stops
            // at the menu instead of falling through to the game.
            'pointer-events': 'auto',
          }}
        />
        <LayoutScreen
          layers={loaded}
          root={root}
          text={pauseText}
          skip={skipPauseOwn}
        />
        {each(
          buttonFrames,
          (entry: {
            box: Box
            name: string
            caption: string
            style: Record<string, string>
            captionStyle: Record<string, string>
          }) => (
            <div data-ui-extra="pause-button" data-ui-name={entry.name} style={entry.style}>
              <span data-ui-extra="pause-caption" style={entry.captionStyle}>
                {entry.caption}
              </span>
            </div>
          ),
        )}
        {titleStyle === null ? null : (
          <div data-ui-extra="pause-title" data-ui-name="PauseText" style={titleStyle}>
            {titleText}
          </div>
        )}
      </div>
    )
  }

  return when({
    // A pure read of the host's own pause signal: this module never writes it, and never
    // touches `started`, which belongs to `main.tsx`.
    condition: () => paused.value,
    then: () => drawPause() as never,
  })
}

/**
 * The overlays, as one node so `hud.tsx` stays a list of what is on screen.
 *
 * Returns null until there is something to draw; each overlay gates itself with its own
 * `when`, so an idle game mounts nothing.
 */
export function HudExtras(props: HudExtrasProps): unknown {
  const { game, layers } = props
  const base = props.base
  const paused = props.paused
  installExtraInput(game)
  // Three of the overlays want the profile; asking here means one fetch per root.
  profileFor(base)
  // Each overlay is a *component element* rather than a call: this framework's compiler
  // builds an element with only expression children as a static template and renders
  // every expression child as text (`renderText(...)`), which throws for anything that
  // is not text — a mountable included. Written as an element, the child is a mountable
  // the compiler leaves alone, which is how the HUD's own overlays are written.
  return (
    // The element the overlays live in covers the viewport and takes no events: a child
    // that measures itself against its parent — the dialogue box, which is centred and
    // sits `verticalOffset` units off the bottom edge — needs a parent of the screen's
    // size, and the play surface underneath stays reachable because nothing here is
    // interactive unless it says so.
    <div
      data-ui-extra="extras"
      style={{
        position: 'absolute',
        left: '0px',
        top: '0px',
        right: '0px',
        bottom: '0px',
        'pointer-events': 'none',
      }}
    >
      <AutoMapOverlay game={game} layers={layers} open={automapVisible} />
      <MonsterHealthOverlay game={game} layers={layers} />
      <LevelNameOverlay game={game} layers={layers} />
      <MessageOverlay game={game} layers={layers} base={base} />
      <MessageLogOverlay game={game} layers={layers} base={base} />
      <TooltipOverlay game={game} layers={layers} base={base} />
      <ShowItemsOverlay game={game} layers={layers} base={base} />
      <SkillSelectOverlay game={game} layers={layers} base={base} />
      <DialogueOverlay game={game} layers={layers} />
      <PauseOverlay game={game} layers={layers} paused={paused} />
    </div>
  )
}
