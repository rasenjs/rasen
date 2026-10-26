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

import { com, each, unref } from '@rasenjs/core'
import { group } from '@rasenjs/canvas-2d'
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
import { Actor3DLayer } from './three-d/actor-layer'
import { actor3DActors, actor3DTick, hiddenActorSlots } from './three-d/game-actors'
import { propArt, wallArt } from './three-d/world-quads'
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

function renderSlot(slot: Slot, game: Game) {
  switch (slot.kind) {
    case 'actor':
      // A model in the 3D layer replaces this sprite; an empty group keeps the
      // slot's node mounted so the pool's reassignment never re-creates it.
      return hiddenActorSlots.has(slot) ? group({ children: [] }) : ActorSprite({ slot })
    case 'prop':
      // Props are drawn by the 3D layer (`propArt`), which needs the depth
      // buffer to put them in front of or behind a character correctly. An
      // empty group keeps the slot mounted for when it becomes active again.
      return group({ children: [] })
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
            {each(game.renderList, (slot: Slot) => renderSlot(slot, game))}
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
          // The world's flat art shares this canvas' depth buffer with the
          // models, so walls and props occlude per pixel instead of by guess.
          art: () => [
            ...wallArt(map.wallCells),
            ...propArt(
              unref(game.renderList).filter((slot): slot is PropSlot => slot.kind === 'prop'),
              game.propGeometry,
            ),
          ],
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
              {/* An array, because the JSX types want `Mountable[]` and this
                  pass has exactly one child left. */}
              {[
                <image
                  image={map.roof}
                  x={map.groundX}
                  y={map.groundY}
                  width={map.groundWidth}
                  height={map.groundHeight}
                />,
              ]}
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
