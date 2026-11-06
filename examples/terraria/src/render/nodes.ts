/**
 * Custom scene-graph nodes — the places where the declarative component set is not
 * the right tool, and why.
 *
 * `@rasenjs/canvas-2d` gives you `image` for a bitmap, `rect` for a box and `text`
 * for a string, and for most scenes that is the whole story. Four cases here fall
 * outside it, and each one is a different reason:
 *
 *  - **The tile layer.** One node per visible chunk would be ~12 nodes whose `deps`
 *    re-read every prop on every flush, to draw twelve blits that depend on exactly
 *    one thing (the world revision). Collapsing them into a single node with
 *    `deps: [revision, visible]` makes the dependency honest and the node count
 *    constant. It also lets us turn image smoothing *off*, which the `image`
 *    component does not expose — and for pixel art smoothing at anything other
 *    than 1:1 is wrong.
 *  - **The sky.** A `rect` cannot paint a gradient: canvas `fillStyle` takes a
 *    colour, not a CSS `linear-gradient()`, and the real mechanism is
 *    `createLinearGradient`. So either the gradient is painted here or it is
 *    abandoned, and the gradient is what sells dawn and dusk.
 *  - **The parallax hills.** Three sine bands as one path. As `rect` nodes that
 *    would be ~50 nodes rebuilt on every camera move; as a path it is one node and
 *    a loop.
 *  - **The lighting pass.** It needs `globalCompositeOperation = 'multiply'`, a
 *    source-rect blit *and* smoothing on, simultaneously, and it must be the last
 *    thing under the HUD. Three behaviours the generic components each expose only
 *    partially.
 *
 * All of them are built on `createNode(parent, { draw, deps })`, which is the
 * documented extension point — this is the library's own seam, not a workaround
 * around it.
 *
 * ## Why the props are `PropValue` and not `SignalRef`
 *
 * These nodes exist mostly to consume *derived* values (a camera position combined
 * with a viewport size, a stat read out of a stats object), which are getters
 * rather than refs. `read()` accepts both, so the node contract stays uniform.
 */

import { com, type PropValue } from '@rasenjs/core'
import { createNode, type CanvasNode, type Context2D } from '@rasenjs/canvas-2d'
import { TILE } from '../core/constants'
import { mulberry32 } from '../core/rng'
import { read } from '../ui/kit'
import type { ChunkBaker } from './bake'

export interface TileLayerProps {
  readonly baker: ChunkBaker
  /** Chunks currently worth drawing, computed by the simulation. */
  readonly visible: PropValue<readonly number[]>
  /** Bumped by the baker whenever a surface is rebuilt. */
  readonly revision: PropValue<number>
}

/**
 * Draws every visible baked chunk.
 *
 * The node draws in **world coordinates**: it sits inside the camera `group`, so
 * the group's transform has already turned world space into screen space by the
 * time `draw` runs. That is the whole reason there is no camera in the renderer —
 * pan and zoom are a transform on an ancestor, and every descendant inherits it
 * for free.
 */
export const tileLayer = com((props: TileLayerProps) => {
  const { baker, visible, revision } = props
  /**
   * The destination size is the surface's size in **CSS** pixels, because the baker
   * rasterises each chunk at `devicePixelRatio ×` that and the canvas bridge scales
   * the context by the same factor. The two cancel, which is what makes the blit
   * land on exact device pixels and keeps the pixel art crisp.
   */
  const px = baker.surfaceCssSize

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        // Nearest-neighbour: at 1× this is a straight copy, and when the camera
        // zooms the blocks stay sharp instead of turning to mush.
        ctx.imageSmoothingEnabled = false
        const chunks = read(visible)
        for (let i = 0; i < chunks.length; i++) {
          const baked = baker.get(chunks[i])
          ctx.drawImage(baked.canvas, baked.originX, baked.originY, px, px)
        }
      },
      // The only two things that can change what this node paints: which chunks
      // are on screen, and whether any of them were rebaked.
      deps: () => [read(visible), read(revision)],
      // Nothing here is clickable. World picking is the simulation's job (see
      // `src/input.ts`): node bounds are in world space and hit-testing runs in
      // screen space, so routing picks through the tree would mean two coordinate
      // authorities that have to agree.
      bounds: () => null,
    })

    return () => node.remove()
  }
})

export interface SkyProps {
  readonly width: PropValue<number>
  readonly height: PropValue<number>
  readonly timeOfDay: PropValue<number>
}

export const skyLayer = com((props: SkyProps) => {
  const { width, height, timeOfDay } = props

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const w = read(width)
        const h = read(height)
        const [top, bottom] = skyStops(read(timeOfDay))

        const gradient = ctx.createLinearGradient(0, 0, 0, h)
        gradient.addColorStop(0, top)
        gradient.addColorStop(1, bottom)
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, w, h)
      },
      deps: () => [read(width), read(height), read(timeOfDay)],
      bounds: () => null,
    })
    return () => node.remove()
  }
})

/**
 * Sky colours for a time of day.
 *
 * A plain function, deliberately: it returns *values*, not a tree, so it is a helper
 * rather than a component. Wrapping it in `com` would buy nothing and cost an effect
 * scope per call.
 *
 * Three hands, not one: a daylight ramp plus separate dawn and dusk bells, so the
 * horizon goes orange at the right hours instead of being warm all day.
 */
export function skyStops(t: number): [string, string] {
  const noon = 1 - Math.min(1, Math.abs(t - 0.5) / 0.5)
  const dawn = Math.max(0, 1 - Math.abs(t - 0.25) / 0.14)
  const dusk = Math.max(0, 1 - Math.abs(t - 0.75) / 0.14)
  const warm = dawn + dusk

  const top: [number, number, number] = [
    13 + noon * 58 + warm * 34,
    18 + noon * 74 + warm * 16,
    46 + noon * 104,
  ]
  const bottom: [number, number, number] = [
    26 + noon * 104 + dawn * 92 + dusk * 130,
    32 + noon * 128 + dawn * 48 + dusk * 38,
    62 + noon * 144 + dusk * 14,
  ]
  const rgb = (c: [number, number, number]): string =>
    `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
  return [rgb(top), rgb(bottom)]
}

export interface CloudProps {
  readonly camLeft: PropValue<number>
  readonly width: PropValue<number>
  readonly height: PropValue<number>
  readonly timeOfDay: PropValue<number>
  /** World px of the horizon, so the cloud band sits above it. */
  readonly horizon: PropValue<number>
}

/**
 * Drifting clouds.
 *
 * A band of overlapping ellipses that scroll at a fraction of the camera and drift
 * on their own clock. Clouds are doing more work than they look like: without them
 * the sky is a flat gradient and the whole frame reads as a diagram. They are also
 * the cheapest possible test of the parallax idea, since they move on two
 * independent axes at once.
 *
 * Deterministic from a fixed seed rather than a random draw, so the sky does not
 * reshuffle on every reload.
 */
export const cloudLayer = com((props: CloudProps) => {
  const { camLeft, width, height, timeOfDay, horizon } = props

  // Generated once: cloud shape is content, not something that should change per
  // frame. `depth` groups them into near/mid/far bands for the parallax.
  const clouds = (() => {
    const rand = mulberry32(0xc10d)
    const out: Array<{ x: number; y: number; w: number; h: number; depth: number; alpha: number }> = []
    for (let band = 0; band < 3; band++) {
      const depth = [7, 4.2, 2.6][band]
      const count = [9, 7, 5][band]
      for (let i = 0; i < count; i++) {
        out.push({
          x: rand() * 2400,
          y: 0.06 + band * 0.1 + rand() * 0.06,
          w: 90 + rand() * 150 - band * 18,
          h: 16 + rand() * 14,
          depth,
          alpha: 0.5 - band * 0.09,
        })
      }
    }
    return out
  })()

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const w = read(width)
        const t = read(timeOfDay)
        const base = read(horizon)
        const wx = read(camLeft)
        const noon = 1 - Math.min(1, Math.abs(t - 0.5) / 0.5)

        // Clouds pick up the same warm tint the sky does at dawn and dusk.
        const warm = Math.max(0, 1 - Math.abs(t - 0.25) / 0.2) + Math.max(0, 1 - Math.abs(t - 0.75) / 0.2)
        const r = Math.round(200 + noon * 52 + warm * 40)
        const g = Math.round(206 + noon * 46 + warm * 18)
        const b = Math.round(226 + noon * 24 - warm * 10)

        for (const cloud of clouds) {
          // Position wraps in a bounded strip; `depth` divides the camera so far
          // clouds lag behind near ones.
          const span = 2600
          const drift = t * 360 * (1 / cloud.depth)
          const cxRaw = cloud.x - wx / cloud.depth + drift
          const cx = ((cxRaw % span) + span) % span
          if (cx > w + cloud.w) continue

          const cy = base * cloud.y
          ctx.fillStyle = `rgba(${r},${g},${b},${cloud.alpha})`

          // Two overlapping ellipses per cloud: a wide flat body and a taller lobe.
          // One ellipse reads as a UFO.
          ctx.beginPath()
          ctx.ellipse(cx, cy, cloud.w / 2, cloud.h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.ellipse(
            cx - cloud.w * 0.14,
            cy + cloud.h * 0.18,
            cloud.w * 0.3,
            cloud.h * 0.36,
            0,
            0,
            Math.PI * 2
          )
          ctx.fill()
          ctx.beginPath()
          ctx.ellipse(
            cx + cloud.w * 0.2,
            cy + cloud.h * 0.12,
            cloud.w * 0.24,
            cloud.h * 0.3,
            0,
            0,
            Math.PI * 2
          )
          ctx.fill()
        }
      },
      deps: () => [read(width), read(height), read(camLeft), read(timeOfDay), read(horizon)],
      bounds: () => null,
    })
    return () => node.remove()
  }
})

export interface ParallaxProps {
  readonly camLeft: PropValue<number>
  readonly width: PropValue<number>
  readonly height: PropValue<number>
  readonly timeOfDay: PropValue<number>
  /** Screen row the hills stand on. */
  readonly horizon: PropValue<number>
}

/**
 * Three layers of rolling hills, each moving at a fraction of the camera.
 *
 * One node drawing three sine bands rather than ~50 `rect` nodes: the bands are a
 * path, and a path is not something the component set expresses. Same reasoning as
 * the tile layer — when a prop cannot say it *and* saying it would cost dozens of
 * nodes, a custom node is the cheaper trade.
 */
export const parallaxLayer = com((props: ParallaxProps) => {
  const { camLeft, width, height, timeOfDay, horizon } = props

  const bands: ReadonlyArray<{
    depth: number
    amp: number
    step: number
    lift: number
    shade: number
  }> = [
    { depth: 11, amp: 20, step: 46, lift: 0, shade: 0.5 },
    { depth: 6.5, amp: 27, step: 62, lift: 26, shade: 0.74 },
    { depth: 3.4, amp: 34, step: 88, lift: 54, shade: 0.98 },
  ]

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const w = read(width)
        const h = read(height)
        const t = read(timeOfDay)
        const noon = 1 - Math.min(1, Math.abs(t - 0.5) / 0.5)
        const wx0 = read(camLeft)
        const base = read(horizon)

        for (const band of bands) {
          const offset = (wx0 / band.depth) % (band.step * 24)
          ctx.beginPath()
          ctx.moveTo(0, h)
          // 6 px steps: the curve is smooth at this density and the path stays
          // short enough to rebuild every frame without thinking about it.
          for (let x = 0; x <= w; x += 6) {
            const s = x + offset
            const y =
              base -
              band.lift +
              Math.sin(s / band.step) * band.amp +
              Math.sin(s / (band.step * 0.37) + 1.7) * band.amp * 0.45
            ctx.lineTo(x, y)
          }
          ctx.lineTo(w, h)
          ctx.closePath()

          // The far band is washed toward the sky colour so it reads as distance
          // rather than as a darker hill behind a lighter one.
          const haze = band.shade
          const lum = (0.34 + noon * 0.4) * haze
          const r = Math.round(52 * lum * 1.5)
          const g = Math.round(72 * lum * 1.5)
          const b = Math.round(104 * lum * 1.6)
          ctx.fillStyle = `rgb(${r},${g},${b})`
          ctx.fill()
        }
      },
      deps: () => [
        read(width),
        read(height),
        read(camLeft),
        read(timeOfDay),
        read(horizon),
      ],
      bounds: () => null,
    })
    return () => node.remove()
  }
})

export interface LightingProps {
  readonly lightmap: HTMLCanvasElement
  readonly revision: PropValue<number>
  /** Camera top-left in world px — the lightmap is blitted in screen space. */
  readonly camLeft: PropValue<number>
  readonly camTop: PropValue<number>
  readonly viewWidth: PropValue<number>
  readonly viewHeight: PropValue<number>
  readonly zoom: PropValue<number>
  /**
   * Pixels per tile **in the lightmap**, which is `LIGHT_SCALE` and has nothing to
   * do with the render scale. Conflating the two was a real bug: the sampled region
   * came out at half size, so the composite was reading the sky band and smearing it
   * over the terrain.
   */
  readonly pixelsPerTile: number
}

/**
 * Multiplies the lightmap over everything drawn before it.
 *
 * This node is intentionally **not** inside the camera group: the lightmap is
 * stored at a fixed resolution per tile, and blitting it in screen space is what
 * lets one `drawImage` cover the viewport at any zoom. The camera is applied by
 * choosing the source rectangle rather than by transforming the destination.
 *
 * A note on correctness, because it is the interesting tradeoff in this file.
 * Canvas2D's `'multiply'` implements PDF blend semantics: against a
 * semi-transparent backdrop it adds a `(1 - αd)·Cs` wash that XNA's vertex-colour
 * multiply does not have. Open-Terraria hit exactly this and wrote a WebGL2 shader
 * (`GLWorldLight`) to get the exact result. Here the backdrop is an opaque world,
 * so `αd ≈ 1`, the wash term vanishes, and the cheap path is pixel-equivalent in
 * practice. If a translucent overlay ever lands *under* this node, that assumption
 * breaks, and this is the place to fix it.
 */
export const lightingLayer = com((props: LightingProps) => {
  const { lightmap, revision, camLeft, camTop, viewWidth, viewHeight, zoom, pixelsPerTile } = props

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const z = read(zoom)
        // Lightmap px per screen px: the lightmap holds `pixelsPerTile` px per tile,
        // a tile is TILE world px, and the screen shows the world at `z`×.
        const k = pixelsPerTile / TILE / z
        const vw = read(viewWidth)
        const vh = read(viewHeight)

        ctx.save()
        ctx.globalCompositeOperation = 'multiply'
        // Smoothing ON, unlike the tile layer: the lightmap is a coarse grid being
        // stretched, and interpolating it is what produces a gradient instead of
        // tile-sized squares.
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(
          lightmap,
          read(camLeft) * k,
          read(camTop) * k,
          vw * k,
          vh * k,
          0,
          0,
          vw,
          vh
        )
        ctx.restore()
      },
      deps: () => [
        read(revision),
        read(camLeft),
        read(camTop),
        read(viewWidth),
        read(viewHeight),
        read(zoom),
      ],
      bounds: () => null,
    })

    return () => node.remove()
  }
})

export interface HighlightProps {
  readonly tileX: PropValue<number | null>
  readonly tileY: PropValue<number | null>
  readonly color: PropValue<string>
  /** Drawn dashed while mining, to signal that the edit is in progress. */
  readonly active: PropValue<boolean>
}

/**
 * The tile under the cursor, outlined.
 *
 * A dashed secondary stroke around the solid one cannot be expressed by the `rect`
 * component in a single node, and two nested `rect`s would not dash.
 */
export const tileHighlight = com((props: HighlightProps) => {
  const { tileX, tileY, color, active } = props

  return (parent: CanvasNode) => {
    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const x = read(tileX)
        const y = read(tileY)
        if (x === null || y === null) return

        const px = x * TILE
        const py = y * TILE
        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = read(color)
        ctx.strokeRect(px + 0.75, py + 0.75, TILE - 1.5, TILE - 1.5)

        // A second, fainter outline: it reads as a glow at 1× and is the only
        // thing distinguishing "hovering" from "editing" at this size.
        ctx.globalAlpha = read(active) ? 0.5 : 0.25
        ctx.strokeRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1)
        ctx.restore()
      },
      deps: () => [read(tileX), read(tileY), read(color), read(active)],
      bounds: () => null,
    })

    return () => node.remove()
  }
})
