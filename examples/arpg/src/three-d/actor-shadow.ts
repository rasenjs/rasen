/**
 * The contact shadow under a 3D actor.
 *
 * The retail game draws a shadow under every character — the 2D sheets carry
 * one, and the 3D actors need the same cue, or they read as floating over
 * the ground. What the reference client does is real shadow mapping: its
 * frame is "UI pass -> about 40 passes of shadows / depth / lighting"
 * (`.d2r-ref/dm_gfx_nvn_nvn_mtl.m`), and the Metal replay layer recognises
 * a shadow map as a square render target carrying only a depth attachment
 * ("Render passes with only depth-stencil attached (shadow maps etc.)").
 *
 * A shadow MAP cannot be used here: the 3D actors live in their own
 * transparent WebGL canvas over the 2D game canvas, so there is no ground
 * geometry for the map to be sampled onto — the ground is 2D, drawn in the
 * canvas below. What the overlay CAN do is draw the shadow itself, in the
 * overlay, on the ground plane, which is what this element does.
 *
 * ## The technique
 *
 * The shadow is the actor's own ground outline, swept along the sun's
 * ground direction:
 *
 * 1. The model's outline where it meets the floor (`./ground-outline.ts`):
 *    the convex hull of the vertices that touch the ground. For a character
 *    that is its stance — two feet, hip-width apart; for a brute it is one
 *    wide blob. The outline is the shadow's cross-section, so the shadow
 *    takes the actor's SHAPE instead of being a disc.
 * 2. The outline is swept by `height / tan(sun elevation)` along the sun's
 *    ground direction (`./lighting.ts`): the shadow of a vertical body on
 *    flat ground. A taller actor throws a longer shadow, and the sun's
 *    elevation decides how long.
 * 3. The result is drawn with a PENUMBRA: the outline is inset towards its
 *    own centre and the band between the two is drawn as a ramp, so the
 *    shadow has no hard polygon edge. Because the inset is a scale about
 *    the centre, the band is thin where the shadow touches the ground (the
 *    contact) and wide at its far end — which is how a real penumbra grows
 *    with the distance from the occluder.
 *
 * The density falls off along the shadow as well (the texture's second
 * axis), so the part under the feet is darkest.
 *
 * Everything is drawn through the batch path with a gradient texture: the
 * batch draws before the material pass, so the shadow lands UNDER the
 * actors, and the 2D canvas below shows through the shadow's transparency.
 */

import { element, unref, type GfxNode } from '@rasenjs/gfx'
import type { PropValue } from '@rasenjs/core'
import { Mat4x4f } from '@rasenjs/math'
import type { MergedOutline } from './ground-outline'
import { buildShadowMesh } from './shadow-shape'
import { SHADOW_DIRECTION, shadowReach } from './lighting'

/** Height above the ground, so the shadow does not fight the ground's depth. */
const LIFT = 0.02

/** The shadow's opacity where it touches the ground. */
const STRENGTH = 0.4

/**
 * The penumbra ramp the shadow's alpha rides on.
 *
 * The texture's V axis is the radial parameter (0 at the shadow's edge, 1 at
 * its core) and its U axis is the position along the shadow (0 at the
 * feet), so the alpha falls off towards the far end of the cast shadow.
 *
 * The rows are uploaded in order, and WebGL puts the first row at v = 0, so
 * the ramp starts transparent at the edge.
 */
const SHADOW_TEXTURE = (() => {
  const size = 64
  const bytes = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    const v = y / (size - 1)
    // Smoothstep: a soft penumbra without a visible band at its middle.
    const ramp = v * v * (3 - 2 * v)
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1)
      const density = 0.72 + 0.28 * (1 - u)
      const at = (y * size + x) * 4
      bytes[at] = 255
      bytes[at + 1] = 255
      bytes[at + 2] = 255
      bytes[at + 3] = Math.round(255 * ramp * density)
    }
  }
  return { width: size, height: size, bytes }
})()

/** The gradient texture's sampling: smooth, clamped (it is not tiled). */
const TEXTURE_OPTIONS = {
  wrapS: 0x2901, // gl.REPEAT
  wrapT: 0x812f, // gl.CLAMP_TO_EDGE
  minFilter: 0x2601, // gl.LINEAR
  magFilter: 0x2601, // gl.LINEAR
}

/** The largest outline the shadow's scratch buffers hold. */
const MAX_POINTS = 96

export interface ActorShadowProps {
  /** The actor's tile position (world units). */
  x: PropValue<number>
  z: PropValue<number>
  /** The shadow's radius, in world units — the actor's own size. */
  radius: PropValue<number>
  /** The actor's own scale (props carry it). */
  scale?: PropValue<number>
  /**
   * The actor's silhouette in model space, merged over its parts.
   *
   * Supplied by the actor layer, which owns both the shadow and the models. It
   * is NOT looked up by position: the shadow draws before the models, so a
   * position-keyed lookup missed on every frame a walker moved and the shadow
   * degraded to a disc.
   */
  outline?: PropValue<MergedOutline | null>
  /** Whether the shadow is drawn at all (a hidden actor has none). */
  visible?: PropValue<boolean>
}

export const ActorShadow = (props: ActorShadowProps) => {
  // Per-actor scratch, reused every frame: the shadow is rebuilt from the
  // outline on every redraw, and the game redraws every frame.
  const footprint = new Float32Array(MAX_POINTS * 2)
  const swept = new Float32Array(MAX_POINTS * 4)
  const outline = new Float32Array(MAX_POINTS * 4)
  // The mesh: the centre, the inset outline (the core's rim) and the
  // outline itself (the penumbra's outer edge).
  const vertices = new Float32Array((MAX_POINTS * 2 + 1) * 3)
  const uvs = new Float32Array((MAX_POINTS * 2 + 1) * 2)
  const indices = new Uint16Array(MAX_POINTS * 9)

  return element({
    getBounds: () => null,
    draw: (node: GfxNode) => {
      const visible = unref(props.visible) ?? true
      if (!visible) return
      const radius = unref(props.radius)
      const scale = unref(props.scale) ?? 1
      if (!(radius > 0) && scale <= 0) return

      // The actor's placement. The shadow is drawn in world space (the batch
      // does not apply the scene's transform stack to a shape), so the
      // outline is transformed here, exactly like the model itself is.
      const transform = node.getCurrentTransform()
      const matrix = Mat4x4f.identity()
        .multiply(Mat4x4f.translate(transform.tx, transform.ty, transform.tz))
        .multiply(Mat4x4f.rotateY(transform.rotationY))
        .multiply(Mat4x4f.scale(transform.scaleX, transform.scaleY, transform.scaleZ))

      // The outline the shadow is cut from: the model's own ground outline
      // when the model has published one, a disc of the actor's own width
      // otherwise (the first frame, before the model lands).
      const published = unref(props.outline) ?? null
      let pointCount = 0
      let height = 0
      if (published !== null && published.count >= 3) {
        const m = matrix.source
        for (let i = 0; i < published.count && i < MAX_POINTS; i += 1) {
          const x = published.points[i * 2]
          const z = published.points[i * 2 + 1]
          // The matrix is column-major (`source[col * 4 + row]`), and the
          // outline lies in the ground plane, so y is left out.
          footprint[i * 2] = m[0] * x + m[8] * z + m[12]
          footprint[i * 2 + 1] = m[2] * x + m[10] * z + m[14]
        }
        pointCount = Math.min(published.count, MAX_POINTS)
        height = published.top * transform.scaleY
      } else {
        // The fallback: a disc of the actor's own half width. The height is
        // unknown without the model, so the shadow keeps the actor's width
        // as its length — a placeholder that the real outline replaces on
        // the next frame.
        const segments = 12
        const r = radius * scale
        for (let i = 0; i < segments; i += 1) {
          const angle = (i / segments) * Math.PI * 2
          footprint[i * 2] = transform.tx + Math.cos(angle) * r
          footprint[i * 2 + 1] = transform.tz + Math.sin(angle) * r
        }
        pointCount = segments
        // A published height (the character's tallest part) is still known
        // when no part touches the floor: the shadow reaches as far as the
        // body is tall.
        height = published !== null ? published.top * transform.scaleY : radius * scale * 2
      }
      if (pointCount < 3) return

      // The shadow's shape: the footprint swept along the sun's ground
      // direction, with a penumbra band around the outline.
      const reach = shadowReach(height)
      const mesh = buildShadowMesh(
        footprint,
        pointCount,
        SHADOW_DIRECTION[0] * reach,
        SHADOW_DIRECTION[1] * reach,
        transform.tx,
        transform.tz,
          swept,
        outline,
        vertices,
        uvs,
        indices,
      )
      if (mesh.vertexCount === 0) return

      const texture = node.createTexture(SHADOW_TEXTURE, TEXTURE_OPTIONS)
      node.addShape(
        'actor-shadow',
        vertices.subarray(0, mesh.vertexCount * 3),
        { r: 0, g: 0, b: 0, a: STRENGTH },
        Mat4x4f.translate(0, LIFT, 0),
        uvs.subarray(0, mesh.vertexCount * 2),
        texture,
        undefined, // vertexColors
        true, // depthWrite
        undefined, // normals
        undefined, // layer
        // The shadow is pure black: the tonemap would only lift it.
        true, // skipTonemap
        false, // premultiplied
        'normal', // blendMode
        indices.subarray(0, mesh.indexCount),
        undefined, // translationOnly
        undefined, // packedColor
      )
    },
    deps: () => [
      unref(props.x),
      unref(props.z),
      unref(props.radius),
      unref(props.scale),
      unref(props.visible),
    ],
  })
}
