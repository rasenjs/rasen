/**
 * HUD — the interface, in DOM.
 *
 * One rule governs how values reach the DOM, and it is not obvious:
 * **a dynamic text node must be a ref, never a plain function.** The DOM binder
 * binds a ref child with `bindText` (a subscription) but *calls* a function child
 * exactly once, so `{() => `${hud.fps.value}`}` renders the mount-time value and
 * then never updates again. Formatted strings are therefore `computed(…)` refs.
 * **(Attributes are a different story.** For an attribute the compiler wraps the
 * expression in exactly one getter and the binder subscribes to it, so a *call* that
 * reads signals is reactive: `style={styleFor(x)}` re-runs whenever what it read
 * changes. An **arrow** is not: the compiler wraps it too, so the binder receives a
 * function, `applyStyle` sees a non-object and clears the element's style — every
 * `style={() => ({…})}` in this file was inert until this was found, and the elements
 * they belonged to (the minimap's blips, the boss bar's fill) sat at zero.) So: pass
 * an object literal or a call, never an arrow, for `style`, `class` and `src`.
 *
 * The world is a canvas; the interface is HTML. That split is the point: an
 * ARPG's chrome is text-heavy, layered and rounded, which the DOM does for free
 * and a sprite renderer does not. Both live in one Rasen tree driven by the same
 * signals — the orbs read `hud.health`, the same value the canvas uses for the
 * hero's hit flash.
 *
 * Only values that change are passed inline; everything else is in the
 * stylesheet in `index.html`, so there is one place to tune the look.
 */

import { each } from '@rasenjs/core'
import { when } from '@rasenjs/dom'
import { fieldNumber, fieldPair, widgetText, type UiWidget } from './d2/ui/widget'
import { flatten, uiBoxOf, uiOffsetOf, unitOf, type ResolvedWidget, type Viewport } from './d2/ui/layout'
import { computed, ref, type SignalRef } from '@rasenjs/reactive-signals'
import { Game, type BossView, type Item, type LogEntry, type MinimapBlip, type Rarity, type SkillId, type SkillView, type TravelRow } from './game'
import { hudIcon } from './hud-icons'
import { HudExtras } from './hud-panels'
import { startUiClock, uiElapsed } from './ui-clock'
import { itemArtUrl } from './d2/itemart'
import type { StashAddress, StockEntry, VendorStock } from './d2/economy'
import type { DialogueView } from './game'
import { Frontend, type FrontendCharacter, type FrontendScreens } from './frontend'
import { nineTileBorder, spriteCellStyle, type UiFrame } from './d2/ui/render'
import { UiLayers, createAnimationClock, resolveScreen, type UiLayerSet } from './d2/ui/screen'
import type { SkillButtonControl } from './input/aim-button'

/** Rarity → the colour the genre reads instantly. */
const RARITY_COLOUR: Record<Rarity, string> = {
  common: '#e8e2d0',
  magic: '#6ea8ff',
  rare: '#ffe066',
  unique: '#c08bff',
}

const EMPTY_SKILL = (id: SkillId): SkillView => ({
  id,
  name: id,
  cooldown: 0,
  maxCooldown: 1,
  mana: 0,
  ready: true,
  affordable: true,
})

/** A minimap blip's position as a percentage of the map, rebuilt when it moves. */
function blipStyle(blip: MinimapBlip, hud: { mapWidth: number; mapHeight: number }): Record<string, string> {
  return {
    left: `${(blip.x.value / hud.mapWidth) * 100}%`,
    top: `${(blip.y.value / hud.mapHeight) * 100}%`,
  }
}

/** The boss bar's fill, as a width in percent of the bar. */
function barFill(hud: { boss: SignalRef<BossView | null> }): Record<string, string> {
  return { width: `${(hud.boss.value?.hp ?? 0) * 100}%` }
}

/** A waypoint tab's class, with the open act marked. */
function tabClass(entry: WaypointAct, act: SignalRef<number>): string {
  return `waypoint-tab${entry.act === act.value ? ' active' : ''}`
}

/**
 * How the ways-out list is drawn.
 *
 * The export carries no layout for this control, so it is drawn by hand: the panel's
 * own frame is the minimap's (the same wood-and-gold plate the HUD uses), and the
 * rows follow `.waypoint-row`'s treatment — which is the game's own list style, even
 * though the row is this app's. `waypointspanelexpansionhd` is deliberately *not*
 * reused: its widgets name no travel control, so drawing this list over it would
 * claim the game's pane does something it does not.
 */
const TRAVEL_PANEL_STYLE: Record<string, string> = {
  position: 'absolute',
  left: '12px',
  bottom: '218px',
  width: '280px',
  // Eleven rows is the act 1 town's own list (three doors and eight waypoints), which
  // fits a 800-pixel-high viewport with room to spare; a shorter one scrolls rather
  // than losing a row, because a list that hides the way out is worse than a list that
  // scrolls.
  maxHeight: '40vh',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  padding: '0 0 4px',
  borderRadius: '4px',
  background: 'linear-gradient(180deg, #2a241c, #12100c)',
  border: '2px solid var(--trim-dark)',
  boxShadow: '0 0 0 1px #6b5828, 0 10px 24px rgba(0, 0, 0, 0.75)',
  pointerEvents: 'auto',
}

const TRAVEL_TITLE_STYLE: Record<string, string> = {
  padding: '3px 6px',
  fontFamily: 'var(--font-title)',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--trim-light)',
  borderBottom: '1px solid rgba(0, 0, 0, 0.6)',
  textShadow: '0 1px 2px #000',
}

/** The note after the name: how the road gets there, dimmer than the name. */
const TRAVEL_NOTE_STYLE: Record<string, string> = {
  fontSize: '10px',
  color: 'rgb(150, 142, 126)',
}

/**
 * One row of the list: what it leads to, and how.
 *
 * One line per row rather than two, because the act 1 town's list is eleven rows and a
 * row that wraps doubles the panel's height: a way out below the fold is a way out the
 * player does not know about. What does not fit is ellipsised, and the whole sentence is
 * what the refusal log gives when the row is used.
 */
function travelRowStyle(row: TravelRow): Record<string, string> {
  return {
    padding: '2px 6px',
    fontSize: '12px',
    lineHeight: '15px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: row.loadable ? 'rgb(230, 224, 208)' : 'rgb(152, 144, 128)',
    cursor: row.loadable ? 'pointer' : 'not-allowed',
    textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
  }
}

/**
 * The ways out of the area the player is in.
 *
 * This is the travel affordance. A door in this game is a *tile* — the player leaves
 * through it by walking into it, and `Game` checks for that every step — but walking
 * into a doorway only works for the doors a `.ds1` places, and some roads the tables
 * name have no tile at all: their doors are objects the tables name and do not shape,
 * and the road between acts is the waypoint list, which is not an object anywhere in
 * the export. So the roads the tables name are listed here, as the town's own waypoint
 * list is listed in the front end's waypoint pane, and a row is a button: clicking it
 * travels.
 *
 * A row's note says how the road gets there and, when it cannot be taken, why:
 * `door 30,13` for a door that loads, `door 30,13 · no preset` or
 * `waypoint · DrlgType 1, generated` for one that does not. Which it is comes from
 * `d2/travel.ts`: a preset area needs its `LvlPrest` row, and a generated area —
 * `DrlgType 1` or `3`, the majority — needs `d2/drlg.ts` to be able to plan it, which
 * it can for 76 of the 101 such areas in the shipped tables. So the Blood Moor, the
 * Cold Plains, the Jail and the Catacombs are enterable rows now, and the rows that
 * still carry a reason are the ones whose tables or files are genuinely short.
 *
 * The ones that *can* be entered come first, because the list's job is to get the
 * player out. Where the list's data comes from is `Game.travelOptions`, which is
 * `d2/travel.ts`'s reading of `levels.txt`'s `Vis`/`Warp` columns, its `Waypoint`
 * column and `actinfo.txt`'s act-entry rule.
 */
function TravelList(props: { game: Game; onTravel: (areaId: number) => void }) {
  const hud = props.game.hud
  const rows = hud.travel
  const onTravel = props.onTravel
  return when({
    condition: () => rows.value.length > 0,
    then: () => (
      <div class="travel" data-hud="" style={TRAVEL_PANEL_STYLE}>
        <div class="travel-title" data-hud="" style={TRAVEL_TITLE_STYLE}>
          Ways out
        </div>
        {each(rows, (row: TravelRow) => (
          <div
            class="travel-row"
            data-hud=""
            style={travelRowStyle(row)}
            onPointerDown={() => onTravel(row.areaId)}
          >
            {row.label}
            {' · '}
            <span class="travel-note" data-hud="" style={TRAVEL_NOTE_STYLE}>
              {row.note}
            </span>
          </div>
        ))}
      </div>
    ),
  })
}

function Minimap(props: { game: Game }) {
  const hud = props.game.hud
  const title = computed(() => hud.areaName.value)
  const levelText = computed(() => `lvl ${hud.level.value}`)
  const hostileText = computed(() => `${hud.monsterCount.value} hostiles`)
  const slainText = computed(() => `${hud.kills.value} slain`)
  return (
    <div class="minimap" data-hud="">
      <div class="minimap-title" data-hud="">
        {title}
      </div>
      <div class="minimap-body" data-hud="">
        <img
          class="minimap-terrain"
          src={props.game.minimapImage}
          alt=""
          draggable={false}
          data-hud=""
        />
        {each(hud.minimap, (blip: MinimapBlip) => (
          <div
            class={`minimap-blip ${blip.kind}`}
            data-hud=""
            style={blipStyle(blip, hud)}
          />
        ))}
      </div>
      <div class="minimap-foot" data-hud="">
        <span data-hud="">{levelText}</span>
        <span data-hud="">{hostileText}</span>
        <span data-hud="">{slainText}</span>
      </div>
    </div>
  )
}

function BossBar(props: { game: Game }) {
  const hud = props.game.hud
  const name = computed(() => hud.boss.value?.name ?? '')
  return when({
    condition: () => hud.boss.value !== null,
    then: () => (
      <div class="boss" data-hud="">
        <div class="boss-name" data-hud="">
          {name}
        </div>
        <div class="boss-track" data-hud="">
          <div
            class="boss-fill"
            data-hud=""
            style={barFill(hud)}
          />
        </div>
      </div>
    ),
  })
}

function LogPanel(props: { game: Game }) {
  return (
    <div class="log" data-hud="">
      {each(props.game.hud.log, (entry: LogEntry) => (
        <div data-hud="" style={{ color: RARITY_COLOUR[entry.rarity] }}>
          {entry.text}
        </div>
      ))}
    </div>
  )
}

function StatsPanel(props: { game: Game }) {
  const hud = props.game.hud
  const fpsText = computed(() => String(hud.fps.value))
  const hostileText = computed(() => String(hud.monsterCount.value))
  const goldText = computed(() => String(hud.gold.value))
  const objectiveText = computed(() => hud.objective.value)
  return (
    <div class="stats" data-hud="">
      <span data-hud="">
        <b data-hud="">{fpsText}</b> fps · <b data-hud="">{hostileText}</b> hostiles
      </span>
      <span data-hud="">
        gold <b data-hud="">{goldText}</b>
      </span>
      <span data-hud="">{objectiveText}</span>
    </div>
  )
}

/**
 * The game's own HUD, drawn under the numbers this app writes on it.
 *
 * The layout places the bar, the buttons and the gauges; the liquid in the globes,
 * the digits and the belt's contents are runtime state the game renders itself, so
 * they stay as this app's own drawing on top. That split is the honest one: the
 * frame is the game's, the values are the simulation's.
 *
 * The buttons carry no `onClickMessage` — the game wires its HUD buttons by widget
 * name in code, not from the layout — so the mapping below is this app making the
 * same decision the game makes, one name at a time.
 */
function HudFrame(props: {
  game: Game
  base: string
  fireball: SkillButtonControl
  onNova: () => void
  layers: UiLayerSet | null
  onInventory: () => void
  onCharacter: () => void
  onSkills: () => void
  onQuest: () => void
  onPause: () => void
  onPotion: () => void
}) {
  const layers = props.layers
  const onInventory = props.onInventory
  const onCharacter = props.onCharacter
  const onSkills = props.onSkills
  const onQuest = props.onQuest
  const onPause = props.onPause
  if (layers === null) return null
  const loaded = layers
  // The clock the layout's own animated widgets read: `hudpanelhd` animates the
  // mini-menu buttons, the experience bar's level flashes and the globes' idle
  // ripple, each at the `fps` it states.
  const clock = createAnimationClock(uiElapsed, loaded.source.sprites)
  startUiClock()
  const panels: Record<string, () => void> = {
    MiniMenuInventory: onInventory,
    MiniMenuCharacter: onCharacter,
    MiniMenuSkillTree: onSkills,
    MiniMenuQuestLog: onQuest,
    MiniMenuPauseMenu: onPause,
  }
  const openPanel = (widget: ResolvedWidget, event: Event): void => {
    event.stopPropagation()
    const open = panels[widget.widget.name]
    if (open !== undefined) {
      open()
      return
    }
    // AutoMap and Party are the layout's own buttons with no screen in this build;
    // pressing them does nothing rather than something invented.
  }
  const text = (widget: ResolvedWidget): string | undefined =>
    loaded.source.strings.resolve(widgetText(widget.widget))
  return (
    <div class="hud-frame" data-hud="">
      <UiLayers
        layers={loaded}
        names={['hudpanelhd']}
        onActivate={openPanel}
        text={text}
        frameIndex={(widget) => clock.frameIndex(widget)}
      />
      {BarContent({
        game: props.game,
        layers: loaded,
        base: props.base,
        clock,
        fireball: props.fireball,
        onNova: props.onNova,
        onPotion: props.onPotion,
      }) as never}
    </div>
  )
}

/**
 * One of the game's own panels, shown while its signal is open.
 *
 * The panel's frame, tabs, buttons and background are the layout's; the content
 * inside them — the items, the numbers, the quest lines — is this app's, drawn on
 * top, because a layout can say what a row looks like but not how many there are or
 * what they say. That split is the same one the HUD uses.
 */
function PanelLayer(props: {
  layers: UiLayerSet | null
  name: string
  open: SignalRef<boolean>
  onActivate?: (widget: ResolvedWidget, event: Event) => void
}) {
  const layers = props.layers
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const text = (widget: ResolvedWidget): string | undefined =>
    loaded.source.strings.resolve(widgetText(widget.widget))
  return when({
    condition: () => open.value,
    then: () => (
      <div class="panel-frame" data-panel={props.name}>
        <UiLayers
          layers={loaded}
          names={[props.name]}
          onActivate={props.onActivate}
          text={text}
        />
      </div>
    ),
  })
}

/**
 * The content inside the game's own panels.
 *
 * Each of these fills the panel layout its frame comes from, and each is placed at
 * the box of the widget the layout itself uses for that content — measured from the
 * layout's own `rect`/`cellCount`/`cellSize`, not guessed at. `PanelLayer` draws the
 * layout and this draws the live data over it; the panels are separate because their
 * data is: items out of the generator, the character sheet out of `charstats`, the
 * class tree out of `skills`, the quest log out of `levels`, the stash, the
 * waypoints, a vendor and a mercenary.
 *
 * Every box below comes from `resolveScreen` — the same call `UiLayers` makes — so a
 * box read here is the box the frame is drawn at.
 */

/** A pixel box in the viewport, which is what a `style` prop wants. */
interface ContentBox {
  left: number
  top: number
  width: number
  height: number
}

/** A panel's resolved widget tree, or null when its layout is not in the set. */
function panelOf(layers: UiLayerSet, name: string): ResolvedWidget | null {
  const root = layers.roots.get(name)
  if (root === undefined) return null
  return resolveScreen(root, layers.viewport, layers.source.sprites)
}

/**
 * The widget reached by following a chain of names down from a panel's root.
 *
 * A path rather than a single name because the layouts reuse names across
 * branches: the stash file has a `grid` inside `basicstash_container` *and* the
 * classic one its base layout keeps at the root.
 */
function widgetAt(panel: ResolvedWidget | null, path: readonly string[]): ResolvedWidget | null {
  let node = panel
  for (const name of path) {
    if (node === null) return null
    let found: ResolvedWidget | null = null
    for (const entry of flatten(node)) {
      if (entry.widget.name === name) {
        found = entry
        break
      }
    }
    node = found
  }
  return node
}

/**
 * A grid widget's box: its origin from `rect`, its extent from its own grid.
 *
 * `InventoryGridWidget` states `rect: {x, y}` and then `cellCount` and `cellSize`
 * instead of a width and a height, because the game multiplies them. Both are read
 * here, so the box is the layout's own arithmetic rather than an estimate. Returns
 * null when the layout states no grid, so the caller can fall back visibly.
 */
function gridBoxOf(widget: ResolvedWidget | null, viewport: Viewport): ContentBox | null {
  if (widget === null) return null
  const cells = fieldPair(widget.widget.fields, 'cellCount')
  const cell = fieldPair(widget.widget.fields, 'cellSize')
  if (cells === undefined || cell === undefined) return null
  const unit = unitOf(viewport)
  return {
    left: widget.box.x,
    top: widget.box.y,
    width: cells.x * cell.x * unit,
    height: cells.y * cell.y * unit,
  }
}

/**
 * A widget's own resolved box, for the widgets that state their whole rectangle.
 *
 * `rect.width`/`height` when the layout has them, and the sprite's own size when it
 * does not — which is what `resolveScreen` measures the tree with, so a widget that
 * carries only a `filename` still has a real box here.
 */
function rectBoxOf(widget: ResolvedWidget | null): ContentBox | null {
  if (widget === null) return null
  const box = widget.box
  if (box.width <= 0 || box.height <= 0) return null
  return { left: box.x, top: box.y, width: box.width, height: box.height }
}

/** The one box that covers all of these, for a content region with no container. */
function unionBox(boxes: readonly ResolvedWidget[]): ContentBox | null {
  const present = boxes.filter((widget) => widget.box.width > 0 && widget.box.height > 0)
  if (present.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const widget of present) {
    left = Math.min(left, widget.box.x)
    top = Math.min(top, widget.box.y)
    right = Math.max(right, widget.box.x + widget.box.width)
    bottom = Math.max(bottom, widget.box.y + widget.box.height)
  }
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Where a panel's content goes when its layout names no content widget.
 *
 * The panel's own box, inset a tenth across and a fifth down, which clears the frame
 * the layout draws around it. This is the fallback and nothing more: an overlay only
 * uses it after saying, in its own comment, which widgets it looked at and why none
 * of them is a content region.
 */
function panelInset(layers: UiLayerSet, name: string): ContentBox {
  const measured = rectBoxOf(panelOf(layers, name))
  if (measured === null) {
    const width = layers.viewport.width
    const height = layers.viewport.height
    return { left: width * 0.12, top: height * 0.12, width: width * 0.76, height: height * 0.76 }
  }
  const padX = measured.width * 0.1
  const padY = measured.height * 0.12
  return {
    left: measured.left + padX,
    top: measured.top + padY,
    width: measured.width - padX * 2,
    height: measured.height - padY * 2,
  }
}

/** A pixel box as a CSS object, for a `style` prop. */
function cssBox(box: ContentBox | null, fallback: ContentBox): Record<string, string> {
  const source = box ?? fallback
  return {
    left: `${source.left}px`,
    top: `${source.top}px`,
    width: `${source.width}px`,
    height: `${source.height}px`,
  }
}

/**
 * Where the interface block sits, and how big it is.
 *
 * The block is 16:9 up to 19:9 wide — the engine derives the interface's scale from its
 * height alone and its placement from width *and* height, then draws the whole pass
 * offset inside the frame (`dm/host/dm_uiscreen.c:1-6`, quoted in `layout.ts`). So the
 * interface is neither the viewport nor a stretched copy of it, and this is the single
 * element that expresses that: every child of `.hud-layer` is in block coordinates, and
 * this puts the block where it belongs.
 *
 * Falls back to the whole viewport when the layouts were not exported, which is the
 * only case where the app has no block to speak of.
 */
function hudLayerStyle(layers: UiLayerSet | null): Record<string, string> {
  if (layers === null) {
    return { position: 'absolute', inset: '0', 'pointer-events': 'none' }
  }
  const ui = uiBoxOf(layers.viewport)
  const at = uiOffsetOf(layers.viewport)
  return {
    position: 'absolute',
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${ui.width}px`,
    height: `${ui.height}px`,
    'pointer-events': 'none',
  }
}

/** A layout colour (`{r, g, b, a}` with alpha 0..255) as CSS, or a fallback. */
function layoutColour(value: unknown, fallback: string): string {
  if (value === null || typeof value !== 'object') return fallback
  const c = value as { r?: unknown; g?: unknown; b?: unknown; a?: unknown }
  const channel = (v: unknown, d: number): number => (typeof v === 'number' ? v : d)
  const alpha = typeof c.a === 'number' ? c.a / 255 : 1
  return `rgba(${channel(c.r, 0)}, ${channel(c.g, 0)}, ${channel(c.b, 0)}, ${alpha})`
}

/** The art both attribute balls name: one texture, 47 frames of idle ripple. */
const GLOBE_ART = 'PANEL/HUD_02/HealthManaAnimation/HealthIdle/4k/globe_health_man_idle'
/** `experience_bar` is the *filled* gold strip, not a trough — sampled along x. */
const XP_ART = 'PANEL/HUD_02/experience_bar'
/** `stamina_bar` is a colour ramp: green → amber → red → the purple of exhaustion. */
const STAMINA_ART = 'PANEL/HUD_02/stamina_bar'

/**
 * The hue offset a ball image states, in turns, or 0 when it states none.
 *
 * `hsvTransform` is the one field in the interface whose meaning the shipped data
 * does not pin down, so this is where the reading is written down rather than hidden.
 *
 * Both balls name the *same* idle art — a red liquid globe, established by decoding
 * it, not by reading its name — and both state the same first component, −0.3333. Read
 * as a hue offset in turns that would make **both** globes one colour, and that colour
 * is blue, which contradicts the red art. `poisonHsvTransform` is the datum that
 * settles what the component is: the health ball states `[0.3, 0, 0, 0]`, and 0.3
 * turns is exactly the sickly green a poisoned health globe turns in the game, so the
 * component is a hue offset in turns. A hue offset cannot be right for both globes,
 * so: the **health** globe is drawn with the art's own colour (the art is red, and a
 * red liquid globe is what a health globe is), and the **mana** globe takes the
 * stated offset, which is what turns the one shared texture blue. Which of the two
 * the numbers were authored for cannot be recovered from the shipped data; this
 * choice is stated here because it is a choice.
 */
function hueOffsetTurns(widget: ResolvedWidget | null, ball: 'health' | 'mana'): number {
  if (widget === null || ball === 'health') return 0
  const transform = widget.widget.fields.hsvTransform
  if (!Array.isArray(transform) || typeof transform[0] !== 'number') return 0
  return transform[0]
}

/**
 * The bar's fills: one widget's art, clipped to a fraction.
 *
 * The clip is what makes a bar a bar. `direction` says which edge it grows from,
 * which is the whole difference between the experience bar (left to right) and the
 * attribute balls (bottom to top).
 */
function fillStyle(
  frame: UiFrame,
  box: ContentBox,
  fraction: () => number,
  direction: 'horizontal' | 'vertical',
  filter: string,
): Record<string, string> {
  const shown = Math.max(0, Math.min(1, fraction()))
  return {
    ...spriteCellStyle(frame, box.width, box.height),
    position: 'absolute',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    'clip-path':
      direction === 'horizontal'
        ? `inset(0 ${(1 - shown) * 100}% 0 0)`
        : `inset(${(1 - shown) * 100}% 0 0 0)`,
    filter,
  }
}

/**
 * The part of a globe that is *not* filled, as a dark veil over the art.
 *
 * The liquid is the art itself, so the empty part is the same art darkened — that is
 * the whole of the effect, and it is why nothing here needs a colour of its own. The
 * veil is masked by the art's own alpha, so it stays inside the glass.
 */
function veilStyle(
  frame: UiFrame,
  box: ContentBox,
  fraction: () => number,
): Record<string, string> {
  const shown = Math.max(0, Math.min(1, fraction()))
  return {
    ...spriteCellStyle(frame, box.width, box.height, true),
    'background-image': 'none',
    'background-color': 'rgba(3, 4, 7, 0.68)',
    position: 'absolute',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    'clip-path': `inset(0 0 ${shown * 100}% 0)`,
  }
}

/** The attributes the bar's two balls show, in the layout's own order. */
const BALLS = [
  { name: 'HealthBall', ball: 'health' as const, attribute: 'health' as const },
  { name: 'ManaBall', ball: 'mana' as const, attribute: 'mana' as const },
]

/**
 * The state inside the HUD bar.
 *
 * `hudpanelhd` draws the bar: `front_panel`, its two attribute balls, the experience
 * and stamina strips, its seven mini-menu buttons, its belt. What a layout cannot say
 * is *how full* anything is, so this draws the run's numbers over the layout's own
 * art, at the boxes the layout states — every box below comes from the same
 * `resolveScreen` call `UiLayers` makes, so a box read here is the box the widget is
 * drawn at.
 *
 * Three findings are behind the code, and each is checkable:
 *
 * - **The globes have no fill art.** `AttributeBallWidget` states `attribute`,
 *   `minLiquidHeight` and the smoothing constants, and no texture at all: the engine
 *   draws a liquid. The texture the layout names is the globe's *idle ripple* — 47
 *   frames, and each covers the full height with an opaque-pixel count that rises to
 *   frame 0, falls to a minimum at 20-23 and returns, i.e. a wave and not a level.
 *   The level is therefore drawn here, from the art.
 * - **The bars are filled art.** `experience_bar` is bright cream/gold across its
 *   whole width and `stamina_bar` runs green → amber → red → purple, so both are
 *   clipped rather than tinted, and the troughs are the widgets' own frames.
 * - **The skill buttons are empty slots.** `SkillSelectButtonWidget` states
 *   `skillIconFilenames`, the per-class *sheets* the game cuts icons out of, and
 *   `side`. Those sheets are not in this export — the exporter walks each layout's
 *   `filename` and `skillIconFilenames` is a different field — so the icons come from
 *   the `skills.txt` icon column the app already exports as `skillicons/`.
 */
function BarContent(props: {
  game: Game
  layers: UiLayerSet
  /** URL prefix the app is served from, for the skill icons. */
  base: string
  clock: { frameIndex(widget: ResolvedWidget): number }
  /**
   * The two skill controls.
   *
   * The left slot is the *aimable* one: dragging from it turns the hero and a release
   * casts, which is the game's own mouse-button semantics mapped onto touch, so the
   * pointer handlers go on the slot's own box rather than on a control drawn next to
   * it. The right slot casts on a tap.
   */
  fireball: SkillButtonControl
  onNova: () => void
  onPotion: () => void
}) {
  const layers = props.layers
  const hud = props.game.hud
  const panel = panelOf(layers, 'hudpanelhd')
  const sprites = layers.source.sprites
  const viewport = layers.viewport
  const unit = unitOf(viewport)
  const nodes: unknown[] = []

  for (const entry of BALLS) {
    const ball = widgetAt(panel, [entry.name])
    const image = widgetAt(panel, [entry.name, 'BallImage'])
    const value = widgetAt(panel, [entry.name, 'ValueDisplay'])
    if (ball === null || image === null) continue

    const frame = sprites.frame(GLOBE_ART, props.clock.frameIndex(image))
    if (frame === null) continue
    const box = rectBoxOf(image)
    if (box === null) continue

    const current = entry.attribute === 'health' ? hud.health : hud.mana
    const maximum = entry.attribute === 'health' ? hud.maxHealth : hud.maxMana
    // `minLiquidHeight` is in layout units, so a globe at zero still shows a sliver,
    // which is what the field is for.
    const floor = Math.max(0, (fieldNumber(ball.widget.fields, 'minLiquidHeight') ?? 0) * unit)
    const fraction = (): number => {
      const ratio = maximum.value <= 0 ? 0 : current.value / maximum.value
      if (box.height <= 0) return Math.max(0, Math.min(1, ratio))
      return Math.max(Math.min(floor / box.height, 1), Math.max(0, Math.min(1, ratio)))
    }
    const turns = hueOffsetTurns(image, entry.ball)
    const filter = turns === 0 ? 'none' : `hue-rotate(${turns * 360}deg)`

    // The arrow is what makes it reactive *and* what makes it apply at all: the style
    // binder calls a function prop once and uses the object it returns
    // (`toGetter` → `applyStyle`), so a prop that *returns a function* — a thunk handed
    // over as an identifier — is enumerated as an object with no keys and the element is
    // left with no style at all. An inline arrow returning the object is the shape
    // every other `style` in this app uses.
    nodes.push(
      <div
        data-hud=""
        data-hud-part={`${entry.name}-liquid`}
        style={fillStyle(frame, box, fraction, 'vertical', filter)}
      />,
    )
    nodes.push(
      <div
        data-hud=""
        data-hud-part={`${entry.name}-veil`}
        style={veilStyle(frame, box, fraction)}
      />,
    )

    if (value !== null) {
      // The layout leaves `ValueDisplay` zero-sized: the game measures the text, and
      // `anchor.x`/`alignment` say where it goes. `anchor.x: 0.5` puts the point at
      // the ball's centre and `rect.y: -30` thirty units above its top, so the number
      // floats over the middle of the globe, bottom-aligned on that point.
      const point = value.box
      const style = value.widget.fields.style as { fontColor?: unknown } | undefined
      const colour = layoutColour(style?.fontColor, 'rgb(240, 240, 240)')
      const size = fieldNumber(value.widget.fields, 'pointSize') ?? 26
      const label = computed(() => `${Math.round(current.value)}`)
      nodes.push(
        <div
          data-hud=""
          data-hud-part={`${entry.name}-value`}
          style={{
            position: 'absolute',
            left: `${point.x}px`,
            top: `${point.y}px`,
            transform: 'translate(-50%, -100%)',
            color: colour,
            'font-size': `${size}px`,
            'font-family': 'var(--font-game)',
            'text-shadow': '2px 2px 0 rgba(0, 0, 0, 0.78)',
            'pointer-events': 'none',
            'white-space': 'nowrap',
          }}
        >
          {label}
        </div>,
      )
    }
  }

  // The experience and stamina strips. `ExpBar` also carries `ExpFlashLeft`/
  // `ExpFlashRight`, which the layout animates and `UiLayers` draws.
  for (const strip of [
    { name: 'ExpBar', art: XP_ART, fraction: () => hud.xpRatio.value },
    {
      name: 'StaminaBar',
      art: STAMINA_ART,
      fraction: () =>
        hud.maxStamina.value > 0 ? Math.max(0, Math.min(1, hud.stamina.value / hud.maxStamina.value)) : 0,
    },
  ]) {
    const widget = widgetAt(panel, [strip.name])
    if (widget === null) continue
    const box = rectBoxOf(widget)
    if (box === null) continue
    const frame = sprites.frame(strip.art, 0)
    if (frame === null) continue
    nodes.push(
      <div
        data-hud=""
        data-hud-part={`${strip.name}-fill`}
        style={fillStyle(frame, box, strip.fraction, 'horizontal', 'none')}
      />,
    )
  }

  // The two skill slots. `SkillSelectButtonWidget` resolves to zero size — the game
  // builds the slot around the icon — so the slot is the `HotkeyText` child's own
  // box, which the layout does state (132 x 124 units).
  for (const slot of [
    { name: 'LeftSkillButton', skill: 'fireball' as SkillId, hotkey: '2', aim: true },
    { name: 'RightSkillButton', skill: 'nova' as SkillId, hotkey: '3', aim: false },
  ]) {
    const button = widgetAt(panel, [slot.name, 'HotkeyText'])
    if (button === null) continue
    const box = rectBoxOf(button)
    if (box === null) continue
    const file = props.game.iconFor(slot.skill)
    if (file === null) continue
    const view = (): SkillView =>
      hud.skills.value.find((entry) => entry.id === slot.skill) ?? EMPTY_SKILL(slot.skill)
    const label = computed(() => slot.hotkey)
    const cost = computed(() => (view().mana > 0 ? String(view().mana) : ''))
    const ready = (): boolean => view().ready
    // Handlers must be identifiers: the JSX compiler wraps a member expression in a
    // getter, and the DOM binder then calls the wrapper — which returns the handler
    // without invoking it, so the event vanishes.
    const control = props.fireball
    const aimDown = slot.aim ? (event: PointerEvent) => control.pointerDown(event) : undefined
    const aimMove = slot.aim ? (event: PointerEvent) => control.pointerMove(event) : undefined
    const aimUp = slot.aim ? (event: PointerEvent) => control.pointerUp(event) : undefined
    const aimCancel = slot.aim
      ? (event: PointerEvent) => control.pointerCancel(event)
      : undefined
    const onNova = props.onNova
    const cast = slot.aim ? undefined : () => onNova()
    nodes.push(
      <div
        data-hud=""
        data-hud-part={`${slot.name}-icon`}
        style={{
          position: 'absolute',
          left: `${box.left}px`,
          top: `${box.top}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          'pointer-events': 'auto',
        }}
        onPointerDown={aimDown}
        onPointerMove={aimMove}
        onPointerUp={aimUp}
        onPointerCancel={aimCancel}
        onClick={cast}
      >
        <img
          src={`${props.base}original/${file}`}
          alt={slot.skill}
          draggable={false}
          data-hud=""
          style={{ width: '100%', height: '100%', opacity: ready() ? '1' : '0.45' }}
        />
        <span
          data-hud=""
          style={{
            position: 'absolute',
            left: '2px',
            bottom: '0',
            color: 'rgb(255, 246, 227)',
            'font-size': '20px',
            'font-family': 'var(--font-game)',
            'text-shadow': '2px 2px 0 rgba(0,0,0,0.8)',
          }}
        >
          {label}
        </span>
        <span
          data-hud=""
          style={{
            position: 'absolute',
            right: '2px',
            bottom: '0',
            color: 'rgb(180, 210, 255)',
            'font-size': '18px',
            'font-family': 'var(--font-game)',
            'text-shadow': '2px 2px 0 rgba(0,0,0,0.8)',
          }}
        >
          {cost}
        </span>
      </div>,
    )
  }

  // The belt. `BeltWidget` states `cellSize` (98 x 98 units), `cellPadding`
  // (27 x 15) and `itemOffsetInCell` (1, 1), so the cells are the layout's own
  // arithmetic. How many *rows* a belt has is `belts.txt`'s `numboxes` for the belt
  // being worn, which this build does not model, so one row of the layout's four
  // columns is drawn and every cell past `maxPotions` is empty.
  const beltWidget = widgetAt(panel, ['Belt'])
  if (beltWidget !== null) {
    const cell = fieldPair(beltWidget.widget.fields, 'cellSize')
    const padding = fieldPair(beltWidget.widget.fields, 'cellPadding')
    if (cell !== undefined && padding !== undefined) {
      const stride = (cell.x + padding.x) * unit
      const size = cell.x * unit
      const icon = hudIcon('potion', Math.round(size))
      const count = hud.potions
      for (let index = 0; index < 4; index += 1) {
        const left = beltWidget.box.x + index * stride
        const top = beltWidget.box.y
        const has = (): boolean => index < count.value
        nodes.push(
          <div
            data-hud=""
            data-hud-part={`Belt-cell-${index}`}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${top}px`,
              width: `${size}px`,
              height: `${size}px`,
            }}
            onPointerDown={props.onPotion}
          >
            {when({
              condition: has,
              then: () => (
                <img
                  src={icon}
                  alt="potion"
                  draggable={false}
                  data-hud=""
                  style={{ width: '100%', height: '100%' }}
                />
              ),
            })}
          </div>,
        )
      }
    }
  }

  return nodes as never
}

/**
 * The merge a `basedOn` layout needs, and the only reason this file knows the word.
 *
 * Three of the export's panel layouts are *derived*: `playerinventoryexpansionlayouthd`
 * opens with `"basedOn": "PlayerInventoryOriginalLayoutHD.json"` and then lists only
 * what it changes. Everything it does not mention — the panel's own `rect` and
 * `anchor`, and every `InventorySlotWidget`'s `rect` — lives in the base file, so
 * drawing the derived file alone lands the panel at the viewport origin and collapses
 * its twelve paper-doll slots to nothing. `parseLayout` builds the tree it is handed
 * and does not merge a base (`basedOn` appears nowhere under `d2/ui`), so the merge
 * has to happen here: level by level, by widget name, the derived widget's fields
 * winning, its children merged into the base's in the base's own order, and whatever
 * it adds appended after them. An unnamed widget never matches, which keeps the
 * layouts' anonymous click catchers apart.
 */
export function mergeBasedOn(base: UiWidget, derived: UiWidget): UiWidget {
  const fields: Record<string, unknown> = { ...base.fields, ...derived.fields }
  const claimed = new Set<number>()
  const children: UiWidget[] = base.children.map((child) => {
    const index =
      child.name === ''
        ? -1
        : derived.children.findIndex((entry, at) => !claimed.has(at) && entry.name === child.name)
    if (index === -1) return child
    claimed.add(index)
    return mergeBasedOn(child, derived.children[index])
  })
  derived.children.forEach((child, index) => {
    if (!claimed.has(index)) children.push(child)
  })
  return { type: derived.type, name: derived.name, fields, children }
}

/** The bag, drawn over the inventory layout's frame. */
function InventoryOverlay(props: {
  game: Game
  layers: UiLayerSet | null
  open: SignalRef<boolean>
  /** Whether the stash is open, which turns the bag into the stash's source. */
  stashOpen: SignalRef<boolean>
  onDeposit: (index: number) => void
}) {
  const bag = props.game.inventory
  const layers = props.layers
  const openSignal = props.open
  if (layers === null) return null
  const loaded = layers
  const hovered = ref(-1)
  // The content widget is the layout's own `grid` — `InventoryGridWidget`,
  // `rect: {x: 93, y: 897}`, `cellCount: {x: 10, y: 4}`, `cellSize: $ItemCellSize`
  // (98), so 980 x 392 units. Measured at [1057.9, 459.8, 408.3, 163.3] on a
  // 1600x900 viewport, inside the panel's box of [1019.2, 86.1, 484.2, 627.9].
  // The bag holds `inventorySize` = 40 items, which is that 10 x 4 exactly.
  const panel = panelOf(loaded, 'playerinventoryexpansionlayouthd')
  const bagBox = gridBoxOf(widgetAt(panel, ['grid']), loaded.viewport)
  // The grid's own shape, so the cells land where the layout's cells are.
  const bagGrid: Record<string, string> = {
    'grid-template-columns': 'repeat(10, 1fr)',
    'grid-template-rows': 'repeat(4, 1fr)',
  }
  // Bound to an identifier before the JSX: a call expression in a props position is
  // compiled into a getter, and the DOM would then receive a function for `style`.
  const placement = cssBox(bagBox, panelInset(loaded, 'playerinventoryexpansionlayouthd'))
  return when({
    condition: () => openSignal.value,
    then: () => (
    <div class="panel-content" data-hud="" style={placement}>
      <div class="panel-grid" data-hud="" style={bagGrid}>
        {each(bag, (item: Item, index: number) => {
          const art =
            itemArtUrl(item.graphic) ??
            `${loaded.source.sprites.frame('PANEL/Inventory/Background', 0) === null ? '' : ''}`
          return (
            <div
              class={`bag-cell ${item.rarity}`}
              data-hud=""
              data-selected={index === hovered.value ? 'true' : 'false'}
              onPointerDown={() => {
                hovered.value = index
                // The bag is the source and the stash the destination, exactly as in
                // the game: with the stash open, a tap on a carried item puts it in
                // the page being shown. Without a stash there is nothing to deposit
                // into and the tap only selects.
                if (props.stashOpen.value) {
                  props.onDeposit(index)
                }
              }}
            >
              {art === '' ? (
                <span class="bag-fallback" data-hud="">
                  {item.name.slice(0, 2)}
                </span>
              ) : (
                <img src={art} alt={item.name} draggable={false} data-hud="" />
              )}
            </div>
          )
        })}
      </div>
    </div>
    ),
  })
}

/** The character sheet, drawn over the stats panel's frame. */
function CharacterOverlay(props: { game: Game; layers: UiLayerSet | null; open: SignalRef<boolean> }) {
  const layers = props.layers
  const openSignal = props.open
  if (layers === null) return null
  const loaded = layers
  const rows = (): Array<[string, string]> => {
    const sheet = props.game.characterSheet()
    if (!sheet) return []
    return [
      ['Class', sheet.charClass],
      ['Level', String(sheet.level)],
      ['Strength', String(sheet.strength)],
      ['Dexterity', String(sheet.dexterity)],
      ['Vitality', String(sheet.vitality)],
      ['Energy', String(sheet.energy)],
      ['Life', `${sheet.life} / ${sheet.maxLife}`],
      ['Mana', `${sheet.mana} / ${sheet.maxMana}`],
      ['Stamina', String(sheet.stamina)],
    ]
  }
  // No content container to place this in, and that is a finding rather than an
  // omission: the character sheet puts every value in its own box instead of in one
  // region — `StrengthStat` at `rect: {x: 347, y: 398}`, `ArmorClass` at
  // `{x: 842, y: 730}` and `MaxHP` at `{x: 967, y: 940}` — so there is no single
  // rectangle a stat block belongs in. `LeftSkillStats`/`RightSkillStats` are the
  // two skill readouts, not the sheet. The nearest thing the file names is the
  // panel's own `Background` (`PANEL\Character_Sheet\Character_Background`,
  // `rect: {x: 0, y: 0}`), which measures the panel itself at
  // [98.3, 86.1, 484.2, 627.9] on a 1600x900 viewport. The rows keep the inset of
  // that box.
  const placement = cssBox(null, panelInset(loaded, 'characterstatspanelhd'))
  return when({
    condition: () => openSignal.value,
    then: () => (
    <div class="panel-content" data-hud="" style={placement}>
      <div class="sheet-rows" data-hud="">
        {each(rows() as never[], (row: [string, string]) => (
          <div class="sheet-row" data-hud="">
            <span data-hud="">{row[0]}</span>
            <b data-hud="">{row[1]}</b>
          </div>
        ))}
      </div>
    </div>
    ),
  })
}

/** The class skill tree, drawn over the skill tree layout's frame. */
function SkillOverlay(props: { game: Game; layers: UiLayerSet | null; base: string; open: SignalRef<boolean> }) {
  const layers = props.layers
  const base = props.base
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const skills = () => props.game.classSkills()
  // The content widget is `TreeBackground` — `Spells\Skill_Trees\PANEL_SkillTreeBG`,
  // `rect: {x: 68, y: 145}`, no width or height because the sprite is its own size —
  // which is the tree the class's thirty icons are laid out on. Measured at
  // [1047.5, 146.5, 425.8, 540.8] on a 1600x900 viewport, inside the panel's box of
  // [1019.2, 86.1, 484.2, 627.9]; the three tabs and the title sit above it.
  const panel = panelOf(loaded, 'skillstreepanelhd')
  const placement = cssBox(
    rectBoxOf(widgetAt(panel, ['TreeBackground'])),
    panelInset(loaded, 'skillstreepanelhd'),
  )
  return when({
    condition: () => open.value,
    then: () => (
    <div class="panel-content" data-hud="" style={placement}>
      <div class="skill-grid" data-hud="">
        {each(skills() as never[], (skill: { name: string; icon: string; mana: number; requiredLevel: number }) => {
          // The class icons are their own files under `original/skillicons/`, which
          // is what `classSkills` names; they are not cells of an atlas.
          const src = `${base}original/${skill.icon}`
          return (
            <div class="skill-cell" data-hud="" title={`${skill.name} — ${skill.mana} mana`}>
              <img src={src} alt={skill.name} draggable={false} data-hud="" />
              <span data-hud="">{skill.name}</span>
            </div>
          )
        })}
      </div>
    </div>
    ),
  })
}

/** The quest log, drawn over the log layout's frame. */
function QuestOverlay(props: { game: Game; layers: UiLayerSet | null; act: SignalRef<number>; open: SignalRef<boolean> }) {
  const layers = props.layers
  const act = props.act
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const quests = () => props.game.questLog(act.value)
  // The quest log names no list of quest names: its twenty-one buttons (`Quest0` ..
  // `Quest20`, one per act tab) are created at runtime and every one of them states
  // no `rect` at all, resolving to the panel's own origin. The box the file does
  // state for quest text is `LongDescription` — `rect: {x: 220, y: 1012, width: 720,
  // height: 250}` — measured at [190.0, 507.7, 300.0, 104.2] on a 1600x900 viewport,
  // which is where the act's lines go.
  const panel = panelOf(loaded, 'questlogpaneloriginalhd')
  const placement = cssBox(
    rectBoxOf(widgetAt(panel, ['LongDescription'])),
    panelInset(loaded, 'questlogpaneloriginalhd'),
  )
  return when({
    condition: () => open.value,
    then: () => (
    <div class="panel-content" data-hud="" style={placement}>
      <div class="quest-rows" data-hud="">
        {each(quests() as never[], (quest: { name: string; done: boolean }) => (
          <div class={`quest-row${quest.done ? ' done' : ''}`} data-hud="">
            <span data-hud="">{quest.name}</span>
          </div>
        ))}
      </div>
    </div>
    ),
  })
}

/**
 * One waypoint of an act: its index in the act, and the area's own name.
 *
 * The index is `levels.txt`'s `Waypoint` value, which is the order the game's own
 * waypoint buttons appear in.
 */
export interface WaypointArea {
  readonly index: number
  readonly name: string
}

/** The waypoints of one act, in that order. */
export interface WaypointAct {
  readonly act: number
  readonly areas: readonly WaypointArea[]
}

/**
 * The stash, drawn over the bank layout's frame.
 *
 * The export holds no `stash` or `advancedstashpanelhd`. What it holds is
 * `bankoriginallayouthd` (the classic 6 x 4 bank) and `bankexpansionlayouthd`, which
 * opens with `"basedOn": "BankOriginalLayoutHD.json"` and is the Resurrected stash:
 * personal and shared tabs, the Horadric Cube, and the three advanced-stash pages.
 * The expansion is the one loaded, because it is the stash Resurrected shows.
 *
 * Its content widget is `basicstash_container > grid` — the personal page's
 * `InventoryGridWidget`, `rect: {x: 89, y: 219}`, `cellCount: {x: 10, y: 10}`,
 * `cellSize: $ItemCellSize` — measured at [135.4, 177.4, 408.3, 408.3] on a 1600x900
 * viewport. Nothing is stored in it: this app models no stash and no shared account,
 * so the cells are drawn empty and the note says so rather than inventing items.
 */
function StashOverlay(props: {
  game: Game
  layers: UiLayerSet | null
  open: SignalRef<boolean>
  /** The page being shown, shared with the bag so a deposit lands on it. */
  page: SignalRef<string>
  /** The last operation's own sentence, shown under the grid. */
  note: SignalRef<string>
}) {
  const layers = props.layers
  const game = props.game
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const panel = panelOf(loaded, 'bankexpansionlayouthd')
  const stashBox = gridBoxOf(widgetAt(panel, ['basicstash_container', 'grid']), loaded.viewport)
  const placement = cssBox(stashBox, panelInset(loaded, 'bankexpansionlayouthd'))
  const stash = game.stash()
  const pages = stash === null ? [] : stash.pages()
  const active = props.page
  const note = props.note

  // The tab captions are the layout's own `BankTabs.textStrings`
  // (`@personal`, `@shared`, `@gems`, `@materials`, `@runes`), resolved through the
  // interface's string tables, so the row is the game's wording and not this app's.
  const caption = (page: { label: string }): string =>
    loaded.source.strings.resolve(page.label) ?? page.label

  // The address, not a string. The model's two address kinds are a grid cell and a
  // named slot, and handing it the string "0,0" asked for a *slot* called "0,0",
  // which does not exist — so a filled cell answered "nothing at slot 0,0 of
  // personal" while drawing the item that was plainly there.
  const withdraw = (address: StashAddress): void => {
    note.value = game.withdrawFromStash(active.value, address).message
  }

  const cellFor = (page: { columns: number | null; rows: number | null; cells: number }): {
    columns: number
    rows: number
  } => ({ columns: page.columns ?? 1, rows: page.rows ?? page.cells })

  return when({
    condition: () => open.value,
    then: () => {
      const page = pages.find((entry) => entry.id === active.value) ?? pages[0]
      if (stash === null || page === undefined) {
        return (
          <div class="panel-content" data-hud="" style={placement}>
            <p class="panel-note" data-hud="">
              no stash is modelled — the bank layout was not loaded
            </p>
          </div>
        )
      }
      const grid = cellFor(page)
      const template: Record<string, string> = {
        'grid-template-columns': `repeat(${grid.columns}, 1fr)`,
        'grid-template-rows': `repeat(${grid.rows}, 1fr)`,
      }
      // `each` is handed the **getter**, not its result. Passing `cells()` evaluated
      // the list once at mount and subscribed to nothing, so a deposit changed the
      // model, wrote its confirmation under the grid, and left the grid showing the
      // cells as they were — the one bug this panel had. The getter reads
      // `stashRevision`, which every operation bumps.
      //
      // The objects are fresh on every read, so `each`'s identity diff remounts the
      // page's cells rather than patching them. A page is a hundred divs and this
      // happens when the player moves an item, so it is not worth a key that survives
      // a content change.
      interface Cell {
        /** The `data-cell` attribute, for the verifier and the stylesheet. */
        readonly key: string
        readonly address: StashAddress
        readonly label: string
        readonly art: string | null
        readonly count: number
      }
      const cells = (): Cell[] => {
        void game.stashRevision.value
        const placements = stash.placements(page.id)
        const out: Cell[] = []
        if (page.kind === 'advanced') {
          for (const slot of page.slots) {
            const held = placements.find(
              (entry) => entry.address.kind === 'slot' && entry.address.slot === slot.name,
            )
            out.push({
              key: slot.name,
              address: { kind: 'slot', slot: slot.name },
              label: held === undefined ? slot.itemCode : (held.item.name ?? slot.itemCode),
              art: held === undefined ? null : itemArtUrl(held.item.graphic ?? null),
              count: held?.count ?? 0,
            })
          }
          return out
        }
        for (let row = 0; row < grid.rows; row += 1) {
          for (let column = 0; column < grid.columns; column += 1) {
            const held = placements.find(
              (entry) =>
                entry.address.kind === 'cell' &&
                entry.address.column === column &&
                entry.address.row === row,
            )
            out.push({
              key: `${column},${row}`,
              address: { kind: 'cell', column, row },
              label: held === undefined ? '' : (held.item.name ?? ''),
              art: held === undefined ? null : itemArtUrl(held.item.graphic ?? null),
              count: held?.count ?? 0,
            })
          }
        }
        return out
      }
      return (
        <div class="panel-content" data-hud="" style={placement}>
          <div class="waypoint-tabs" data-hud="">
            {each(pages as never[], (entry: { id: string; label: string }) => (
              <div
                class={`waypoint-tab${entry.id === active.value ? ' active' : ''}`}
                data-hud=""
                data-stash-tab={entry.id}
                onPointerDown={() => {
                  active.value = entry.id
                }}
              >
                {caption(entry)}
              </div>
            ))}
          </div>
          <div class="panel-grid" data-hud="" style={template}>
            {each(cells, (cell: Cell) => (
              <div
                class={`bag-cell${cell.label === '' ? ' empty' : ''}`}
                data-hud=""
                data-cell={cell.key}
                title={cell.label}
                onPointerDown={() => {
                  if (cell.label !== '') withdraw(cell.address)
                }}
              >
                {when({
                  condition: () => cell.art !== null,
                  then: () => {
                    // `itemArtUrl` returns the *served* URL, root included, so it is
                    // used as it comes: prefixing `base` again turned it into
                    // `//original/…`, which the browser read as a host called
                    // "original".
                    const src = cell.art as string
                    return <img src={src} alt={cell.label} draggable={false} data-hud="" />
                  },
                })}
                {when({
                  // A base with no `invfile` is real — the throwing potions are one —
                  // and an occupied cell that draws nothing reads as an empty cell.
                  // The bag falls back to the item's initials for the same reason.
                  condition: () => cell.art === null && cell.label !== '',
                  then: () => (
                    <span class="bag-fallback" data-hud="">
                      {cell.label.slice(0, 2)}
                    </span>
                  ),
                })}
                {when({
                  condition: () => cell.count > 1,
                  then: () => <span class="bag-count" data-hud="">{cell.count}</span>,
                })}
              </div>
            ))}
          </div>
          <p class="panel-note" data-hud="">
            {note}
          </p>
        </div>
      )
    },
  })
}

/**
 * The waypoints of one act, drawn over the waypoint layout's frame.
 *
 * The panel names no list widget: its `Templates` block is button *art*, not a list,
 * and the buttons themselves are created at runtime — the file states no position for
 * any of them, and every `Quest0`–`Quest20` placeholder in the quest log resolves to
 * its panel's own origin for the same reason. The one box the file does state for
 * that area is `Overlay` — `PANEL\Waypoints\Waypoints_Overlay`,
 * `rect: {x: 150, y: 201}` — the wash the buttons are drawn over, measured at
 * [160.8, 169.8] with the sprite's own extent (857 x 1107 units). The act's list goes
 * there, and the five act buttons stand in for the layout's five runtime tabs.
 *
 * The waypoints themselves are real: `levels.txt`'s `Waypoint` column gives each
 * area its index in the act (255 for "no waypoint"), and the area names are the
 * string table's ("Rogue Encampment", "Cold Plains", …). `Waypoint` is not part of
 * `GameData` — `gamedata.ts` exports the level rows without it — so `main.tsx` reads
 * the exported table beside it; see `loadWaypoints`.
 */
function WaypointOverlay(props: {
  layers: UiLayerSet | null
  waypoints: readonly WaypointAct[]
  act: SignalRef<number>
  open: SignalRef<boolean>
}) {
  const layers = props.layers
  const act = props.act
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const acts = props.waypoints
  const panel = panelOf(loaded, 'waypointspanelexpansionhd')
  const placement = cssBox(
    rectBoxOf(widgetAt(panel, ['Overlay'])),
    panelInset(loaded, 'waypointspanelexpansionhd'),
  )
  const rows = computed((): WaypointArea[] => [
    ...(acts.find((entry) => entry.act === act.value)?.areas ?? []),
  ])
  const title = computed(() => `Act ${act.value} · ${rows.value.length} waypoints`)
  return when({
    condition: () => open.value,
    then: () => (
      <div class="panel-content waypoint-panel" data-hud="" style={placement}>
        <div class="waypoint-tabs" data-hud="">
          {each(acts as never[], (entry: WaypointAct) => (
            <div
              class={tabClass(entry, act)}
              data-hud=""
              onPointerDown={() => {
                act.value = entry.act
              }}
            >
              {`Act ${entry.act}`}
            </div>
          ))}
        </div>
        <div class="waypoint-title" data-hud="">
          {title}
        </div>
        <div class="waypoint-rows" data-hud="">
          {each(rows, (area: WaypointArea) => (
            <div class="waypoint-row" data-hud="">
              {area.name}
            </div>
          ))}
        </div>
      </div>
    ),
  })
}

/**
 * A vendor's shop, drawn over the vendor layout's frame.
 *
 * Its content widget is the shop's own `grid` — `InventoryGridWidget`,
 * `rect: {x: 91, y: 233}`, `cellCount: {x: 10, y: 10}`, `cellSize: $ItemCellSize` —
 * measured at [136.3, 183.1, 408.3, 408.3] on a 1600x900 viewport, above the panel's
 * own repair and refresh buttons.
 *
 * The stock is not modelled and is not invented here: this app has no vendor
 * inventory and no merchant state, so the hundred cells are drawn empty and the note
 * says plainly that the shop is empty. The gold is the character's, which is real.
 */
function VendorOverlay(props: { game: Game; layers: UiLayerSet | null; open: SignalRef<boolean> }) {
  const layers = props.layers
  const game = props.game
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const panel = panelOf(loaded, 'vendorpanellayouthd')
  const shopBox = gridBoxOf(widgetAt(panel, ['grid']), loaded.viewport)
  const placement = cssBox(shopBox, panelInset(loaded, 'vendorpanellayouthd'))
  // The four tabs are the layout's own `textStrings` — `@strBSArmor`,
  // `@strBSWeapons`, `@strBSWeapons`, `@strBSMisc` — and they name the `storepage`
  // codes in the same order, so the tab row is the panel's own and the page behind
  // each tab is the code it names. Which of them a particular NPC offers is **not in
  // the data** (`npc.txt` carries the pricing multipliers and no page column, and no
  // other table joins a seller to a page), so every vendor offers the panel's four.
  const tabBar = widgetAt(panel, ['tabs'])
  const captions: readonly string[] = (() => {
    const raw = tabBar?.widget.fields.textStrings
    if (!Array.isArray(raw)) return []
    return raw.filter((entry): entry is string => typeof entry === 'string')
  })()
  const tabs: readonly string[] = Game.VENDOR_TABS
  const active = ref(0)
  const stock = ref<VendorStock | null>(null)
  const note = ref('')

  const load = (): void => {
    const page = tabs[active.value] ?? tabs[0]
    const built = game.vendorStock(page)
    stock.value = built
    if (built === null) {
      note.value = 'no store page table was exported, so this vendor has no stock'
      return
    }
    const keeper = game.vendorNpc()
    note.value =
      `${built.page.name ?? built.page.code} · item level ${built.ilvl} · ` +
      `${built.permanent.length} always stocked, ${built.rolled.length} rolled` +
      (built.aboveLevel.length > 0 ? ` · ${built.aboveLevel.length} above level` : '') +
      (built.unspawnable.length > 0 ? ` · ${built.unspawnable.length} unspawnable` : '') +
      (keeper === null
        ? ' · no priced vendor in this area'
        : ` · priced by ${keeper.displayName}${keeper.exact ? '' : ' (not the nearest, whose prices are the same table)'}`)
  }
  const opened = (): boolean => {
    if (open.value) load()
    return open.value
  }

  const entries = (): StockEntry[] => {
    const built = stock.value
    if (built === null) return []
    return [...built.permanent, ...built.rolled]
  }
  const priceText = (entry: StockEntry): string => {
    const built = stock.value
    if (built === null || entry.price === null) return '—'
    return `${entry.price} g`
  }

  return when({
    condition: opened,
    then: () => (
      <div class="panel-content" data-hud="" style={placement}>
        <div class="waypoint-tabs" data-hud="">
          {tabs.map((code, index) => (
            <div
              class={`waypoint-tab${index === active.value ? ' active' : ''}`}
              data-hud=""
              data-vendor-tab={code}
              onPointerDown={() => {
                active.value = index
                load()
              }}
            >
              {loaded.source.strings.resolve(captions[index]) ?? code}
            </div>
          ))}
        </div>
        <div class="bag-grid" data-hud="">
          {each(entries() as never[], (entry: StockEntry) => {
            // Handlers and attribute values are bound to identifiers: the JSX compiler
            // wraps a member expression, and a wrapped `src` is set to the wrapper's
            // own source text.
            const src = entry.item.graphic === null ? null : itemArtUrl(entry.item.graphic)
            const label = entry.item.name ?? 'item'
            const price = priceText(entry)
            return (
              <div class="bag-entry" data-hud="" title={`${label} — ${price}`}>
                {when({
                  condition: () => src !== null,
                  then: () => <img src={src as string} alt={label} draggable={false} data-hud="" />,
                })}
                <span data-hud="">{label}</span>
                <b data-hud="">{price}</b>
              </div>
            )
          })}
        </div>
        <p class="panel-note" data-hud="">
          {note}
        </p>
      </div>
    ),
  })
}

/**
 * The mercenary's equipment, drawn over the hireling layout's frame.
 *
 * `hirelinginventorypanelhd` is the panel the player opens on a hired mercenary —
 * the counterpart of the character sheet, with the mercenary's name, level, life,
 * damage, armour and resistances. Its content widgets are the four equipment slots
 * the file states: `slot_head` at `rect: {x: 481, y: 193, width: 196, height: 196}`
 * -> [298.8, 166.5, 81.7, 81.7]; `slot_torso` at `{x: 481, y: 433, 196 x 294}` ->
 * [298.8, 266.5, 81.7, 122.5]; `slot_right_arm` at `{x: 108, y: 336, 196 x 392}` ->
 * [143.3, 226.1, 81.7, 163.3]; `slot_left_arm` at `{x: 861, y: 336, 196 x 392}` ->
 * [457.1, 226.1, 81.7, 163.3]. Each is drawn at its own box, offset into the box that
 * contains all four, so the slots land where the layout puts them.
 *
 * There is no mercenary to fill them: this app models no hireling at all — `Game` has
 * no mercenary state, and the `table_hireling.json` the export holds (135 rows,
 * `Rogue Scout` and the rest, with their acts, levels and gold costs) is loaded by
 * nothing here — so the slots are empty and the note says so rather than inventing a
 * companion. The hire menu the export also holds — `hiremenupanelhd`, whose content
 * widget is its `ListContainer` — is left alone for the same reason: it lists
 * mercenaries that do not exist here.
 */
function HirelingOverlay(props: { layers: UiLayerSet | null; open: SignalRef<boolean> }) {
  const layers = props.layers
  const open = props.open
  if (layers === null) return null
  const loaded = layers
  const panel = panelOf(loaded, 'hirelinginventorypanelhd')
  const slots = ['slot_head', 'slot_torso', 'slot_right_arm', 'slot_left_arm']
    .map((name) => widgetAt(panel, [name]))
    .filter((widget): widget is ResolvedWidget => widget !== null)
  const dollBox = unionBox(slots)
  const slotStyles: Array<Record<string, string>> =
    dollBox === null
      ? []
      : slots.map((slot) => ({
          left: `${slot.box.x - dollBox.left}px`,
          top: `${slot.box.y - dollBox.top}px`,
          width: `${slot.box.width}px`,
          height: `${slot.box.height}px`,
        }))
  const placement = cssBox(dollBox, panelInset(loaded, 'hirelinginventorypanelhd'))
  const note = computed(
    () => 'no mercenary is modelled — these are the layout\u2019s own four equipment slots, empty',
  )
  return when({
    condition: () => open.value,
    then: () => (
      <div class="panel-content" data-hud="" style={placement}>
        {each(slotStyles as never[], (style: Record<string, string>) => (
          <div class="bag-cell empty merc-slot" data-hud="" style={style} />
        ))}
        <p class="panel-note" data-hud="">
          {note}
        </p>
      </div>
    ),
  })
}

/**
 * The screen the game opens on.
 *
 * With the UI export present this is the game's own main menu — the ribbon
 * layout, its animated logo, its button frames and its captions, all from the
 * package. Without it, the drawn start screen, so a build with no export is still
 * usable rather than blank.
 */
function MainMenu(props: {
  screens: FrontendScreens | null
  started: SignalRef<boolean>
  onStart: () => void
  characters: readonly FrontendCharacter[]
}) {
  const screens = props.screens
  const started = props.started
  const onStart = props.onStart
  const characters = props.characters
  if (screens !== null) {
    const loaded = screens
    return when({
      condition: () => !started.value,
      then: () => <Frontend screens={loaded} onPlay={onStart} characters={characters} />,
    })
  }
  return StartOverlay({ started, onStart })
}

function StartOverlay(props: { started: SignalRef<boolean>; onStart: () => void }) {
  const started = props.started
  const onStart = props.onStart
  return when({
    // Shown until the player has started.
    condition: () => !started.value,
    then: () => (
      <div class="overlay" data-hud="" onPointerDown={onStart}>
        <h1 class="title" data-hud="">
          Sanctum
        </h1>
        <p class="subtitle" data-hud="">
          an isometric action rpg · built with rasen
        </p>
        <div class="rule" data-hud="" />
        <div class="keys" data-hud="">
          <span data-hud="">
            <b data-hud="">Left thumb</b> walk
          </span>
          <span data-hud="">
            <b data-hud="">Tap the ground</b> path there
          </span>
          <span data-hud="">
            <b data-hud="">Tap a monster</b> approach and strike
          </span>
          <span data-hud="">
            <b data-hud="">Drag the fireball</b> aim at any angle
          </span>
          <span data-hud="">
            <b data-hud="">Hold the fireball</b> keep casting
          </span>
          <span data-hud="">
            <b data-hud="">Belt slot</b> drink a potion
          </span>
          <span data-hud="">
            <b data-hud="">WASD</b> move · <b data-hud="">1 2 3</b> skills
          </span>
          <span data-hud="">
            <b data-hud="">Space</b> potion · <b data-hud="">M</b> mute
          </span>
        </div>
        <div class="rule" data-hud="" />
        <div class="cta" data-hud="">
          Click to descend
        </div>
        <p class="subtitle" data-hud="" style={{ opacity: 0.72 }}>
          the Warden waits in the sanctum to the north-east
        </p>
      </div>
    ),
  })
}

function DeathOverlay(props: { game: Game }) {
  const hud = props.game.hud
  const countdown = computed(() => `rising again in ${hud.respawnIn.value.toFixed(1)}`)
  return when({
    condition: () => !hud.alive.value,
    then: () => (
      <div class="overlay dead" data-hud="">
        <h1 class="dead-title" data-hud="">
          You have died
        </h1>
        <p class="subtitle" data-hud="">
          {countdown}
        </p>
      </div>
    ),
  })
}

/**
 * The "Talk to X" prompt.
 *
 * Shown only when the hero is standing next to an NPC, and only while nothing is
 * being said, so it never competes with the dialogue box for the same taps.
 */
function TalkPrompt(props: {
  prompt: SignalRef<string>
  /** True while a conversation is on screen, which hides the prompt. */
  dialogueOpen: { readonly value: boolean }
  onTalk: () => void
}) {
  const prompt = props.prompt
  const dialogueOpen = props.dialogueOpen
  const onTalk = props.onTalk
  return when({
    condition: () => prompt.value !== '' && !dialogueOpen.value,
    then: () => (
      <div class="talk-prompt" data-hud="" onPointerDown={onTalk}>
        <span data-hud="">{prompt.value}</span>
      </div>
    ),
  })
}

/**
 * The dialogue box.
 *
 * The lines are the retail ones `vo.json` carries for the speaker, in table
 * order, and the panel steps through them the way the game does. The speaker's
 * name comes from `monstats.NameStr`, so it reads "Warriv" rather than the
 * `warriv1` the tables key on.
 */
/**
 * The dialogue box.
 *
 * The frame is the game's own: `PANEL/TooltipBorder/TooltipBorder`, which the
 * `npcdialogpanelhd` layout names for its `DialogBorder`, drawn as a nine-tile so
 * the corners keep their size and only the edges stretch — the same way the game
 * draws it. Without the atlas the box falls back to the drawn frame rather than
 * to nothing.
 *
 * The game's own dialogue *button* art, `PANEL/Modals/Modal_Button`, is named by
 * the layout but **is not in the package** — the whole tree was searched and the
 * name appears nowhere — so the buttons stay as drawn controls rather than
 * pretending a substitute is the real frame.
 */
function DialoguePanel(props: {
  view: SignalRef<DialogueView | null>
  onAdvance: () => void
  onClose: () => void
  /** The game's tooltip border, when its atlas is exported. */
  frame: UiFrame | null
  /** One layout unit in CSS pixels, for the border's width. */
  unit: number
}) {
  const view = props.view
  const onAdvance = props.onAdvance
  const onClose = props.onClose
  const frame = props.frame
  // The frame is a nine-tile, so it is drawn as one — by the renderer's own
  // `nineTileBorder`, the same function a layout's `NineTileImageWidget` goes through.
  // This box used to compute its own `border-image` inline, with the slice counted in
  // texels and then used as pixels, which drew the frame 2.4x too thick at a 909-pixel
  // viewport. `tileScale` is 1 because no layout states one here; the corner is a
  // quarter of the sheet's shorter side, which is the arithmetic `nineTileBorder`
  // documents being used for every other frame in the game.
  const unit = props.unit
  const borderStyle = frame === null ? {} : nineTileBorder(frame, 1, unit)
  return when({
    condition: () => view.value !== null,
    then: () => {
      const current = view.value
      if (current === null) return <div data-hud="" />
      return (
        <div class="dialogue-overlay" data-hud="" onPointerDown={onAdvance}>
          <div
            class="dialogue-box"
            data-hud=""
            data-ui-name="DialogBorder"
            style={borderStyle}
            onPointerDown={(event: Event) => event.stopPropagation()}
          >
            <div class="dialogue-speaker" data-hud="">
              {current.displayName}
            </div>
            <div class="dialogue-text" data-hud="">
              {current.text}
            </div>
            <div class="dialogue-foot" data-hud="">
              <span data-hud="">
                {`${current.index + 1} / ${current.keys.length}`}
              </span>
              <div class="dialogue-next" data-hud="" onPointerDown={onAdvance}>
                {current.index + 1 >= current.keys.length ? 'Done' : 'Next'}
              </div>
              <div class="dialogue-close" data-hud="" onPointerDown={onClose}>
                Close
              </div>
            </div>
          </div>
        </div>
      )
    },
  })
}

export interface HudProps {
  game: Game
  /** URL prefix the app is served from, for building asset paths. */
  base: string
  fireball: SkillButtonControl
  onNova: () => void
  onPotion: () => void
  started: SignalRef<boolean>
  onStart: () => void
  skillsOpen: SignalRef<boolean>
  onToggleSkills: () => void
  bagOpen: SignalRef<boolean>
  onToggleBag: () => void
  charOpen: SignalRef<boolean>
  onToggleChar: () => void
  questOpen: SignalRef<boolean>
  onToggleQuest: () => void
  /** The stash, the waypoint list, a vendor's shop and a mercenary's equipment. */
  stashOpen: SignalRef<boolean>
  waypointOpen: SignalRef<boolean>
  vendorOpen: SignalRef<boolean>
  hirelingOpen: SignalRef<boolean>
  /**
   * The waypoints of each act, out of `levels.txt`'s `Waypoint` column.
   *
   * Empty when the tables were not exported, and the panel then shows its acts with
   * no areas rather than invented ones.
   */
  waypoints: readonly WaypointAct[]
  act: SignalRef<number>
  onTalk: () => void
  onAdvanceDialogue: () => void
  onCloseDialogue: () => void
  /**
   * Travel to an area by `levels.txt` id, from the ways-out list.
   *
   * The list itself is the simulation's (`hud.travel`), because which areas can be
   * entered is a fact about `lvlprest.txt`; the HUD only reports the click.
   */
  onTravel: (areaId: number) => void
  /**
   * The game's own main menu, loaded from its layout files and atlases.
   *
   * Null when the UI export is absent, in which case the drawn start screen
   * stands in rather than the app showing nothing.
   */
  screens: FrontendScreens | null
  characters: readonly FrontendCharacter[]
  /** The game's own HUD layout, drawn beneath the values this app overlays on it. */
  hudLayers: UiLayerSet | null
  /** Whether the game is paused, which raises the pause layout. */
  paused: SignalRef<boolean>
  /** Raises and lowers the pause layout, from the HUD's own pause button. */
  onTogglePause: () => void
}

export function Hud(props: HudProps) {
  if (import.meta.env.DEV) {
    ;(globalThis as { hudProbe?: unknown }).hudProbe = async (open: { value: boolean }) => {
      const { mount } = await import('@rasenjs/dom')
      const host = document.createElement('div')
      document.body.appendChild(host)
      mount(<div>{PanelLayer({ layers: props.hudLayers, name: 'probe', open })}</div>, host)
      open.value = true
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 50))
      const html = host.innerHTML
      host.remove()
      return JSON.stringify({ html, layers: props.hudLayers === null ? 'null' : 'set' })
    }
  }
  // Every value handed to a child component is hoisted to a local first.
  // The JSX compiler wraps member expressions in getters (`() => a.b`) because
  // canvas props deep-unwrap them — but a *plain* object prop arrives as a
  // function, so `props.started.value` would be `undefined`. That is exactly the
  // trap the mario example documents; identifiers pass through untouched.
  const game = props.game
  const fireball = props.fireball
  const onNova = props.onNova
  const base = props.base
  // The retail icons do not change at runtime, so they are resolved once here
  // and handed over as plain strings. Passing the expression inline would let the
  // compiler wrap it in a getter, and the DOM would then set `src` to the
  // function's own source text.


  const started = props.started
  const onPotion = props.onPotion
  const onStart = props.onStart
  const onToggleSkills = props.onToggleSkills
  // Refs and handlers handed to a child must be identifiers: a member expression
  // arrives as a getter, so the child would read `.value` off a function.
  const skillsOpen = props.skillsOpen
  const bagOpen = props.bagOpen
  const onToggleBag = props.onToggleBag
  const charOpen = props.charOpen
  const onToggleChar = props.onToggleChar
  const questOpen = props.questOpen
  const onToggleQuest = props.onToggleQuest
  const stashOpen = props.stashOpen
  const waypointOpen = props.waypointOpen
  const vendorOpen = props.vendorOpen
  const hirelingOpen = props.hirelingOpen
  const waypoints = props.waypoints
  const act = props.act
  const screens = props.screens
  const characters = props.characters
  const hudLayers = props.hudLayers
  const paused = props.paused
  const onTogglePause = props.onTogglePause
  // Shared between the bag and the stash: which page is open, and what the last
  // operation answered. Both are the panel's own state rather than either overlay's.
  const stashPage = ref('personal')
  const stashNote = ref('')
  const onTalk = props.onTalk
  const onAdvanceDialogue = props.onAdvanceDialogue
  const onCloseDialogue = props.onCloseDialogue
  const onTravel = props.onTravel
  const hud = game.hud
  const npcPrompt = hud.npcPrompt
  const dialogue = hud.dialogue
  // Both the prompt and the box want the same taps, so the prompt watches the
  // box. A derived signal rather than a plain read keeps it reactive.
  const dialogueOpen = computed(() => dialogue.value !== null)
  // The game's tooltip border, which its dialogue layout names for the box's
  // frame. Null without the UI export, and the box then draws its own.
  const dialogueBorder =
    screens === null ? null : screens.source.sprites.frame('PANEL/TooltipBorder/TooltipBorder', 0)
  // The dialogue box is not a layout, so its unit has to come from somewhere: the HUD
  // layer set is the only viewport-scaled thing in scope, and both read the same size.
  const dialogueUnit = hudLayers === null ? 1 : unitOf(hudLayers.viewport)
  // Refs that are *handed to a component* must be hoisted to identifiers too:
  // `hud.health` is a member expression, so the compiler would pass a getter and
  // the child would read `.value` off a function.

  // Bound to identifiers, not passed as call expressions: the compiler wraps a
  // call in a getter, and the DOM then sets `src` to the wrapper's source text
  // instead of the URL.

  return (
    // One layer over the whole screen with pointer events off, so the play
    // surface still receives every touch that does not land on a control.
    /*
      The one element that places the interface block, and the only place `uiOffsetOf`
      is applied.

      Everything the interface draws is a child of this: the layouts through
      `UiLayers`, the panels through `PanelLayer`, and everything this file draws itself
      — the globes' liquid, the belt's cells, a panel's rows, the minimap, the front
      end. They are all in *interface coordinates*, so the block's origin has to be
      above all of them. It used to be on `UiLayers`' wrapper, which meant the layouts
      were shifted and the app's own content was not: on a window taller than 16:9 the
      globes' fill sat exactly one block-height above its own art, which is the
      separation the user saw.
    */
    <div class="hud-layer" data-hud="" style={hudLayerStyle(hudLayers)}>
      <div class="vignette" data-hud="" />
      <div class="grain" data-hud="" />

      {/*
        The in-game interface exists only once the game does.

        Two reasons, and the first one was a bug: the HUD's own `Overlay` widget spans
        the bar and takes pointer events, so it sat *over* the front end's Play button
        and swallowed the press — clicking Play did nothing, and only a key could start
        the game. The layering is what made it happen (`.frontend` is a child of
        `.hud-layer`, so every HUD node renders after it), and the fix is the one the
        retail game makes anyway: the title screen and the menu have no HUD bar. The
        second reason is the same statement from the other side — a health globe, a
        skill bar and a minimap over a menu are the app's chrome, not the game's screen.

        `MainMenu` stays outside the gate, because it *is* the menu.
      */}
      {when({
        condition: () => started.value,
        then: () => (<>
      {PanelLayer({ layers: hudLayers, name: "playerinventoryexpansionlayouthd", open: bagOpen })}
      {PanelLayer({ layers: hudLayers, name: "characterstatspanelhd", open: charOpen })}
      {PanelLayer({ layers: hudLayers, name: "skillstreepanelhd", open: skillsOpen })}
      {PanelLayer({ layers: hudLayers, name: "questlogpaneloriginalhd", open: questOpen })}
      {PanelLayer({ layers: hudLayers, name: "bankexpansionlayouthd", open: stashOpen })}
      {PanelLayer({ layers: hudLayers, name: "waypointspanelexpansionhd", open: waypointOpen })}
      {PanelLayer({ layers: hudLayers, name: "vendorpanellayouthd", open: vendorOpen })}
      {PanelLayer({ layers: hudLayers, name: "hirelinginventorypanelhd", open: hirelingOpen })}
      <InventoryOverlay
        game={game}
        layers={hudLayers}
        open={bagOpen}
        stashOpen={stashOpen}
        onDeposit={(index) => {
          const message = game.depositIntoStash(stashPage.value, index).message
          stashNote.value = message
        }}
      />
      <CharacterOverlay game={game} layers={hudLayers} open={charOpen} />
      <SkillOverlay game={game} layers={hudLayers} base={base} open={skillsOpen} />
      <QuestOverlay game={game} layers={hudLayers} act={act} open={questOpen} />
      <StashOverlay
        game={game}
        layers={hudLayers}
        open={stashOpen}
        page={stashPage}
        note={stashNote}
      />
      <WaypointOverlay layers={hudLayers} waypoints={waypoints} act={act} open={waypointOpen} />
      <VendorOverlay game={game} layers={hudLayers} open={vendorOpen} />
      <HirelingOverlay layers={hudLayers} open={hirelingOpen} />
      {HudFrame({
        game,
        base,
        fireball,
        onNova,
        layers: hudLayers,
        onInventory: onToggleBag,
        onCharacter: onToggleChar,
        onSkills: onToggleSkills,
        onQuest: onToggleQuest,
        onPause: onTogglePause,
        onPotion,
      }) as never}
      {HudExtras({ game, layers: hudLayers, base, paused }) as never}
      <StatsPanel game={game} />
      <Minimap game={game} />
      <TravelList game={game} onTravel={onTravel} />
      <DialoguePanel
        view={dialogue}
        onAdvance={onAdvanceDialogue}
        onClose={onCloseDialogue}
        frame={dialogueBorder}
        unit={dialogueUnit}
      />
      <TalkPrompt prompt={npcPrompt} dialogueOpen={dialogueOpen} onTalk={onTalk} />
      <BossBar game={game} />
      <LogPanel game={game} />

      {when({
        condition: () => hud.aiming.value,
        then: () => (
          <div class="aim-hint" data-hud="">
            aiming · release to cast
          </div>
        ),
      })}

      <DeathOverlay game={game} />
        </>) as never,
      })}
      <MainMenu
        screens={screens}
        started={started}
        onStart={onStart}
        characters={characters}
      />
    </div>
  )
}
