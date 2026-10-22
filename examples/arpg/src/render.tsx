/**
 * The scene tree — one JSX tree holding the WebGL-free canvas world *and* the
 * DOM interface.
 *
 * Layers, back to front:
 *
 *   1. the baked ground bitmap, inside the camera group;
 *   2. `game.renderList` — every live actor, depth-sorted and culled, rendered
 *      through one `each` so the scene tree's structural churn is proportional
 *      to what is on screen;
 *   3. screen-space overlays drawn in the canvas (the thumbstick and the aim
 *      dot) which must not move with the camera;
 *   4. the DOM HUD, the vignette, and the overlays.
 *
 * The depth sort is done by the simulation: it hands over an ordered array and
 * `each` reorders the mounted nodes to match. Nothing here sorts anything —
 * ordering is a simulation concern, and the scene tree only reproduces it.
 */

import { com, each } from '@rasenjs/core'
import { group, image as imageNode } from '@rasenjs/canvas-2d'
import type {
  ActorSlot,
  EffectSlot,
  FloatSlot,
  Game,
  LootSlot,
  PropSlot,
} from './game'
import { Hud, type HudProps } from './hud'
import { toScreen, toWorld } from './iso'
import type { WallCell } from './world'
import { Actor3DLayer } from './three-d/actor-layer'
import { actor3DActors, actor3DTick, hiddenActorSlots } from './three-d/game-actors'
import { viewportKey } from './viewport'

type Slot = ActorSlot | PropSlot | LootSlot | FloatSlot | EffectSlot

interface Geometry {
  frameWidth: number
  frameHeight: number
  columns: number
}

const BAR_WIDTH = 34
const BAR_HEIGHT = 4

/**
 * A hero/monster: body, hit flash and (for the elite) a name bar.
 *
 * The cell size comes from the *slot*, not from a game-wide geometry: a slot is
 * reused for actors that are drawn from different sheets, and the hero's strip, a
 * monster token's and an NPC's palette copy do not share a grid.
 */
function ActorSprite(props: { slot: ActorSlot }) {
  const slot = props.slot
  return (
    <group x={slot.x} y={slot.y}>
      <sprite
        image={slot.image}
        // `as never` because the sprite component's props are typed as plain
        // numbers: `unref` is what makes a ref, a getter and a number all work at
        // runtime, and widening the type is a breaking change for the package's
        // callers. See the note on `SpriteProps.frameWidth`.
        frameWidth={slot.frameWidth as never}
        frameHeight={slot.frameHeight as never}
        columns={slot.columns as never}
        frame={slot.frame}
        opacity={slot.opacity}
        x={0}
        y={0}
        width={slot.width}
        height={slot.height}
      />
      {/* The flash is always mounted and driven by opacity: a `when` around it
          would mount and unmount a node on every hit. */}
      <sprite
        image={slot.flashImage}
        frameWidth={slot.frameWidth as never}
        frameHeight={slot.frameHeight as never}
        columns={slot.columns as never}
        frame={slot.frame}
        opacity={slot.flash}
        x={0}
        y={0}
        width={slot.width}
        height={slot.height}
      />
      <group x={0} y={-9} opacity={slot.barOpacity}>
        <rect
          x={BAR_WIDTH / -2}
          y={0}
          width={BAR_WIDTH}
          height={BAR_HEIGHT}
          fill="#120604"
          opacity={0.85}
        />
        <rect
          x={BAR_WIDTH / -2}
          y={0}
          width={BAR_WIDTH}
          height={BAR_HEIGHT}
          fill="#c31f16"
          // scaleX shrinks toward the transform centre, and offsetX moves that
          // centre to the bar's left edge — otherwise a hurt monster's bar
          // shrinks from both ends.
          scaleX={slot.hp}
          offsetX={BAR_WIDTH / -2}
        />
      </group>
    </group>
  )
}

/** A static prop. Nothing about it is reactive except its position in the list. */
function PropSprite(props: { slot: PropSlot; geometry: Geometry }) {
  const { slot, geometry } = props
  // `slot.x`/`slot.y` are the object's TILE coordinates — the same pair the
  // depth sort and the 3D layer use — so they have to be projected before they
  // mean anything on screen. Drawing them directly put every object at the
  // world origin in PIXELS (a prop on tile (32, 16) was painted at (32, 16) px
  // instead of (1280, 1920)), which is the offset that looked like the map
  // being misaligned.
  const point = toScreen(slot.x, slot.y)
  const width = geometry.frameWidth * slot.scale
  const height = geometry.frameHeight * slot.scale
  return (
    <sprite
      image={slot.image}
      frameWidth={geometry.frameWidth}
      frameHeight={geometry.frameHeight}
      columns={geometry.columns}
      frame={slot.frame}
      // Bottom-centre on the cell, the same anchor `Game.spriteAnchor` culls by.
      x={point.x - width / 2}
      y={point.y - height}
      width={width}
      height={height}
    />
  )
}

/** A ground drop, with its name floating above it in the rarity colour. */
function LootSprite(props: { slot: LootSlot; geometry: Geometry }) {
  const { slot, geometry } = props
  // `slot.x`/`slot.y` are TILE coordinates (the drop is spawned at the monster's
  // tile), so they are projected before they mean anything on screen — passing
  // them to the group directly drew every drop at the world origin in pixels.
  const screen = (): { x: number; y: number } => toScreen(slot.x.value, slot.y.value)
  return (
    <group
      x={() => screen().x}
      y={() => screen().y}
      opacity={slot.opacity}
    >
      <sprite
        image={slot.image}
        frameWidth={geometry.frameWidth}
        frameHeight={geometry.frameHeight}
        columns={geometry.columns}
        frame={slot.frame}
        // Bottom-centre on the tile, like every other standing thing.
        x={-geometry.frameWidth / 2}
        y={-geometry.frameHeight}
        width={geometry.frameWidth}
        height={geometry.frameHeight}
      />
      <text
        text={slot.label}
        x={0}
        y={-6}
        fill={slot.labelColor}
        font="bold 11px 'Palatino Linotype', Georgia, serif"
        textAlign="center"
        shadowColor="rgba(0,0,0,0.95)"
        shadowBlur={4}
        shadowOffsetY={1}
      />
    </group>
  )
}

/** A floating number: damage, a pickup, a level-up. */
function FloatText(props: { slot: FloatSlot }) {
  const { slot } = props
  return (
    <text
      text={slot.text}
      x={slot.x}
      y={slot.y}
      fill={slot.color}
      opacity={slot.opacity}
      font="bold 15px 'Trebuchet MS', Verdana, sans-serif"
      textAlign="center"
      shadowColor="rgba(0,0,0,0.95)"
      shadowBlur={5}
      shadowOffsetY={2}
    />
  )
}

/** An expanding spell ring. */
function EffectRing(props: { slot: EffectSlot }) {
  const { slot } = props
  return (
    <circle
      x={slot.x}
      y={slot.y}
      radius={slot.radius}
      stroke={slot.color}
      lineWidth={slot.thickness}
      opacity={slot.opacity}
    />
  )
}

/**
 * Is this 2D prop standing in front of a 3D actor?
 *
 * The 3D layer draws every model over the whole 2D canvas, so a prop that is
 * NEARER the camera than a character (greater `x + y`) would still be painted
 * under it — the "the character walks over the tree instead of behind it" look.
 * Such a prop moves to the overlay pass, which sits above the 3D layer.
 *
 * The test is per prop against the nearest characters: props and characters
 * rarely share a tile, so a one-and-a-half tile radius covers the overlap.
 */
function propStandsInFront(
  slot: Slot,
  actors: ReadonlyArray<{ id: string; tileX: number; tileY: number; visible?: boolean }>,
): boolean {
  if (slot.kind !== 'prop' || !slot.active) return false
  const depth = slot.x + slot.y
  for (const actor of actors) {
    if (actor.visible === false) continue
    const head = actor.id.split(':')[0]
    if (head !== 'hero' && head !== 'monster' && head !== 'npc') continue
    if (actor.tileX + actor.tileY >= depth) continue
    if (Math.max(Math.abs(actor.tileX - slot.x), Math.abs(actor.tileY - slot.y)) > 1.5) continue
    return true
  }
  return false
}

/**
 * Is this wall cell in FRONT of a nearby 3D actor (nearer the camera)?
 *
 * A wall's art is tall, so a wall one or two cells nearer than a character
 * overlaps them on screen even though their tiles do not. Whether it should
 * cover them is a per-cell question -- which is exactly why baking every wall
 * into one bitmap could not be right: it forced one answer for all of them and
 * left the character hidden behind walls it was standing in front of.
 */
function wallCoversActor(
  cell: WallCell,
  actors: ReadonlyArray<{ id: string; tileX: number; tileY: number; visible?: boolean }>,
): boolean {
  const depth = cell.x + cell.y
  // The wall's own picture on screen. A wall is TALL: its art reaches far above
  // the cell it stands on, so overlap is measured on the picture, not the tile.
  const point = toScreen(cell.x, cell.y)
  const left = point.x - 80 + cell.art.frameX
  const top = point.y - 40 + cell.art.frameY
  const right = left + cell.art.canvas.width
  const bottom = top + cell.art.canvas.height
  let hidesSomeone = false
  for (const actor of actors) {
    if (actor.visible === false) continue
    const head = actor.id.split(':')[0]
    if (head !== 'hero' && head !== 'monster' && head !== 'npc') continue
    const centre = toScreen(actor.tileX, actor.tileY)
    const actorLeft = centre.x - 44
    const actorRight = centre.x + 44
    const actorBottom = centre.y
    const actorTop = centre.y - 132
    if (right < actorLeft || left > actorRight) continue
    if (bottom < actorTop || top > actorBottom) continue
    // An actor nearer the camera than this wall occludes it outright: the
    // character in front always wins, because a wall drawn above the 3D layer
    // covers EVERY actor in it.
    if (actor.tileX + actor.tileY > depth) return false
    // Behind or in the SAME cell: the wall covers the actor. Equal depth used to
    // keep the wall underneath, which is what put a character's upper body
    // through the wall standing in its own tile.
    hidesSomeone = true
  }
  return hidesSomeone
}

function renderSlot(slot: Slot, game: Game) {
  switch (slot.kind) {
    case 'actor':
      // A model in the 3D layer replaces this sprite; an empty group keeps the
      // slot's node mounted so the pool's reassignment never re-creates it.
      return hiddenActorSlots.has(slot) ? group({ children: [] }) : ActorSprite({ slot })
    case 'prop':
      return PropSprite({ slot, geometry: game.propGeometry })
    case 'loot':
      return LootSprite({ slot, geometry: game.lootGeometry })
    case 'float':
      return FloatText({ slot })
    case 'effect':
      return EffectRing({ slot })
  }
}

/** The floating thumbstick: a ring where the finger landed, and a knob. */
function Thumbstick(props: { game: Game }) {
  const hud = props.game.hud
  return (
    <group opacity={0.9}>
      <circle
        x={hud.stickOriginX}
        y={hud.stickOriginY}
        radius={48}
        stroke="rgba(226,214,186,0.5)"
        lineWidth={2}
        opacity={0.5}
      />
      <circle
        x={hud.stickOriginX}
        y={hud.stickOriginY}
        radius={14}
        fill="rgba(226,214,186,0.28)"
      />
      <circle
        x={() => hud.stickOriginX.value + hud.stickX.value}
        y={() => hud.stickOriginY.value + hud.stickY.value}
        radius={22}
        fill="rgba(255,236,196,0.42)"
        stroke="rgba(255,236,196,0.75)"
        lineWidth={2}
      />
    </group>
  )
}

/** The aim dot, pinned along the projected cast direction. */
function AimDot(props: { game: Game }) {
  const hud = props.game.hud
  return (
    <group>
      <circle
        x={hud.aimDotX}
        y={hud.aimDotY}
        radius={9}
        fill="rgba(255,171,46,0.35)"
        stroke="rgba(255,214,130,0.95)"
        lineWidth={2}
      />
      <circle x={hud.aimDotX} y={hud.aimDotY} radius={3} fill="#fff3cc" />
    </group>
  )
}

export interface AppProps extends HudProps {
  game: Game
}

// `com` must be called at module top level (vite-plugin-rasen's HMR contract).
const App = com((p: AppProps) => {
  const game = p.game
  /**
 * The overlay layers (roofs, and the 2D props that stand in FRONT of the 3D
 * actors) are absolutely positioned. Without this the canvas sits in normal
 * flow, which puts it a whole viewport BELOW the play surface — where `#app`'s
 * `overflow: hidden` clips it away, so roofs never appeared at all.
 */
const OVERLAY_LAYER_STYLE = { position: 'absolute', inset: '0px' } as const

  /**
   * The wall cells for one pass, re-read every frame.
   *
   * `over` picks the walls nearer the camera than a character — those draw ABOVE
   * the 3D layer; the rest stay under it. Together they tile the same world, so
   * a character is covered by the railings in front of them and visible over the
   * ones behind.
   */
  /**
   * One wall pass. BOTH passes are handed the SAME array, so `each` keeps every
   * node mounted for the life of the area and only its `visible` flips.
   *
   * Filtering per frame instead handed `each` a new array every tick; its key is
   * the item identity, so a wall that switched side was unmounted from one pass
   * and mounted in the other — which is what made walls flicker out of existence
   * while the player walked past.
   */
  const wallNodes = (over: boolean) =>
    each(map.wallCells, (cell: WallCell) => {
      const point = toScreen(cell.x, cell.y)
      return group({
        x: point.x - 80 + cell.art.frameX,
        y: point.y - 40 + cell.art.frameY,
        // `opacity` rather than a `visible` prop: the 2D group has none, and
        // hiding by opacity keeps the node mounted, which is the point.
        opacity: () => {
          actor3DTick.value
          return wallCoversActor(cell, actor3DActors()) === over ? 1 : 0
        },
        children: [
          imageNode({
            image: cell.art.canvas,
            x: 0,
            y: 0,
            width: cell.art.canvas.width,
            height: cell.art.canvas.height,
          }),
        ],
      })
    })

const map = game.map
  return (
    <div class="stage" style={{ position: 'absolute', inset: '0' }}>
      {/*
        Re-keyed on the viewport size, like the HUD: the canvas' drawing buffer
        is sized when it mounts, so a resize without a remount leaves the buffer
        at the old size while the camera centres on the NEW one — every layer
        then draws at the wrong offset. `viewportKey` hands out one object per
        size, so an unrelated redraw does not remount the scene.
      */}
      {each(viewportKey, (size: { width: number; height: number }) => (
        <canvas width={size.width} height={size.height}>
          {/* World space — everything inside moves with the camera. */}
          <group x={game.cameraX} y={game.cameraY}>
            <image
              image={map.ground}
              x={map.groundX}
              y={map.groundY}
              width={map.groundWidth}
              height={map.groundHeight}
            />
            {wallNodes(false)}
            {each(game.renderList, (slot: Slot) =>
              propStandsInFront(slot, actor3DActors()) ? group({ children: [] }) : renderSlot(slot, game),
            )}
          </group>

          {/* Screen space — these must not move with the camera. */}
          {Thumbstick({ game })}
          {AimDot({ game })}
        </canvas>
      ))}
      {/*
        The 3D actor layer: models whose feet land on the same diamonds the 2D
        projection draws, via an orthographic camera aligned to `toScreen` (see
        three-d/projection.ts). Mounted over the canvas and under the HUD. It
        deliberately draws every model over the whole scene — cross-layer depth
        (a model behind a wall tile) is wrong until the world itself is 3D.
        Roofs are the exception the game itself makes: they draw in their own
        pass ABOVE the actors, which is the canvas mounted below this one.

        The `actors` getter reads the frame tick first: every placement and
        visibility getter in the layer unrefs this prop, so the tick is what
        repaints the layer when only the actors move.
      */}
      {each(viewportKey, (size: { width: number; height: number }) =>
        Actor3DLayer({
          actors: () => {
            actor3DTick.value
            return actor3DActors()
          },
          camera: () => {
            const center = toWorld(size.width / 2 - game.cameraX.value, size.height / 2 - game.cameraY.value)
            return { x: center.x, y: center.y }
          },
          width: size.width,
          height: size.height,
        }),
      )}
      {/*
        The roof pass: the game draws roofs above the actors (a character walks
        under a roof), so the baked roof bitmap mounts here, over the 3D layer,
        at the same camera placement as the ground.
      */}
      <div style={OVERLAY_LAYER_STYLE}>
        {each(viewportKey, (size: { width: number; height: number }) => (
          <canvas width={size.width} height={size.height}>
            <group x={game.cameraX} y={game.cameraY}>
              {/* Walls nearer the camera than a character, then the roofs. */}
              {wallNodes(true)}
              {/*
                The props that stand in front of a 3D actor. The scene pass skips
                them (they belong above the models), so this pass has to draw
                them — leaving them out here removed them from the world.
              */}
              {each(game.renderList, (slot: Slot) =>
                propStandsInFront(slot, actor3DActors())
                  ? renderSlot(slot, game)
                  : group({ children: [] }),
              )}
              <image
                image={map.roof}
                x={map.groundX}
                y={map.groundY}
                width={map.groundWidth}
                height={map.groundHeight}
              />
            </group>
          </canvas>
        ))}
      </div>
      {/*
        The interface is re-keyed on the viewport size. Every panel and bar in it
        is placed by `resolveScreen` at `height / 2160` units, which is a plain
        read of the current size rather than a subscription — so without this the
        canvas would follow a resize and the buttons would stay at the old
        coordinates. `viewportKey` hands out one object per size, so an unrelated
        redraw never remounts the HUD.
      */}
      {each(viewportKey, () => Hud(p))}
    </div>
  )
})

export function createApp(props: AppProps) {
  return () => App(props)
}

export type { HudProps }
