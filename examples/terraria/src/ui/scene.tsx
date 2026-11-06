/**
 * The scene tree — one JSX tree holding the canvas world *and* the DOM interface.
 *
 * Layers, back to front:
 *
 *   1. `skyLayer` and `parallaxLayer` — screen space, so they never pan. The hills
 *      divide the camera position by a depth factor, which is what makes them read
 *      as distance.
 *   2. the camera `group`: the baked tile layer, the cursor highlight, every entity.
 *   3. `lightingLayer` — **in screen space and after the world**, because it
 *      multiplies over what has already been drawn.
 *   4. the canvas HUD, which must not move with the camera.
 *   5. the DOM overlay.
 *
 * Three things here are load-bearing, and all three are structural:
 *
 * **The camera is a `group`, not a renderer feature.** `@rasenjs/canvas-2d` has no
 * camera on purpose; pan and zoom are a transform on an ancestor, and every
 * descendant inherits them without knowing. The group boundary is therefore the
 * only thing that decides whether a node's coordinates are world or screen.
 *
 * **The depth sort already happened.** `world.slots` arrives culled and ordered,
 * and `each` reproduces that order. Nothing in this file sorts anything.
 *
 * **The HUD is a sibling of the world, not a child.** Both the canvas HUD and the
 * DOM panels live outside the camera group, so neither can inherit the world
 * transform by accident.
 */

import { com, each, match, toValue, when, type Mountable, type PropValue } from '@rasenjs/core'
import { circle, group, polygon, rect, sprite, text } from '@rasenjs/canvas-2d'
import type { CanvasNode } from '@rasenjs/canvas-2d'
import { LIGHT_SCALE } from '../core/constants'
import type { RenderSlot, World } from '../core/world'
import {
  cloudLayer,
  lightingLayer,
  parallaxLayer,
  skyLayer,
  tileHighlight,
  tileLayer,
} from '../render/nodes'
import type { ChunkBaker } from '../render/bake'
import { ATLAS_COLUMNS, itemFrame, type TileAtlas } from '../render/atlas'
import { HudCanvasLayer } from './hud-canvas'
import { HudDomLayer } from './hud-dom'
import { PALETTE, rgba } from './kit'

export interface SceneProps {
  readonly world: World
  readonly baker: ChunkBaker
  readonly atlas: TileAtlas
  readonly lightmap: HTMLCanvasElement
}

/**
 * The shared atlas, and a component that cuts one icon out of it.
 *
 * The atlas is a page-wide resource registered before mount, so reading it inside a
 * component is a lookup rather than an argument threaded through every actor. The same
 * reasoning as `useCanvasAtlas` in the widget host — one sheet, one place it is known.
 */
let atlasRef: TileAtlas | null = null

export function useSceneAtlas(value: TileAtlas): void {
  atlasRef = value
}

function activeAtlas(): TileAtlas {
  if (!atlasRef) throw new Error('scene atlas not registered; call useSceneAtlas first')
  return atlasRef
}

export interface AtlasIconProps {
  /** Item id, or −1 for nothing. Reactive so a held tool can change. */
  item: PropValue<number>
  x: number
  y: number
  size: number
  /** −1 mirrors the icon, for a tool held in the other hand. */
  flip?: PropValue<number>
}

/**
 * One icon cut from the shared atlas.
 *
 * `com`-wrapped because `sprite` is a component and this is a component: a plain
 * function returning JSX would be React's model, where the return value is diffed.
 * In Rasen a component *is* its mount function — `com` gives it an effect scope and
 * `Mountable` is what the parent mounts. Returning a tree from a helper is only legal
 * when the helper is itself a component.
 */
export const AtlasIcon = com((props: AtlasIconProps) => {
  const atlas = activeAtlas()
  return sprite({
    image: atlas.canvas,
    x: props.x,
    y: props.y,
    frameWidth: atlas.cell,
    frameHeight: atlas.cell,
    columns: ATLAS_COLUMNS,
    // `frame` is the reactive part: it is what changes when the held item changes.
    frame: () => {
      const item = toValue(props.item)
      return item < 0 ? 0 : itemFrame(item)
    },
    width: props.size,
    height: props.size,
    scaleX: props.flip === undefined ? 1 : () => toValue(props.flip as PropValue<number>),
  })
})

export interface HeldToolProps {
  /** Item id in hand, −1 for empty. */
  readonly item: PropValue<number>
  readonly facing: PropValue<number>
  /** 1 → still, 0 → finished; the arc runs as this falls. */
  readonly swing: PropValue<number>
  readonly swingDir: PropValue<number>
}

/**
 * The tool in the player's hand, rotated by the swing.
 *
 * `swing` runs 1 → 0 across a use, so the arc is −60° → +60° about the shoulder.
 * Rotating about the hand end rather than the sprite's centre is what makes it read as
 * a swing instead of as a spinning item.
 *
 * The whole component is inside a `when`, so an empty hand costs nothing — not a
 * hidden node with zero size, no node at all.
 */
export const HeldTool = com((props: HeldToolProps) => {
  const angle = (): number => (1 - toValue(props.swing)) * 2.1 - 1.05
  const dir = (): number => toValue(props.swingDir) || toValue(props.facing)

  return when({
    condition: () => toValue(props.item) >= 0,
    then: () =>
      group({
        x: 0,
        y: -1,
        children: [
          rect({
            x: () => (dir() > 0 ? 2 : -14),
            y: -2,
            width: 12,
            height: 3,
            fill: rgba(150, 110, 70, 1),
            cornerRadius: 1,
            rotation: () => (dir() > 0 ? angle() : -angle()),
            // The pivot is the hand end, so the tool swings from the shoulder.
            offsetX: () => (dir() > 0 ? -6 : 6),
          }),
          AtlasIcon({
            item: props.item,
            x: 0,
            y: -16,
            size: 14,
            flip: () => dir(),
          }),
        ] as Array<Mountable<CanvasNode>>,
      }),
  })
})

export interface HealthBarProps {
  /** 0..1. */
  readonly hp: PropValue<number>
  readonly width: number
  /** Offset upward from the actor's centre. */
  readonly lift: number
}

/**
 * A health bar over a wounded enemy.
 *
 * Wrapped in `when`, so a creature at full health mounts no nodes at all. This is the
 * concrete payoff of Rasen's model over "always mount it and drive it with opacity":
 * a screen of twenty untouched slimes costs zero extra nodes, and the bar appears the
 * moment it has something to say.
 */
export const EnemyHealthBar = com((props: HealthBarProps) => {
  return when({
    condition: () => toValue(props.hp) < 0.999,
    then: () =>
      group({
        x: -props.width / 2,
        y: props.lift,
        children: [
          rect({ x: 0, y: 0, width: props.width, height: 3, fill: rgba(10, 10, 14, 0.8) }),
          rect({
            x: 0,
            y: 0,
            width: () => props.width * Math.max(0, toValue(props.hp)),
            height: 3,
            fill: () => (toValue(props.hp) < 0.35 ? rgba(226, 96, 84, 1) : rgba(198, 52, 44, 1)),
          }),
        ] as Array<Mountable<CanvasNode>>,
      }),
  })
})

// ---------------------------------------------------------------------------
// Actor components
// ---------------------------------------------------------------------------

export interface PlayerSpriteProps {
  readonly slot: RenderSlot
}

/** The hero. Parts animate independently, so a walk-and-swing reads correctly. */
export const PlayerSprite = com((props: PlayerSpriteProps) => {
  const s = props.slot
  // A damaged player blinks, which is the standard cue for both "you are hurt" and
  // "you are briefly invulnerable".
  const flash = (): number => (s.hurt > 0.5 ? 1 : 0)
  const lean = (): number => s.facing * 0.6

  return group({
    x: s.x,
    y: s.y,
    opacity: s.opacity,
    children: [
      rect({ x: -4, y: 6, width: 3, height: 6, fill: rgba(46, 54, 78, 1) }),
      rect({ x: 1, y: 6, width: 3, height: 6, fill: rgba(38, 44, 66, 1) }),
      rect({
        x: -5,
        y: -3,
        width: 10,
        height: 12,
        fill: () => (flash() ? rgba(255, 220, 220, 1) : rgba(196, 92, 68, 1)),
        cornerRadius: 2,
      }),
      // The pack rides on the side the character faces away from.
      rect({
        x: () => -8 * s.facing,
        y: -2,
        width: 4,
        height: 8,
        fill: rgba(96, 72, 52, 1),
      }),
      circle({
        x: () => lean(),
        y: -8,
        radius: 4.5,
        fill: () => (flash() ? rgba(255, 235, 235, 1) : rgba(228, 186, 148, 1)),
      }),
      rect({
        x: () => lean() - 4.5 + (s.facing > 0 ? -0.5 : 1.5),
        y: -12.5,
        width: 8,
        height: 4,
        fill: rgba(58, 42, 34, 1),
        cornerRadius: 2,
      }),
      circle({
        x: () => lean() + s.facing * 1.6,
        y: -7.6,
        radius: 1,
        fill: rgba(30, 26, 30, 1),
      }),
      HeldTool({
        item: s.tool,
        facing: s.facing,
        swing: s.swing,
        swingDir: s.swingDir,
      }),
    ] as Array<Mountable<CanvasNode>>,
  })
})

/** A hopping slime. Squashes through its hop, goes pale on a hit. */
export const SlimeSprite = com((props: PlayerSpriteProps) => {
  const s = props.slot
  const squash = (): number => 1 - s.swing * 0.22
  const body = (): string =>
    s.hurt > 0.5 ? rgba(255, 240, 245, 0.95) : rgba(96, 190, 148, 0.86)
  const r = s.size / 2

  return group({
    x: s.x,
    y: s.y,
    children: [
      circle({ x: 0, y: 0, radius: r, fill: body, scaleY: () => 0.7 * squash() }),
      circle({
        x: -r * 0.16,
        y: -r * 0.12,
        radius: r * 0.16,
        fill: rgba(196, 248, 220, 0.5),
      }),
      // The eyes track facing, which is the only thing that makes a blob read as a
      // creature rather than as scenery.
      circle({
        x: () => -r * 0.16 + s.facing * 1.5,
        y: 0,
        radius: 1.7,
        fill: rgba(22, 40, 34, 1),
      }),
      circle({
        x: () => r * 0.16 + s.facing * 1.5,
        y: 0,
        radius: 1.7,
        fill: rgba(22, 40, 34, 1),
      }),
      EnemyHealthBar({ hp: s.hp, width: r * 1.8, lift: -r - 7 }),
    ] as Array<Mountable<CanvasNode>>,
  })
})

/** A cave bat. The wing angle is driven by `swing`, which the AI pulses per hop. */
export const BatSprite = com((props: PlayerSpriteProps) => {
  const s = props.slot
  const flap = (): number => Math.sin(s.swing * Math.PI * 2) * 4
  const body = (): string =>
    s.hurt > 0.5 ? rgba(255, 240, 245, 1) : rgba(96, 74, 112, 1)

  return group({
    x: s.x,
    y: s.y,
    children: [
      polygon({
        x: 0,
        y: 0,
        // Flat [x, y, x, y, …] — see `PolygonProps.points`.
        points: [-5, -3, 5, -3, 6, 3, -6, 3],
        fill: body,
      }),
      polygon({
        x: () => (s.facing > 0 ? -4 : 4),
        y: 0,
        points: [
          0,
          -2,
          s.facing > 0 ? -9 : 9,
          () => -4 + flap(),
          s.facing > 0 ? -8 : 8,
          () => 2 + flap(),
          0,
          2,
        ] as never,
        fill: rgba(74, 56, 88, 0.9),
      }),
      polygon({
        x: () => (s.facing > 0 ? 4 : -4),
        y: 0,
        points: [
          0,
          -2,
          s.facing > 0 ? 9 : -9,
          () => -4 + flap(),
          s.facing > 0 ? 8 : -8,
          () => 2 + flap(),
          0,
          2,
        ] as never,
        fill: rgba(74, 56, 88, 0.9),
      }),
      circle({ x: () => s.facing * 2, y: -1, radius: 0.9, fill: rgba(240, 200, 120, 1) }),
      EnemyHealthBar({ hp: s.hp, width: 16, lift: -10 }),
    ] as Array<Mountable<CanvasNode>>,
  })
})

/** A dropped item, bobbing. `slot.text` carries the item id. */
export const DropSprite = com((props: PlayerSpriteProps) => {
  const s = props.slot
  return group({
    x: s.x,
    y: s.y,
    opacity: s.opacity,
    children: [
      AtlasIcon({
        item: Number(s.text),
        x: -5,
        // A gentle bob so drops read as items rather than as debris.
        y: -5 + Math.sin(s.age * 6) * 1.4,
        size: 10,
      }),
    ] as Array<Mountable<CanvasNode>>,
  })
})

/** One particle. A square, because at this size a sprite would be a waste. */
export const ParticleSprite = com((props: PlayerSpriteProps) => {
  const s = props.slot
  return rect({
    x: s.x - s.size / 2,
    y: s.y - s.size / 2,
    width: s.size,
    height: s.size,
    fill: s.text,
    opacity: s.opacity,
  })
})

/** A floating number: damage dealt, ore collected. */
export const FloatLabel = com((props: PlayerSpriteProps) => {
  const s = props.slot
  return text({
    text: s.text,
    x: s.x,
    y: s.y,
    fill: 'rgba(236,240,250,0.95)',
    font: `bold ${s.size}px system-ui, sans-serif`,
    textAlign: 'center',
    textBaseline: 'middle',
    opacity: s.opacity,
    // A dark halo keeps a damage number readable over any terrain. One node instead
    // of the four a crisp outline would need.
    shadowColor: 'rgba(0,0,0,0.85)',
    shadowBlur: 3,
  })
})

/**
 * The dispatcher.
 *
 * `match` rather than a `switch` in a helper, because a helper that *returned* a tree
 * would be a React component. `match` is the control-flow component: it owns the
 * branch swap, tears the old branch down through the effect scope, and re-mounts only
 * when the discriminating value actually changes.
 *
 * `value` is a getter over `slot.kind`, and a slot's `kind` never changes for the life
 * of a slot — so `match` mounts one branch, once, and never swaps. The cost is a single
 * string comparison per slot per mount, which is what the framework is designed for.
 */
export const Entity = com((props: PlayerSpriteProps) => {
  return match({
    value: () => props.slot.kind,
    cases: {
      player: () => PlayerSprite({ slot: props.slot }),
      enemy: () =>
        match({
          value: () => props.slot.sprite,
          cases: {
            slime: () => SlimeSprite({ slot: props.slot }),
            bat: () => BatSprite({ slot: props.slot }),
          },
          default: () => SlimeSprite({ slot: props.slot }),
        }),
      drop: () => DropSprite({ slot: props.slot }),
      particle: () => ParticleSprite({ slot: props.slot }),
      label: () => FloatLabel({ slot: props.slot }),
    },
    default: () => FloatLabel({ slot: props.slot }),
  })
})

export const Scene = com((props: SceneProps) => {
  const { world, baker, atlas, lightmap } = props

  // Phase 1 is the destructuring above; what comes back is phase 2 — the JSX
  // element *is* the mountable, so returning it rather than a thunk is what makes
  // `com` hand it to `mount` with a host. Wrapping it in `() => …` would make `com`
  // treat the thunk as the mount function and the element as its unmount.
  //
  // The helpers below are plain functions returning `Mountable<CanvasNode>`, so
  // they need no cast. Only `each` does, because it is generic over an unknown node
  // type.
  return (
    <div class="stage">
      <div class="viewport" id="terraria-viewport">
        <canvas
          width={() => world.viewWidth.value}
          height={() => world.viewHeight.value}
          contextType="2d"
        >
          {/* ---- screen space: sky and distance ---- */}
          {skyLayer({
            width: world.viewWidth,
            height: world.viewHeight,
            timeOfDay: world.timeOfDay,
          })}
          {cloudLayer({
            camLeft: world.camLeft,
            width: world.viewWidth,
            height: world.viewHeight,
            timeOfDay: world.timeOfDay,
            // The cloud band hangs above the horizon, and the horizon is where the
            // surface is — not a fixed screen fraction — so the sky reads correctly
            // when the camera is deep underground.
            horizon: () => world.horizonScreenY,
          })}
          {parallaxLayer({
            camLeft: world.camLeft,
            width: world.viewWidth,
            height: world.viewHeight,
            timeOfDay: world.timeOfDay,
            horizon: () => world.horizonScreenY,
          })}

          {/* ---- world space ---- */}
          {group({
            x: () => -world.camLeft.value,
            y: () => -world.camTop.value,
            children: [
              tileLayer({
                baker,
                visible: world.visibleChunks,
                revision: world.worldRevision,
              }),
              tileHighlight({
                tileX: () => world.hoverTile.value?.x ?? null,
                tileY: () => world.hoverTile.value?.y ?? null,
                color: () => (world.mining ? PALETTE.danger : PALETTE.accent),
                active: world.mining,
              }),
              // Depth order comes from the simulation; `each` reproduces it. The
              // cast is because `each` is generic over a node type that cannot be
              // inferred through this call shape.
              each(world.slots, (slot: RenderSlot) => Entity({ slot })) as unknown as Mountable<CanvasNode>,
            ] as unknown as Array<Mountable<CanvasNode>>,
          })}

          {/* ---- screen space: lighting multiplies over the world ---- */}
          {lightingLayer({
            lightmap,
            revision: world.lightRevision,
            camLeft: world.camLeft,
            camTop: world.camTop,
            viewWidth: world.viewWidth,
            viewHeight: world.viewHeight,
            zoom: world.camZoom,
            pixelsPerTile: LIGHT_SCALE,
          })}

          {/* ---- screen space: the canvas half of the interface ---- */}
          {HudCanvasLayer({ world, atlas })}
        </canvas>
      </div>

      {/* ---- the DOM half of the interface ---- */}
      {HudDomLayer({ world, atlas })}
    </div>
  )
})
