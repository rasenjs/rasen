/**
 * Billboard component — a textured quad that always faces the camera.
 *
 * Classic 2.5D trick: sprites (characters, coins) are rendered as camera-
 * facing quads so 2D pixel art reads naturally inside a 3D scene. This also
 * means the EXACT SAME sprite frames the 2D view animates (Mario walk/jump,
 * goomba walk, coin spin) can drive the 3D view — one reactive source.
 *
 * Implementation: the quad's transform uses the camera view matrix's 3x3
 * rotation (so its +Z normal points at the camera) followed by a translate,
 * submitted straight to the BatchRenderer.
 */

import type { Component3D } from '../../../node'
import type { MaybeRef, CommonDrawProps } from '../../../types'
import { unref, createTexture, type BitmapSource } from '../../../utils'
import { getRenderContext } from '../../../render-context'
import { element } from '../../element'

export interface BillboardProps extends CommonDrawProps {
  x?: MaybeRef<number>
  y?: MaybeRef<number>
  z?: MaybeRef<number>
  width: MaybeRef<number>
  height: MaybeRef<number>
  /** Sprite frame (a cropped canvas/image). Required. */
  texture: MaybeRef<BitmapSource>
  /** Horizontal flip (mirror). */
  scaleX?: MaybeRef<number>
  /**
   * 'vertical' (default) keeps the sprite UPRIGHT — it only rotates around
   * the world-Y axis to face the camera, so characters stand straight on the
   * ground even from a tilted third-person camera.
   * 'full' orients the quad to fully face the camera (classic billboard).
   */
  mode?: 'vertical' | 'full'
}

// Full-texture quad UVs, expanded to 2 triangles.
// NOTE: after texImage2D the texture's v=0 maps to the TOP of the source
// canvas, so world-top (y=+h/2) must use v=0 and world-bottom v=1 —
// otherwise the sprite renders vertically flipped.
const QUAD_UV = new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0])

/**
 * Billboard — camera-facing sprite quad.
 *
 * @example
 * ```tsx
 * <billboard x={100} y={0} z={0} width={16} height={16} texture={marioFrame} />
 * ```
 */
export const billboard: Component3D<BillboardProps> = (props: BillboardProps) => {
  let cachedVerts: Float32Array | null = null
  let cachedW: number | null = null
  let cachedH: number | null = null
  let cachedFlip: number | null = null

  return element({
    getBounds: () => null, // 3D — full redraw

    draw: (gl) => {
      const width = unref(props.width)
      const height = unref(props.height)
      const textureSource = unref(props.texture)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1
      const scaleX = unref(props.scaleX) ?? 1

      const x = unref(props.x) ?? 0
      const y = unref(props.y) ?? 0
      const z = unref(props.z) ?? 0

      if (!visible || opacity <= 0 || !textureSource) return

      const renderContext = getRenderContext(gl)
      const batch = renderContext.getBatchRenderer()
      if (!batch) return

      const transform = renderContext.getCurrentTransform()
      const color = { r: 1, g: 1, b: 1, a: opacity * transform.opacity }

      if (!cachedVerts || cachedW !== width || cachedH !== height || cachedFlip !== scaleX) {
        const hw = (width / 2) * scaleX
        const hh = height / 2
        cachedVerts = new Float32Array([
          -hw, -hh, 0, hw, -hh, 0, hw, hh, 0,
          -hw, -hh, 0, hw, hh, 0, -hw, hh, 0,
        ])
        cachedW = width
        cachedH = height
        cachedFlip = scaleX
      }

      const texture = createTexture(gl, textureSource)

      const view = renderContext.getViewMatrix().source

      // Billboard transform: camera rotation (from the view matrix) + translate.
      // The quad's +Z normal is therefore pointed at the camera.
      let mat: number[]
      if ((unref(props.mode) ?? 'vertical') === 'vertical') {
        // Upright billboard: only rotate around world-Y so the sprite stands
        // straight (its +Y stays world-up) while facing the camera.
        const viewZx = view[8]
        const viewZz = view[10]
        let hx = viewZx
        let hz = viewZz
        const hl = Math.hypot(hx, hz)
        if (hl > 1e-6) {
          hx /= hl
          hz /= hl
        }
        // X = cross(up, forward_h) = (hz, 0, -hx); Z = cross(X, up) = (hx, 0, hz)
        mat = [
          hz, 0, -hx, 0,
          0, 1, 0, 0,
          hx, 0, hz, 0,
          x, y, z, 1,
        ]
      } else {
        // Full billboard: use the view matrix's 3x3 rotation
        mat = [
          view[0], view[1], view[2], 0,
          view[4], view[5], view[6], 0,
          view[8], view[9], view[10], 0,
          x, y, z, 1,
        ]
      }

      batch.addShape(cachedVerts, color, mat, QUAD_UV, texture)
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.z),
      unref(props.width),
      unref(props.height),
      unref(props.texture),
      unref(props.visible),
      unref(props.opacity),
      unref(props.scaleX),
    ],
  })
}
