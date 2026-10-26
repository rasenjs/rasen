/**
 * `<Actor3DLayer>` — the 3D actor layer: a transparent `@rasenjs/gfx` canvas
 * whose orthographic camera aligns EXACTLY with the game's 2:1 isometric 2D
 * projection (see `./projection.ts` for the math), with one textured model
 * group per actor.
 *
 * Layering contract: mount this OVER the game's 2D canvas. Its `camera` prop
 * is the same pan the 2D camera uses (`{ x, y }` = the tile point that lands
 * at the canvas center), so a model's feet land exactly on the diamond the 2D
 * layer draws for its tile — the two layers share one projection by
 * construction, not by coincidence.
 *
 * Bind pose by default; skeletal playback is opt-in per actor: when an actor
 * carries `animation: { name, time }`, the layer CPU-skins its parts on every
 * redraw (`./skinning.ts`) against the character's staged skeleton + clip set
 * instead of submitting the bind pose. Frames are driven by the host's own
 * redraw tick (the game loop bumps `actor3DTick`; the actor lab runs its own
 * timer when `?anim=` is set) — the layer itself never schedules timers.
 * Models and rigs decode at runtime from the staged `.model` / `.skeleton` /
 * `.animations` samples via `./model.ts` and `./skinning.ts` and are cached
 * module-globally, so re-renders and slider changes re-submit geometry
 * without re-decoding.
 *
 * Rasen JSX pitfalls respected here: non-trivial props are bound to consts
 * first (the compiler wraps member/call-expression props in getters), and the
 * `style`/`renderOptions`/`contextOptions` props are plain object literals.
 */

import type { PropValue } from '@rasenjs/core'
import { group, type CameraConfig } from '@rasenjs/gfx'
import { ref } from '@rasenjs/reactive-signals'
import { unref } from '@rasenjs/gfx'
import { Gr2Model, loadModelParts, type LoadedModel, type PartSpec } from './model'
import { TILE_HEIGHT, TILE_WIDTH } from '../iso'
import { ActorShadow } from './actor-shadow'
import { mergeOutlines } from './ground-outline'
import type { GroundOutline, MergedOutline } from './ground-outline'
import {
  bindingScratchFor,
  computeBonePose,
  computeBonePoseBlended,
  loadAnimationRig,
  skinPartWithRigInto,
  type AnimationRig,
  type BindingScratch,
} from './skinning'
import type { AnimFade } from './anim-state'
import { WallQuads } from './wall-quads'
import type { WallCell } from '../world'
import {
  ACTOR_CAMERA_DIST,
  MODEL_UNITS_PER_TILE,
  actorCamera,
  modelToTransform,
  type ModelPlacement,
} from './projection'

/** One actor: a model placed at a tile, facing a world angle. */
export interface Actor3D {
  id: string
  /** A {@link MODEL_SOURCES} id from `./model.ts`, e.g. 'amazon-torso'. */
  modelKey: string
  /** World X of the tile the model's feet stand on (tiles). */
  tileX: number
  /** World Z of the tile the model's feet stand on (tiles). */
  tileY: number
  /** World angle in radians — the game's facing convention (`./projection.ts`). */
  facing: number
  /**
   * Draw the model. Re-read every redraw, so a pool entry can be parked
   * without moving it off-screen. Defaults to true.
   */
  visible?: boolean
  /**
   * Placement scale multiplier (`PropPlacement.scale` for props; characters
   * are 1). The projection's own units-per-tile scale applies on top.
   */
  scale?: number
  /**
   * Optional skeletal playback: a clip name from the character's clip set
   * (`combined.animations` — e.g. diablo `walk`/`attack1`, amazon
   * `1hs_walk`) and its sample time in SECONDS. When present the layer skins
   * the actor's parts every redraw; absent (the default) it submits the bind
   * pose. A name that is not in the set falls back to bind pose.
   *
   * `fade` carries the clip being crossfaded OUT (`./anim-state.ts`'s state
   * machine produces it): the two poses blend per bone over the retail 0.2 s
   * transition, `fade.alpha` 0 → 1.
   */
  animation?: { name: string; time: number; fade?: AnimFade | null }
}

export interface Actor3DLayerProps {
  /**
   * Actors to place. The list is bound at mount (one model group per actor);
   * each actor's `tileX`/`tileY`/`facing` is re-read every redraw, so plain
   * arrays, refs and getters all work — even a replaced array of the same
   * length is followed by index.
   */
  actors: PropValue<Actor3D[]>
  /** World pan: the tile point (tiles) that lands at the canvas center. */
  camera: PropValue<{ x: number; y: number }>
  /**
   * The world's wall cells, drawn as depth-tested quads in THIS canvas.
   *
   * They must share the canvas with the models: two canvases have one ordering
   * between them, so a wall could never be interleaved with a character per
   * pixel. That interleaving is the whole reason they moved here.
   */
  walls?: PropValue<readonly WallCell[]>
  /** Logical canvas width in px. */
  width: PropValue<number>
  /** Logical canvas height in px. */
  height: PropValue<number>
  /**
   * Optional model-units-per-tile override (the actor lab's calibration
   * slider). Defaults to {@link MODEL_UNITS_PER_TILE}; re-read every redraw.
   */
  unitsPerTile?: PropValue<number>
}

/** The layer container: an absolutely positioned anchor for the overlay canvas. */
const LAYER_STYLE = {
  position: 'absolute',
  left: '0px',
  top: '0px',
}

/**
 * Transparent overlay canvas. (The wrapper `div` matters: the rasen compiler
 * serializes a ROOT component tag like `<canvas>` to `canvas({ children:
 * <>{kids}</> })`, handing the canvas a Fragment mountable where the host
 * expects a children array. Nested inside a host element the JSX stays on the
 * standard runtime path, which normalizes children — the same shape
 * `gr2-lab.tsx` renders.)
 */
const CANVAS_STYLE = {
  display: 'block',
  'pointer-events': 'none',
}

const RENDER_OPTIONS = { clearColor: '#00000000' }

const CONTEXT_OPTIONS = { alpha: true, preserveDrawingBuffer: true }

/** Wrap a playback clock into the clip's own `[0, duration)` range. */
function loopedTime(rig: AnimationRig, name: string, t: number): number {
  const clip = rig.animations.get(name)
  return clip !== undefined && clip.duration > 0 ? t % clip.duration : t
}

/**
 * The group an actor id belongs to: the id's prefix without the part name
 * ('hero:amazon-head' → 'hero', 'monster:skeleton:0:head' → 'monster:skeleton:0').
 *
 * A pure function of the id, so it is computed once per pool entry rather than
 * per comparison (see the note at its use site).
 */
export function groupOfId(id: string): string {
  const parts = id.split(':')
  if (parts[0] === 'hero') return 'hero'
  if (parts[0] === 'monster') return parts.slice(0, 3).join(':')
  if (parts[0] === 'npc') return parts.slice(0, 3).join(':')
  return id
}

export function Actor3DLayer(props: Actor3DLayerProps) {
  // Bind the non-trivial props to consts first (JSX getter-wrapping pitfall).
  const width = props.width
  const height = props.height
  const style = CANVAS_STYLE
  const renderOptions = RENDER_OPTIONS
  const contextOptions = CONTEXT_OPTIONS

  const initialActors = unref(props.actors)

  // One parts ref per actor; the cached loader fills it once, and setting the
  // ref marks the model element dirty (its deps watch the parts array). The
  // full loaded model and the character's animation rig are kept alongside so
  // the per-redraw parts getter can skin from them.
  const partsRefs = initialActors.map(() => ref<PartSpec[]>([]))
  const models: (LoadedModel | null | undefined)[] = initialActors.map(() => undefined)
  const rigs: (AnimationRig | null | undefined)[] = initialActors.map(() => undefined)
  initialActors.forEach((actor, index) => {
    void loadModelParts(actor.modelKey).then((loaded) => {
      models[index] = loaded
      partsRefs[index].value = loaded === null ? [] : loaded.parts
      // The parts' bounds are what the shadow's radius comes from, so a model
      // landing invalidates the memoized group width.
      groupWidths.clear()
    })
    void loadAnimationRig(actor.modelKey).then((rig) => {
      rigs[index] = rig
    })
  })

  // Per-actor parts: bind pose by default, CPU-skinned when the actor carries
  // an `animation`. The getter reads `props.actors` first, which is where the
  // host's frame tick enters (the game's `actor3DTick`, the lab's timer), so
  // every frame both re-reads the clip time and repaints. A one-slot cache
  // keyed by (clip, time) lets the element's dependency evaluation and its
  // draw share a single skin pass per frame.
  const skinCache = new Map<number, { key: string; parts: PartSpec[] }>()

  // The per-part skinning buffers, kept between frames so a frame's skinning
  // allocates nothing. Two kinds: the GEOMETRY the skin pass writes
  // (`SkinScratch`) and the per-binding MATRICES it reads (`BindingScratch`).
  //
  // They are keyed by ACTOR, not by part: two actors of the same kind share
  // the very same `PartSpec` objects (the model cache is keyed by model), so a
  // buffer shared per part would have one actor's pose overwrite another's.
  // Each actor gets its own set, sized once and rewritten every frame.
  interface PartBuffers {
    /** This actor's own copy of the skinned vertices — two actors can share one
     * mesh, so the outputs cannot live on the mesh. */
    out: { skin: Float32Array; vertices: Float32Array; normals: Float32Array; tangents?: Float32Array }
    bindings: BindingScratch
  }
  const partBuffers = new Map<number, PartBuffers[]>()
  const buffersFor = (index: number, part: PartSpec): PartBuffers => {
    let perActor = partBuffers.get(index)
    if (perActor === undefined) {
      perActor = []
      partBuffers.set(index, perActor)
    }
    const partIndex = models[index]?.parts.indexOf(part) ?? -1
    const existing = partIndex >= 0 ? perActor[partIndex] : undefined
    if (existing !== undefined) return existing
    const bindings = part.boneBindings ?? []
    const buffers: PartBuffers = {
      out: {
        skin: new Float32Array(bindings.length * 16),
        vertices: new Float32Array(part.vertices.length),
        normals: new Float32Array(part.normals.length),
        ...(part.tangents ? { tangents: new Float32Array(part.tangents.length) } : {}),
      },
      bindings: bindingScratchFor(bindings),
    }
    if (partIndex >= 0) perActor[partIndex] = buffers
    return buffers
  }

  const partsFor = (index: number): PartSpec[] => {
    const list = unref(props.actors)
    const current = list[index] ?? initialActors[index]
    const bindParts = partsRefs[index].value
    const animation = current.animation
    const rig = rigs[index]
    const loaded = models[index]
    if (animation === undefined || rig === null || rig === undefined || loaded === null || loaded === undefined) {
      return bindParts
    }
    if (current.visible === false) return bindParts
    // Off-screen actors are not skinned at all. Skinning is the frame's largest
    // JS cost and a model outside the view draws nothing, so the pose it would
    // have had is not observable; it is recomputed the moment it comes back.
    const cam = unref(props.camera)
    const cullRadius =
      ((unref(props.width) ?? 0) / TILE_WIDTH + (unref(props.height) ?? 0) / TILE_HEIGHT) / 2 + 4
    if (Math.max(Math.abs(current.tileX - cam.x), Math.abs(current.tileY - cam.y)) > cullRadius) {
      return bindParts
    }
    const tracks = rig.tracksFor(animation.name)
    if (tracks === null) return bindParts
    const fade = animation.fade
    const key =
      `${animation.name}\u0000${animation.time}\u0000` +
      (fade === null || fade === undefined ? '' : `${fade.name}\u0000${fade.time}\u0000${fade.alpha}`)
    const cached = skinCache.get(index)
    if (cached !== undefined && cached.key === key) return cached.parts
    // Loop the clip: evaluation clamps outside [0, duration), so an un-wrapped
    // clock freezes the model on the clip's last frame ("a statue sliding
    // across the map"). The duration is the retail clip's own.
    const time = loopedTime(rig, animation.name, animation.time)
    let boneWorlds: Float32Array
    if (fade !== null && fade !== undefined && fade.alpha < 1) {
      // Crossfade: blend the outgoing clip's pose in per bone. alpha 0 is all
      // old pose, 1 all new (alpha >= 1 simply skips the blend).
      //
      // The blend evaluates BOTH poses itself, so the plain pose is NOT
      // computed here as well — it would be thrown away, and evaluating a
      // clip's tracks is a third of the animation cost.
      const fadeTracks = rig.tracksFor(fade.name)
      boneWorlds =
        fadeTracks === null
          ? computeBonePose(rig.skeleton, tracks, time)
          : computeBonePoseBlended(
              rig.skeleton,
              fadeTracks,
              loopedTime(rig, fade.name, fade.time),
              tracks,
              time,
              fade.alpha,
            )
    } else {
      boneWorlds = computeBonePose(rig.skeleton, tracks, time)
    }
    const parts = loaded.parts.map((part) => {
      const buffers = buffersFor(index, part)
      return skinPartWithRigInto(part, rig, boneWorlds, buffers.out, buffers.bindings)
    })
    skinCache.set(index, { key, parts })
    return parts
  }

  // The group an actor belongs to: the id's prefix without the part name
  // ('hero:amazon-head' → 'hero', 'monster:skeleton:0:head' → 'monster:skeleton:0').
  //
  // The pool is FIXED (its length never changes) and an entry's id never
  // changes, so the group of an index is a CONSTANT. Deriving it per call made
  // the two group scans below quadratic in the pool size, and every comparison
  // split the id string — the profile put `groupWidth` alone at 28% of the
  // frame. The groups are computed once, here.
  const groupIds: string[] = initialActors.map((actor) => groupOfId(actor.id))

  /**
   * The group's width in model units — the shadow's radius comes from it.
   *
   * The width is the union of the group's parts' X bounds, and the parts'
   * bounds only arrive when their model finishes loading. The union is
   * therefore memoized per group and recomputed only when a model lands.
   */
  const groupWidths = new Map<string, number>()
  const groupWidth = (index: number): number => {
    const group = groupIds[index]
    const cached = groupWidths.get(group)
    if (cached !== undefined) return cached
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < groupIds.length; i += 1) {
      if (groupIds[i] !== group) continue
      const bounds = models[i]?.bounds
      if (bounds === undefined) continue
      min = Math.min(min, bounds.minX)
      max = Math.max(max, bounds.maxX)
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0
    const width = Math.max(0.2, (max - min) / 2)
    groupWidths.set(group, width)
    return width
  }

  /**
   * The group's merged silhouette, for its one shadow.
   *
   * Rebuilt when a model lands (the parts' outlines only exist once loaded) and
   * reused otherwise, so the per-frame cost is a map lookup rather than a hull.
   */
  const groupOutlines = new Map<string, MergedOutline | null>()
  const groupOutline = (index: number): MergedOutline | null => {
    const group = groupIds[index]
    const cached = groupOutlines.get(group)
    if (cached !== undefined) return cached
    const outlines: GroundOutline[] = []
    for (let i = 0; i < groupIds.length; i += 1) {
      if (groupIds[i] !== group) continue
      const parts = models[i]?.parts
      if (parts === undefined) continue
      for (const part of parts) {
        if (part.groundOutline !== undefined) outlines.push(part.groundOutline)
      }
    }
    if (outlines.length === 0) return null
    const merged = mergeOutlines(outlines)
    // Freeze the result: `mergeOutlines` reuses one scratch buffer, and this
    // group's outline outlives the call.
    const copy: MergedOutline = { points: merged.points.slice(0, merged.count * 2), count: merged.count, top: merged.top }
    groupOutlines.set(group, copy)
    return copy
  }

  /** Whether the actor is the first of its group (the one that draws the shadow). */
  const isGroupLead = (index: number): boolean => {
    const group = groupIds[index]
    for (let i = 0; i < index; i += 1) {
      if (groupIds[i] === group) return false
    }
    return true
  }

  // Camera getter: re-read on the host's camera watch (refs inside → reactive
  // pan/resize), so the 3D camera always matches the 2D layer's pan.
  const camera = (): CameraConfig => {
    const cam = unref(props.camera)
    return actorCamera(
      { x: cam.x, y: 0, z: cam.y },
      ACTOR_CAMERA_DIST,
      unref(width),
      unref(height),
    )
  }

  // One transform group per actor. Every field is a getter so the placement
  // re-evaluates per redraw: the group's own deps track those reads, which is
  // what repaints the layer when the calibration slider moves.
  const children = initialActors.map((actor, index) => {
    // The placement, memoized on its inputs. The group's own props read it
    // eight times per redraw (x, y, z, rotationY, three scales) and the
    // shadow and the model read it again, and every read of
    // `props.actors` is a signal read — the reactive machinery was 10% of the
    // frame on its own. The transform only changes when the actor moves or
    // turns, so it is recomputed only then.
    let placementKey = ''
    let placementValue: ModelPlacement = modelToTransform(0, 0, 0, MODEL_UNITS_PER_TILE, 1)
    const placement = (): ModelPlacement => {
      const list = unref(props.actors)
      const current = list[index] ?? actor
      const unitsPerTile = unref(props.unitsPerTile) ?? MODEL_UNITS_PER_TILE
      const scale = current.scale ?? 1
      const key = `${current.tileX}|${current.tileY}|${current.facing}|${unitsPerTile}|${scale}`
      if (key !== placementKey) {
        placementKey = key
        const placement = modelToTransform(
          current.tileX,
          current.tileY,
          current.facing,
          unitsPerTile,
          scale,
        )
        // An object model's ORIGIN is not its footprint centre (characters'
        // is: their origin is between their feet). Standing the raw origin on
        // the cell centre therefore pushes every prop half a footprint off its
        // own tile -- the "the items are offset, not the map" symptom. Centre
        // the model's own bounds on the cell instead.
        const bounds = models[index]?.bounds
        if (actor.id.startsWith('prop:') && bounds !== undefined) {
          placement.x -= ((bounds.minX + bounds.maxX) / 2) * placement.scale
          placement.z -= ((bounds.minZ + bounds.maxZ) / 2) * placement.scale
        }
        placementValue = placement
      }
      return placementValue
    }
    return group({
      x: () => placement().x,
      y: () => placement().y,
      z: () => placement().z,
      rotationY: () => placement().rotationY,
      scaleX: () => placement().scale,
      scaleY: () => placement().scale,
      scaleZ: () => placement().scale,
      visible: () => {
        const list = unref(props.actors)
        return (list[index] ?? actor).visible ?? true
      },
      children: [
        // The contact shadow, under the character. A character is several
        // models (the hero's five parts, a monster's head/torso/legs), so the
        // shadow is ONE ellipse per character: the first part of the group
        // draws it, with the group's own width.
        ActorShadow({
          x: () => placement().x,
          z: () => placement().z,
          outline: () => groupOutline(index),
          radius: () => groupWidth(index),
          scale: () => placement().scale,
          // Only until the model lands: the model draws its OWN shadow as a
          // projected pass (see `projectShadow` in `./model`), so a blob on top
          // of that would be a second, wrong shadow.
          visible: () => {
            const list = unref(props.actors)
            const shown = (list[index] ?? actor).visible ?? true
            return shown && isGroupLead(index) && (models[index]?.parts.length ?? 0) === 0
          },
        }),
        Gr2Model({
          parts: () => partsFor(index),
          normalsMode: false,
          // Characters light through the PBR material (normal-mapped GGX over
          // the retail _nrm/_orm channels); the batch path is the fallback on
          // a backend without material support.
          pbr: true,
          // Isometric painter order for the material draws: an actor further
          // from the camera draws first.
          order: () => placement().x + placement().y,
          // Gr2Model's `orbit` prop is a redraw-only dependency (gr2-lab drives
          // its orbit timer through it); carry the scale so slider changes
          // repaint even before any group field's value changes shape.
          orbit: () => unref(props.unitsPerTile) ?? MODEL_UNITS_PER_TILE,
        }),
      ],
    })
  })

  return (
    <div style={LAYER_STYLE}>
      <canvas
        width={width}
        height={height}
        contextType="webgl"
        contextOptions={contextOptions}
        camera={camera}
        renderOptions={renderOptions}
        style={style}
      >
        {/* The wall quads come first: same canvas, same depth buffer as the
            models, which is the only way a wall can hide a character per
            pixel. */}
        {props.walls === undefined
          ? children
          : [WallQuads({ cells: props.walls, camera, width, height }), ...children]}
      </canvas>
    </div>
  )
}
