/**
 * 3D actor lab — the visual proof that the 3D actor layer lands pixel-perfectly
 * on the game's isometric grid.
 *
 * The page stacks two canvases:
 *
 * 1. A plain 2D canvas underneath, drawing the tile diamonds by hand with the
 *    SAME `toScreen` the game uses (`./iso.ts`) — nothing 3D is involved in the
 *    grid, so if the models land on it, they land on the game's grid.
 * 2. `<Actor3DLayer>` (`./three-d/actor-layer.tsx`) above it: a transparent
 *    gfx canvas with three real D2R models (diablo torso, amazon head, amazon
 *    torso) at known tiles and different facings.
 *
 * Controls: a slider for MODEL_UNITS_PER_TILE (the calibration constant) with
 * a live readout. A probe object on `window.__actorLab` exposes each model's
 * projected feet position and its grid diamond center, so the browser probe
 * can REPORT the pixel delta between the two pipelines. With `?anim=<clip>`
 * (e.g. `?anim=walk`) the models additionally play that skeletal clip in real
 * time (see the playback section below); without it the page shows the static
 * bind pose.
 */

import { mount } from '@rasenjs/dom'
import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { computeCameraMatrix } from '@rasenjs/gfx'
import { toScreen } from './iso'
import { Actor3DLayer, type Actor3D } from './three-d/actor-layer'
import { loadAnimationRig } from './three-d/skinning'
import {
  ACTOR_CAMERA_DIST,
  MODEL_UNITS_PER_TILE,
  actorCamera,
  modelToTransform,
} from './three-d/projection'

// ---------------------------------------------------------------------------
// Scene setup — known tiles, known facings
// ---------------------------------------------------------------------------

/** The tile point the camera centers on (the 2D camera's pan). */
const CAMERA = { x: 5, y: 5 }

const GRID_MIN = 0
const GRID_MAX = 10

/** The three models under proof, at integer tiles with different facings. */
const ACTORS: Actor3D[] = [
  { id: 'diablo-torso', modelKey: 'diablo-torso', tileX: 3, tileY: 4, facing: 0 },
  { id: 'amazon-head', modelKey: 'amazon-head', tileX: 7, tileY: 3, facing: Math.PI / 2 },
  { id: 'amazon-torso', modelKey: 'amazon-torso', tileX: 5, tileY: 7, facing: Math.PI },
]

// ---------------------------------------------------------------------------
// Optional skeletal playback (`?anim=<clip>`)
// ---------------------------------------------------------------------------

/**
 * With `?anim=<name>` in the URL each actor plays a matching clip from its
 * character's set (exact name first, then any clip ending in `_<name>`,
 * preferring the `1hs_` family), looping in real time. A rAF timer advances
 * the clip time and bumps `animationTick`, whose read inside the `actors`
 * getter is what repaints the layer every frame. Without the parameter the
 * page is byte-for-byte the bind-pose lab it has always been.
 */
const ANIM_PARAM = new URLSearchParams(window.location.search).get('anim')

const animationTick = ref(0)
const clipDurations = new Map<string, number>()

function resolveClipName(modelKey: string, base: string): Promise<{ name: string; duration: number } | null> {
  return loadAnimationRig(modelKey).then((rig) => {
    if (rig === null) return null
    const pick = (name: string): { name: string; duration: number } | null => {
      const clip = rig.animations.get(name)
      return clip === undefined ? null : { name, duration: clip.duration }
    }
    const exact = pick(base)
    if (exact !== null) return exact
    const suffix = `_${base}`
    const candidates = [...rig.animations.keys()].filter((name) => name.endsWith(suffix))
    candidates.sort((a, b) => (a.startsWith('1hs_') ? 0 : 1) - (b.startsWith('1hs_') ? 0 : 1))
    return candidates.length > 0 ? pick(candidates[0]) : null
  })
}

function startPlayback(): void {
  const started = performance.now()
  for (const actor of ACTORS) {
    void resolveClipName(actor.modelKey, ANIM_PARAM ?? '').then((clip) => {
      if (clip === null) return
      clipDurations.set(actor.id, clip.duration)
      actor.animation = { name: clip.name, time: 0 }
    })
  }
  const tick = (): void => {
    const elapsed = (performance.now() - started) / 1000
    for (const actor of ACTORS) {
      const animation = actor.animation
      if (animation === undefined) continue
      const duration = clipDurations.get(actor.id) ?? 0
      animation.time = duration > 0 ? elapsed % duration : elapsed
    }
    animationTick.value = animationTick.value + 1
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

if (ANIM_PARAM !== null) startPlayback()

// ---------------------------------------------------------------------------
// Probe surface (what the browser probe reads)
// ---------------------------------------------------------------------------

interface ActorProbe {
  id: string
  /** Where the3D camera matrix puts the model origin (its feet), in canvas px. */
  feet: { x: number; y: number }
  /** Where the2D `toScreen` grid draws the tile's diamond center, in canvas px. */
  diamond: { x: number; y: number }
  /** feet - diamond, in px — THE alignment number. */
  delta: { x: number; y: number }
  deltaPx: number
}

interface ActorLabProbe {
  ready: boolean
  width: number
  height: number
  unitsPerTile: number
  actors: ActorProbe[]
}

declare global {
  interface Window {
    __actorLab: ActorLabProbe
  }
}

// ---------------------------------------------------------------------------
// The2D grid (plain canvas, the game's own toScreen)
// ---------------------------------------------------------------------------

/** Screen position of a tile point, with the camera pan applied. */
function tileToScreen(tileX: number, tileY: number, width: number, height: number): { x: number; y: number } {
  const rel = toScreen(tileX - CAMERA.x, tileY - CAMERA.y)
  return { x: width / 2 + rel.x, y: height / 2 + rel.y }
}

function drawGrid(canvas: HTMLCanvasElement, width: number, height: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#101418'
  ctx.fillRect(0, 0, width, height)

  const actorTiles = new Map<string, Actor3D>()
  for (const actor of ACTORS) actorTiles.set(`${actor.tileX}:${actor.tileY}`, actor)

  for (let i = GRID_MIN; i <= GRID_MAX; i += 1) {
    for (let j = GRID_MIN; j <= GRID_MAX; j += 1) {
      // One 2:1 diamond per tile, corners at the tile's ±0.5 — so a diamond's
      // CENTER is exactly toScreen(i, j) and an actor's feet (tileX, tileY)
      // have an unambiguous target.
      const corner = (dx: number, dy: number) => tileToScreen(i + dx, j + dy, width, height)
      const a = corner(-0.5, -0.5)
      const b = corner(0.5, -0.5)
      const c = corner(0.5, 0.5)
      const d = corner(-0.5, 0.5)

      const occupied = actorTiles.has(`${i}:${j}`)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
      ctx.closePath()
      ctx.fillStyle = occupied ? '#22303f' : (i + j) % 2 === 0 ? '#161d26' : '#131922'
      ctx.fill()
      ctx.strokeStyle = '#2e3a4a'
      ctx.stroke()

      if (occupied) {
        // Cross at the diamond center — the exact pixel the model's feet must hit.
        const center = tileToScreen(i, j, width, height)
        ctx.strokeStyle = '#e8c14d'
        ctx.beginPath()
        ctx.moveTo(center.x - 6, center.y)
        ctx.lineTo(center.x + 6, center.y)
        ctx.moveTo(center.x, center.y - 6)
        ctx.lineTo(center.x, center.y + 6)
        ctx.stroke()
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function main(): void {
  useReactiveRuntime()

  const width = window.innerWidth
  const height = window.innerHeight

  const stage = document.createElement('div')
  stage.id = 'actor-lab-stage'
  stage.style.cssText = `position:relative; width:${width}px; height:${height}px; overflow:hidden;`

  const gridCanvas = document.createElement('canvas')
  gridCanvas.id = 'actor-lab-grid'
  gridCanvas.width = width
  gridCanvas.height = height
  gridCanvas.style.cssText = 'position:absolute; left:0; top:0;'
  stage.appendChild(gridCanvas)

  const appRoot = document.createElement('div')
  appRoot.style.cssText = 'position:absolute; left:0; top:0;'
  stage.appendChild(appRoot)

  // Controls (plain DOM): the calibration slider + readout.
  const controls = document.createElement('div')
  controls.id = 'actor-lab-controls'
  controls.style.cssText =
    'position:fixed; top:8px; left:8px; z-index:10; display:flex; gap:12px; align-items:center;' +
    'padding:8px 12px; border-radius:6px; background:rgba(12,16,24,0.85);' +
    'color:#cfd8e3; font:12px/1.5 ui-monospace, Menlo, monospace;'
  const sliderLabel = document.createElement('label')
  sliderLabel.textContent = 'MODEL_UNITS_PER_TILE '
  const slider = document.createElement('input')
  slider.type = 'range'
  slider.id = 'actor-lab-units'
  slider.min = '6'
  slider.max = '12'
  slider.step = '0.05'
  slider.value = String(MODEL_UNITS_PER_TILE)
  sliderLabel.appendChild(slider)
  const readout = document.createElement('span')
  readout.id = 'actor-lab-units-value'
  readout.textContent = `= ${MODEL_UNITS_PER_TILE.toFixed(2)} (model units per tile)`
  controls.appendChild(sliderLabel)
  controls.appendChild(readout)

  document.body.appendChild(stage)
  document.body.appendChild(controls)

  drawGrid(gridCanvas, width, height)

  const unitsPerTile = ref(MODEL_UNITS_PER_TILE)

  // The 3D layer: transparent canvas over the grid, same camera pan. The
  // `actors` getter reads the playback tick when `?anim=` drives one, so the
  // layer re-skins and repaints every frame.
  mount(
    Actor3DLayer({
      actors:
        ANIM_PARAM === null
          ? ACTORS
          : () => {
              animationTick.value
              return ACTORS
            },
      camera: CAMERA,
      width,
      height,
      unitsPerTile,
    }),
    appRoot,
  )

  // -------------------------------------------------------------------------
  // Probe: project each model's feet through the 3D camera matrix and compare
  // with the2D grid's diamond center.
  // -------------------------------------------------------------------------

  const probe: ActorLabProbe = {
    ready: true,
    width,
    height,
    unitsPerTile: MODEL_UNITS_PER_TILE,
    actors: [],
  }
  window.__actorLab = probe

  const refreshProbe = (): void => {
    const config = actorCamera(
      { x: CAMERA.x, y: 0, z: CAMERA.y },
      ACTOR_CAMERA_DIST,
      width,
      height,
    )
    const { projection, view } = computeCameraMatrix(config, width, height)
    const s = projection.multiply(view).source
    const project = (x: number, y: number, z: number) => {
      // Float64 dots over the float32 camera matrix (see projection.test.ts).
      const cx = s[0] * x + s[4] * y + s[8] * z + s[12]
      const cy = s[1] * x + s[5] * y + s[9] * z + s[13]
      return { x: ((cx + 1) / 2) * width, y: ((1 - cy) / 2) * height }
    }

    probe.unitsPerTile = unitsPerTile.value
    probe.actors = ACTORS.map((actor) => {
      const placement = modelToTransform(
        actor.tileX,
        actor.tileY,
        actor.facing,
        unitsPerTile.value,
      )
      // The model origin is the character's feet (models share one character
      // space with legs at y ≈ 0) — project the placed origin.
      const feet = project(placement.x, placement.y, placement.z)
      const diamond = tileToScreen(actor.tileX, actor.tileY, width, height)
      const delta = { x: feet.x - diamond.x, y: feet.y - diamond.y }
      return {
        id: actor.id,
        feet,
        diamond,
        delta,
        deltaPx: Math.hypot(delta.x, delta.y),
      }
    })
  }
  refreshProbe()

  slider.addEventListener('input', () => {
    unitsPerTile.value = Number(slider.value)
    readout.textContent = `= ${unitsPerTile.value.toFixed(2)} (model units per tile)`
    refreshProbe()
  })
}

main()
