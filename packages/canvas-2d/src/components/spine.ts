/**
 * Spine canvas-2d component — encapsulates all low-level Spine skeleton
 * rendering (background fill, fit/pan/zoom transform, per-triangle textured
 * attachment drawing, optional bone overlay) behind a declarative component.
 *
 * The viewer never touches the 2D context directly: it just declares
 * `<spine skeleton={...} atlas={...} ... />` inside a `<canvas>`.
 *
 * Usage:
 *   <canvas contextType="2d" width={VIEW} height={VIEW} camera={{ x, y, zoom }}>
 *     <spine
 *       skeleton={skeleton} atlas={atlas} atlasImg={atlasImg} state={state}
 *       bg={bg} showBones={showBones}
 *       frame={frame} width={VIEW} height={VIEW}
 *     />
 *   </canvas>
 */

import { com, type Mountable } from '@rasenjs/core'
import type { PropValue } from '@rasenjs/core'
import { createNode, type CanvasNode, type Context2D } from '../node'
import { getRenderContext } from '../render-context'
import { unref } from '../utils/ref'
import type { CanvasCameraConfig } from '../types'
import type { CanvasEventHandlers } from '../events'
import {
  computeAttachmentWorld,
  hitTestSpine,
  type Skeleton,
  type SpineAtlas,
  type AnimationState,
  type SpineEvent,
  type Slot,
  type Bone
} from '@rasenjs/assets'

/** Payload delivered to `onPick` / `onClick`. `slot`/`attachment`/`bone` are
 * null (via the event being null) when the pointer misses the skeleton. */
export interface SpinePickEvent {
  /** The hit slot (topmost in draw order). */
  slot: Slot
  /** The hit attachment name. */
  attachment: string
  /** The bone driving the hit slot. */
  bone: Bone
  /** Pointer X in canvas CSS pixels (matches drawing coordinates). */
  x: number
  /** Pointer Y in canvas CSS pixels (matches drawing coordinates). */
  y: number
  /** World-space X (camera-inverted). */
  worldX: number
  /** World-space Y (camera-inverted, Y-up). */
  worldY: number
}

export interface SpineProps {
  skeleton: PropValue<Skeleton | null>
  atlas: PropValue<SpineAtlas | null>
  atlasImg: PropValue<HTMLImageElement | null>
  /**
   * Multi-page atlas images: page file name (as written in the .atlas, e.g.
   * `c103_00_2.png`) → loaded image. Regions on page 2+ must sample from
   * their own page's image — drawing them from the primary page paints the
   * wrong texels (faces vanishing on c103/c094 multi-page characters).
   */
  atlasImgs?: PropValue<Map<string, HTMLImageElement> | null>
  state: PropValue<AnimationState | null>
  /** Animation name to play. Switches when the value changes. */
  animation?: PropValue<string>
  /** Skin name to apply. Switches when the value changes. */
  skin?: PropValue<string>
  /** Whether the current animation loops. Default true. */
  loop?: PropValue<boolean>
  showBones?: PropValue<boolean>
  /** Animation tick — bump to trigger a redraw each frame. */
  frame: PropValue<number>
  width: PropValue<number>
  height: PropValue<number>
  /**
   * Opaque backdrop painted before the skeleton. The canvas itself is
   * transparent, so without this the page background shows through the
   * character's semi-transparent edges and the whole picture looks washed-out
   * / too bright next to the WebGL viewer (which sits on a dark stage). Pass a
   * dark colour (e.g. '#0a0a0a') to match the WebGL viewer's `bg-neutral-950`.
   */
  bg?: PropValue<string | null>
  /** Fired for each Spine event-timeline entry as playback passes it. */
  onEvent?: PropValue<(e: SpineEvent) => void>
  /** Fired when the active animation (re)starts. */
  onStart?: PropValue<(e: { name: string }) => void>
  /** Fired when the animation ends (`loop=false`) or at each loop boundary (`loop=true`). */
  onComplete?: PropValue<(e: { name: string; loop: boolean }) => void>
  /** Fired on pointer down — hit-tests the pointer against the posed skeleton. Null when nothing is hit. */
  onPick?: PropValue<(e: SpinePickEvent | null) => void>
  /** Fired on click — hit-tests the pointer against the posed skeleton. Null when nothing is hit. */
  onClick?: PropValue<(e: SpinePickEvent | null) => void>
}
/**
 * Affine per-triangle texture mapping (Spine mesh → canvas).
 *
 * A general N-corner texture mapping needs a projective transform, which Canvas2D
 * cannot do directly. We split the polygon into triangles and draw each with an
 * affine transform (3 points define a unique affine) while clipping to the
 * destination triangle. Because the affine is bijective, only the source
 * triangle's pixels land inside the clip — rotation in the atlas is handled for
 * free. This matches the reference renderer in `examples/canvas-2d/src/spine.ts`.
 */

/**
 * Cache of un-premultiplied (straight-alpha) canvases for PMA atlas images.
 *
 * Nikke atlases are premultiplied alpha, and Canvas2D `drawImage` treats the
 * source as straight-alpha. Drawing a PMA texture with the default
 * `source-over` therefore double-multiplies alpha at semi-transparent edges
 * (dark fringes around eyes/mouth/chest). Un-premultiplying once (rgb /= alpha)
 * makes `source-over` correct — the canvas equivalent of the WebGL PMA blend
 * (`ONE, ONE_MINUS_SRC_ALPHA`) used by `spine-webgl.ts`.
 *
 * NOTE: `getImageData` returns the canvas' raw (premultiplied) pixels, so we can
 * recover the straight-alpha colour by dividing rgb by alpha. A CORS-tainted
 * image throws on `getImageData`; we fall back to the original (fringes may
 * remain) rather than crashing.
 */
const straightAlphaCache = new WeakMap<object, HTMLCanvasElement | null>()

function getStraightAlphaSource(
  img: HTMLImageElement | ImageBitmap
): HTMLImageElement | ImageBitmap | HTMLCanvasElement {
  const cached = straightAlphaCache.get(img as object)
  if (cached !== undefined) return cached ?? img
  try {
    const w = img.width
    const h = img.height
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const cctx = canvas.getContext('2d')!
    cctx.drawImage(img, 0, 0)
    const imageData = cctx.getImageData(0, 0, w, h)
    const px = imageData.data
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3]
      if (a > 0 && a < 255) {
        const inv = 255 / a
        px[i] = Math.min(255, Math.round(px[i] * inv))
        px[i + 1] = Math.min(255, Math.round(px[i + 1] * inv))
        px[i + 2] = Math.min(255, Math.round(px[i + 2] * inv))
      }
    }
    cctx.putImageData(imageData, 0, 0)
    straightAlphaCache.set(img as object, canvas)
    return canvas
  } catch {
    straightAlphaCache.set(img as object, null)
    return img
  }
}

function drawTexturedTriangles(
  ctx: Context2D,
  world: number[],
  uvs: number[],
  triangles: number[],
  img: HTMLImageElement | ImageBitmap,
  expandWorld: number
): void {
  // Map normalized atlas UVs to image pixels using the LAST pixel index
  // (img.width - 1). NOTE: the official spine-ts Canvas renderer uses the full
  // `img.width`; using that here made the render come out empty, so keep the
  // -1 form that actually works with our UV space.
  const texW = img.width - 1
  const texH = img.height - 1
  for (let t = 0; t < triangles.length; t += 3) {
    const i0 = triangles[t]
    const i1 = triangles[t + 1]
    const i2 = triangles[t + 2]

    const sx0 = uvs[2 * i0] * texW
    const sy0 = uvs[2 * i0 + 1] * texH
    const sx1 = uvs[2 * i1] * texW
    const sy1 = uvs[2 * i1 + 1] * texH
    const sx2 = uvs[2 * i2] * texW
    const sy2 = uvs[2 * i2 + 1] * texH

    const dx0 = world[2 * i0]
    const dy0 = world[2 * i0 + 1]
    const dx1 = world[2 * i1]
    const dy1 = world[2 * i1 + 1]
    const dx2 = world[2 * i2]
    const dy2 = world[2 * i2 + 1]

    // Expand the triangle outward from its centroid by a sub-pixel amount so
    // adjacent triangles (and overlay sub-meshes such as the blush) overlap
    // instead of leaving an anti-aliased gap. The affine below is computed
    // from this EXPANDED destination to the SAME source UVs, so no foreign
    // texels are sampled — only the drawn area grows, which hides the seam.
    const ecx = (dx0 + dx1 + dx2) / 3
    const ecy = (dy0 + dy1 + dy2) / 3
    const expand = (x: number, y: number): [number, number] => {
      const lx = x - ecx
      const ly = y - ecy
      const len = Math.hypot(lx, ly) || 1
      return [x + (lx / len) * expandWorld, y + (ly / len) * expandWorld]
    }
    const [ex0, ey0] = expand(dx0, dy0)
    const [ex1, ey1] = expand(dx1, dy1)
    const [ex2, ey2] = expand(dx2, dy2)

    const A = sx1 - sx0
    const B = sy1 - sy0
    const C = ex1 - ex0
    const D = sx2 - sx0
    const E = sy2 - sy0
    const F = ex2 - ex0
    const det = A * E - B * D
    if (Math.abs(det) < 1e-9) continue
    const G = ey1 - ey0
    const H = ey2 - ey0

    const a = (C * E - B * F) / det
    const c = (A * F - C * D) / det
    const e = ex0 - a * sx0 - c * sy0
    const b = (G * E - B * H) / det
    const d = (A * H - G * D) / det
    const f = ey0 - b * sx0 - d * sy0

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(ex0, ey0)
    ctx.lineTo(ex1, ey1)
    ctx.lineTo(ex2, ey2)
    ctx.closePath()
    // Clip in WORLD space (before the per-triangle affine), matching the
    // official spine-ts Canvas renderer. Adjacent triangles share the same
    // world-space edge, so their clip paths agree and the anti-aliased seam
    // between them disappears (no bright/dark line). Applying the affine
    // *after* the clip (as an earlier version did) transformed each clip by a
    // different matrix, so shared edges no longer matched and seamed.
    ctx.clip()
    ctx.transform(a, b, c, d, e, f)
    // Un-premultiply the PMA atlas once so `source-over` composites correctly
    // (no dark fringe at semi-transparent edges).
    ctx.drawImage(getStraightAlphaSource(img), 0, 0)
    ctx.restore()
  }
}

export const spine = com((props: SpineProps): Mountable<CanvasNode> => {
  return (parent: CanvasNode) => {
    // Camera is canvas-level (RenderContext), never a component prop. The
    // latest config is read from the parent's RenderContext so pointer
    // handlers can invert screen→world.
    const resolveCamera = (): CanvasCameraConfig | undefined => {
      try {
        return getRenderContext(parent.ctx).camera
      } catch {
        return undefined
      }
    }

    const pickAt = (x: number, y: number): SpinePickEvent | null => {
      const cam = resolveCamera()
      const W = unref(props.width) as number
      const H = unref(props.height) as number
      const Z = cam?.zoom ?? 1
      const CX = cam?.x ?? 0
      const CY = cam?.y ?? 0
      // Inverse of: screen = translate(W/2,H/2) ∘ scale(Z,-Z) ∘ translate(-cx,-cy)
      const worldX = (x - W / 2) / Z + CX
      const worldY = -(y - H / 2) / Z + CY
      const sk = unref(props.skeleton) as Skeleton | null
      const at = unref(props.atlas) as SpineAtlas | null
      if (!sk || !at) return null
      const hit = hitTestSpine(sk, at, worldX, worldY)
      return hit ? { ...hit, x, y, worldX, worldY } : null
    }

    const node = createNode(parent, {
      draw: (ctx: Context2D) => {
        const sk = unref(props.skeleton) as Skeleton | null
        const at = unref(props.atlas) as SpineAtlas | null
        const img = unref(props.atlasImg) as HTMLImageElement | null
        if (!sk || !at || !img) return

        // Apply animation prop to state
        const st = unref(props.state) as AnimationState | null
        const animName = unref(props.animation) as string | undefined
        if (st && animName && st.animationNames.includes(animName)) {
          if (st.currentAnimation !== animName) {
            const loop = unref(props.loop) !== false
            st.setAnimation(animName, loop)
          }
        }

        // Surface animation lifecycle + event-timeline callbacks.
        if (st) {
          st.onEvent = unref(props.onEvent) ?? undefined
          st.onStart = unref(props.onStart) ?? undefined
          st.onComplete = unref(props.onComplete) ?? undefined
        }

        // Apply skin prop
        const skinName = unref(props.skin) as string | undefined
        if (skinName && sk.data.skins.some(s => s.name === skinName)) {
          if (skinName !== sk.skin) {
            sk.skin = skinName
          }
        }

        const width = unref(props.width) as number
        const height = unref(props.height) as number

        // The canvas-level camera (RenderContext.camera) applies plain
        // pan/zoom — no axis flip (that is the drawn content's business).
        // Spine is a Y-up world against a Y-down canvas, so the component
        // applies its own flip here, exactly like the WebGL projection does:
        //   screen = translate(W/2,H/2) ∘ scale(Z,-Z) ∘ translate(-cx,-cy)
        // with cx/cy = camera pan (world point at the screen center). The
        // backdrop is painted BEFORE the flip in plain screen coordinates.
        const cam = resolveCamera()
        const Z = cam?.zoom ?? 1
        const CX = cam?.x ?? 0
        const CY = cam?.y ?? 0

        const bg = unref(props.bg) as string | null | undefined
        if (bg) {
          ctx.fillStyle = bg
          ctx.fillRect(0, 0, width, height)
        }

        // Save BEFORE the camera transform — the matching restore at the end
        // of this draw must reset the transform, otherwise the pan/zoom/flip
        // leaks and ACCUMULATES across frames (visual: repeated flipped
        // half-scale copies marching to the right).
        ctx.save()

        ctx.translate(width / 2, height / 2)
        // Spine is Y-up; canvas is Y-down.
        ctx.scale(Z, -Z)
        ctx.translate(-CX, -CY)

        // Overdraw (screen px) meant to hide the anti-aliased clip seam between
        // adjacent triangles. Measured: 0 is best.
        const expandWorld = 0

        // Draw every attachment once. The canvas itself stays transparent — the
        // background is supplied by CSS on the host element (see viewer.tsx).
        // Because the canvas is transparent, the anti-aliased clip seams blend
        // with neighbouring texture (or the page background), never with a solid
        // dark fill, so the dark block-boundary seams disappear.
        //
        // Use drawOrder (not slots) to respect the draworder timeline which
        // reorders slots for correct layering (e.g. inner skirt behind outer).
        // Multi-page atlas: page file name → image. Regions reference their
        // page by name; sampling a page-2 region from the primary image paints
        // wrong texels (faces vanish on c103/c094).
        const pageImgs = unref(props.atlasImgs) as Map<string, HTMLImageElement> | null
        const imgForRegion = (regionName: string): HTMLImageElement | ImageBitmap => {
          if (pageImgs) {
            const region = (at as SpineAtlas).regions[regionName]
            const pageImg = region ? pageImgs.get(region.page) : undefined
            if (pageImg) return pageImg
          }
          return img
        }

        for (const slot of sk.drawOrder) {
          const attName = slot.attachment
          if (!attName) continue
          const att = sk.findAttachment(slot.data.name, attName)
          if (!att) continue
          const geo = computeAttachmentWorld(att, slot, sk, at, attName)
          if (!geo) continue

          // Apply slot color/alpha from the color timeline. Spine stores
          // colors as "RRGGBBAA" hex. The alpha controls slot visibility;
          // without this, shadows and fades jump instantly (step function)
          // instead of transitioning smoothly.
          const sc = slot.color || 'FFFFFFFF'
          const slotAlpha = parseInt(sc.slice(6, 8), 16) / 255
          const prevAlpha = ctx.globalAlpha
          ctx.globalAlpha = slotAlpha

          // Spine blend modes: additive (lighter), multiply, screen.
          // Without this, smoke/aura/glow effects that use additive blending
          // render as opaque layers that compound alpha → visible banding.
          const blendMode = slot.data.blend ?? 'normal'
          const prevBlend = ctx.globalCompositeOperation
          if (blendMode === 'additive') {
            ctx.globalCompositeOperation = 'lighter'
          } else if (blendMode === 'multiply') {
            ctx.globalCompositeOperation = 'multiply'
          } else if (blendMode === 'screen') {
            ctx.globalCompositeOperation = 'screen'
          }

          // Pick the image for THIS attachment's atlas page (multi-page).
          const regionName = (att as { path?: string; name?: string }).path ?? (att as { name?: string }).name ?? attName
          drawTexturedTriangles(ctx, geo.world, geo.uvs, geo.triangles, imgForRegion(regionName), expandWorld)

          ctx.globalCompositeOperation = prevBlend
          ctx.globalAlpha = prevAlpha
        }

        if (unref(props.showBones)) {
          // Bones are 1px in world units (the camera's zoom scales them on
          // screen, since the canvas-level camera is applied outside).
          ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(120, 170, 255, 0.35)'
          ctx.beginPath()
          for (const bone of sk.bones) {
            const len = bone.data.length ?? 0
            ctx.moveTo(bone.worldX, bone.worldY)
            ctx.lineTo(bone.a * len + bone.worldX, bone.c * len + bone.worldY)
          }
          ctx.stroke()
        }

        ctx.restore()
      },
      // Always the hit target across the whole canvas so pointer events reach
      // the skeleton; onClick/onPick receive null when nothing is hit.
      hit: () => true,
      on: {
        click: (e) => {
          const hit = pickAt(e.x, e.y)
          unref(props.onClick)?.(hit)
        },
        pointerdown: (e) => {
          const hit = pickAt(e.x, e.y)
          unref(props.onPick)?.(hit)
        }
      } satisfies CanvasEventHandlers,
      deps: () => [
        unref(props.skeleton),
        unref(props.atlas),
        unref(props.atlasImg),
        unref(props.state),
        unref(props.animation),
        unref(props.skin),
        unref(props.showBones),
        unref(props.frame),
        unref(props.width),
        unref(props.height)
      ]    })
    return () => node.remove()
  }
})
