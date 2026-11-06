/**
 * Entry point — assembly, the frame loop, and the two wiring steps that make the
 * reactive shell work.
 *
 * The structure is the same as any Rasen app:
 *
 *   1. install a reactive runtime (once, before anything subscribes)
 *   2. register non-DOM components as JSX tags
 *   3. build the imperative half (world, baker, lightmap)
 *   4. hand the imperative half's output signals to the scene tree
 *   5. mount, then start the frame loop
 *
 * The interesting part is step 4, and how small it is. The simulation publishes
 * about a dozen signals (see `core/world.ts`) and that is the *entire* contract
 * between the two halves of the program. There is no renderer API to call, no draw
 * list to build, no invalidation to remember: the tile layer subscribes to a
 * revision counter, entities arrive through an `each`, and the HUD reads the same
 * refs the simulation writes.
 */

import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { RenderContext } from '@rasenjs/canvas-2d'

import { FIXED_DT, LIGHT_SCALE, MAX_STEPS } from './core/constants'
import {
  ambientAt,
  computeLighting,
  daylightAt,
  paintLightmap,
  skyTintAt,
} from './core/lighting'
import { World } from './core/world'
import { ChunkBaker } from './render/bake'
import { buildTileAtlas } from './render/atlas'
import { bindInput } from './input'
import { Scene, useSceneAtlas } from './ui/scene'
import { useCanvasAtlas } from './ui/kit-canvas'
import { useDomAtlas } from './ui/kit-dom'

// 1. One runtime for the whole app. Every `ref` and every subscription resolve
//    through it, so this has to happen before any component is created.
useReactiveRuntime()

// 2. canvas-2d components bind as lowercase JSX tags through the vite
//    config's auto-import, sharing one namespace with the DOM tags.

/**
 * Device pixel ratio, clamped to integers.
 *
 * The bake runs at this scale so that a 1× camera lands on exact device pixels.
 * Anything else and the nearest-neighbour blit in `tileLayer` would be resampling
 * on a non-integer grid, which is exactly the case pixel art cannot survive.
 */
const RENDER_SCALE = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)))

/** Tiles around an edit that lighting may need to repaint. See `flushWorld`. */
const LIGHT_PAINT_INTERVAL = 3

function boot(): void {
  const seed = seedFromLocation()

  // -- the imperative half -------------------------------------------------
  const atlas = buildTileAtlas(RENDER_SCALE)
  const world = new World(seed)
  const baker = new ChunkBaker({ store: world.store, atlas, seed })

  // The lightmap: LIGHT_SCALE pixels per tile, so the upscale has values to
  // interpolate between instead of tile-sized steps.
  const lightmap = document.createElement('canvas')
  lightmap.width = world.store.w * LIGHT_SCALE
  lightmap.height = world.store.h * LIGHT_SCALE
  const lightCtx = lightmap.getContext('2d')
  if (!lightCtx) throw new Error('2d context unavailable for the lightmap')
  const lightImage = lightCtx.createImageData(lightmap.width, lightmap.height)

  // -- the bridge ----------------------------------------------------------
  // Two callbacks. That is the whole coupling from the reactive layer back into
  // the imperative one: the renderer asks for rebakes, it never reaches into the
  // world.
  world.onBake = (chunks) => baker.bakeAll(chunks)
  world.onLight = () => {
    const t0 = performance.now()
    const timeOfDay = world.stats.value.timeOfDay
    computeLighting(world.store, {
      daylight: daylightAt(timeOfDay),
      skyTint: skyTintAt(timeOfDay),
      ambient: ambientAt(timeOfDay),
    })
    paintLightmap(world.store, lightImage, LIGHT_SCALE)
    lightCtx.putImageData(lightImage, 0, 0)
    return performance.now() - t0
  }

  // The atlas is registered with each host rather than threaded through every
  // widget: the host is a plain object literal, and the atlas is a page-wide
  // resource built exactly once.
  useCanvasAtlas(atlas)
  useDomAtlas(atlas)
  useSceneAtlas(atlas)

  // -- warm up before the first frame --------------------------------------
  // Bake every chunk and run the lighting pass once, *before* mounting, so the first
  // visible frame is already correct and already warm.
  //
  // Doing this lazily is a real problem rather than a nicety: the first chunk bakes
  // and the first light pass run before the JIT has compiled those kernels, and
  // together they measured ~100 ms — a quarter-second of black screen behind the boot
  // veil at best, a visible hitch at worst. `world.warm()` is where that lives, so the
  // simulation owns its own startup cost instead of `main.tsx` reaching into the
  // baker's internals.
  world.warm()

  // -- mount ---------------------------------------------------------------
  const container = document.getElementById('app')
  if (!container) throw new Error('#app is missing from index.html')

  // `Scene` is `com`-wrapped, so calling it *is* the mountable: `com` creates the
  // effect scope at this point and the returned function is what `mount` invokes
  // with the host. A further call here would invoke that mountable with no host at
  // all.
  mount(
    Scene({
      world,
      baker,
      atlas,
      lightmap,
    }),
    container
  )

  // -- post-mount wiring ---------------------------------------------------
  const canvasEl = container.querySelector('#terraria-viewport canvas')
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('the scene canvas was not found after mount')
  }

  const ctx = canvasEl.getContext('2d')
  if (ctx) {
    // Reaching the render context to report node count is read-only diagnostics —
    // exactly the kind of thing the renderer is happy to expose and nothing else
    // in the app should do.
    const rc = RenderContext.for(ctx as never)
    world.onSampleNodes = () => rc.nodeCount
  }

  bindInput(canvasEl, world)
  sizeToContainer(world, container)

  // The debug hook: a driver (or a human) can read and drive the sim the way a
  // player does. Development only — the production bundle has no `import.meta.env.DEV`.
  if (import.meta.env.DEV) {
    ;(globalThis as { terraria?: unknown }).terraria = { world, baker, atlas }
    // Profiling hooks: the lighting pass is the one hot path worth being able to
    // measure from outside, and splitting it needs the two halves reachable.
    ;(globalThis as { __lightmap?: unknown }).__lightmap = { image: lightImage, ctx: lightCtx }
    ;(globalThis as { __lightmod?: unknown }).__lightmod = {
      computeLighting,
      paintLightmap,
    }
  }

  // Lift the boot veil on the first presented frame rather than on mount: the
  // world is generated synchronously before mount, so by the time this fires the
  // first frame has already drawn something real.
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('terraria:ready'))
  })

  // -- the frame loop ------------------------------------------------------
  let last = performance.now()
  let accumulator = 0
  let smoothedFps = 60
  let smoothedFrame = 16.7
  let lightGate = 0

  const frame = (now: number): void => {
    const workStart = performance.now()
    const elapsed = Math.min(now - last, 250) / 1000
    last = now
    accumulator += elapsed

    // Fixed timestep with a step cap. Without the cap, one long stall enqueues a
    // backlog that takes longer to run than the time it is trying to catch up,
    // and the frame rate never recovers.
    let steps = 0
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      world.tick()
      accumulator -= FIXED_DT
      steps++
    }
    if (steps === MAX_STEPS) accumulator = 0

    // Bakes are immediate: an edit should be on screen the very next frame, and a
    // bake is one 32×32 chunk.
    world.flushBakes()

    // Lighting is throttled instead. A pass walks every tile in the world, and
    // holding the mine button keeps the dirty flag set for as long as the button
    // is down — so an un-throttled loop would run it sixty times a second to
    // produce fifty-nine near-identical results. Three frames is ~50 ms, which is
    // inside perception for a light going out.
    if (lightGate > 0) {
      lightGate--
    } else {
      world.flushLight()
      lightGate = LIGHT_PAINT_INTERVAL
    }

    const frameMs = performance.now() - workStart
    smoothedFrame = smoothedFrame * 0.9 + frameMs * 0.1
    smoothedFps = smoothedFps * 0.9 + (1 / Math.max(elapsed, 0.0001)) * 0.1
    world.reportFrame(smoothedFps, smoothedFrame)

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

/**
 * Keeps the world viewport matched to its container.
 *
 * The canvas is sized from `world.viewWidth`/`viewHeight` refs, so this is the
 * whole resize story: measure, write two signals, and the canvas bridge resizes
 * the drawing buffer and the camera clamps itself.
 */
function sizeToContainer(world: World, container: HTMLElement): void {
  const viewport = container.querySelector('#terraria-viewport')
  if (!(viewport instanceof HTMLElement)) return

  const apply = (): void => {
    const rect = viewport.getBoundingClientRect()
    const w = Math.max(320, Math.round(rect.width))
    const h = Math.max(240, Math.round(rect.height))
    if (w !== world.viewWidth.value || h !== world.viewHeight.value) world.resize(w, h)
  }

  apply()
  new ResizeObserver(apply).observe(viewport)
}

/** `?seed=1234` for reproducing a world; a fixed default otherwise. */
function seedFromLocation(): number {
  const raw = new URLSearchParams(location.search).get('seed')
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n)) return Math.abs(Math.floor(n)) || 1
  }
  return 20261021
}

boot()
