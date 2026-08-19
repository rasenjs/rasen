/**
 * Box component — 3D cube primitive (Rasen 3D roadmap: Phase 1.2).
 *
 * Renders an axis-aligned cube with `width × height × depth` centered on its
 * local origin, then placed at `(x, y, z)` and transformed by the enclosing
 * `group` hierarchy — exactly the same model as the 2D `rect` component.
 *
 * Per-face shading is computed on the CPU (fixed light direction) so the
 * cube reads as a solid 3D object with the existing flat-color shader —
 * no extra shader / lighting pipeline required. Depth testing is enabled by
 * the 3D camera components (PerspectiveCamera / OrthographicCamera).
 */

import type { SyncComponent } from '@rasenjs/core'
import type { MaybeRef, CommonDrawProps, TransformProps } from '../../../types'
import { unref, parseColor, createTexture } from '../../../utils'
import { getRenderContext } from '../../../render-context'
import { element } from '../../element'

export interface BoxProps extends CommonDrawProps, TransformProps {
  x?: MaybeRef<number>
  y?: MaybeRef<number>
  z?: MaybeRef<number>
  width: MaybeRef<number>
  height: MaybeRef<number>
  depth: MaybeRef<number>
  /** Base color; per-face brightness is derived from it automatically. */
  fill?: MaybeRef<string>
  /**
   * Optional texture (TexImageSource, e.g. a cropped sprite tile). When
   * set, it is sampled on every face and `fill` acts as a tint (default white).
   */
  texture?: MaybeRef<TexImageSource>
}

interface Face {
  normal: [number, number, number]
  /** 4 corners (CCW seen from outside) as [x, y, z] triples. */
  corners: Array<[number, number, number]>
}

// Six faces of a unit cube, centered on origin, in [-0.5, 0.5]³
const FACES: Face[] = [
  { normal: [1, 0, 0], corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { normal: [-1, 0, 0], corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: [0, 1, 0], corners: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, -1, 0], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: [0, 0, 1], corners: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, 0, -1], corners: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
]

// Fixed light direction (from upper-left-back) for per-face shading
const LIGHT: [number, number, number] = [-0.5, -0.7, -0.5]
const LIGHT_LEN = Math.sqrt(LIGHT[0] ** 2 + LIGHT[1] ** 2 + LIGHT[2] ** 2)
// Brightness range per face: [AMBIENT, 1.0] — higher ambient keeps colors vivid
const AMBIENT = 0.62

function faceBrightness(n: [number, number, number]): number {
  const dot = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / LIGHT_LEN
  const diffuse = Math.max(0, dot)
  return AMBIENT + (1 - AMBIENT) * diffuse
}

// UVs for a full-texture quad: (0,0)(1,0)(1,1)(0,1), expanded to 2 triangles
const QUAD_UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1])

/** Expand a quad (4 corners) into two triangles (6 vertices), scaled to size. */
function quadToTriangles(
  corners: Array<[number, number, number]>,
  w: number,
  h: number,
  d: number,
): Float32Array {
  const hx = w / 2, hy = h / 2, hz = d / 2
  const v = corners.map(([x, y, z]) => [x * hx, y * hy, z * hz] as [number, number, number])
  // two triangles: (0,1,2) and (0,2,3)
  return new Float32Array([
    ...v[0], ...v[1], ...v[2],
    ...v[0], ...v[2], ...v[3],
  ])
}

/**
 * Box component — renders a 3D cube.
 *
 * @example
 * ```tsx
 * <box x={100} y={0} z={-50} width={32} height={32} depth={32} fill="#e33" />
 * ```
 */
export const box: SyncComponent<
  WebGLRenderingContext | WebGL2RenderingContext,
  [BoxProps]
> = (props: BoxProps) => {
  let cachedFaces: Array<{ vertices: Float32Array; brightness: number }> | null = null
  let cachedW: number | null = null
  let cachedH: number | null = null
  let cachedD: number | null = null

  return element({
    getBounds: () => null, // 3D — always full redraw (depth/camera dependent)

    draw: (gl) => {
      const width = unref(props.width)
      const height = unref(props.height)
      const depth = unref(props.depth)
      const fill = unref(props.fill)
      const textureSource = unref(props.texture)
      const visible = unref(props.visible) ?? true
      const opacity = unref(props.opacity) ?? 1

      const x = unref(props.x) ?? 0
      const y = unref(props.y) ?? 0
      const z = unref(props.z) ?? 0
      const rotationX = unref(props.rotationX) ?? 0
      const rotationY = unref(props.rotationY) ?? 0
      const rotation = unref(props.rotation) ?? 0
      const scaleX = unref(props.scaleX) ?? 1
      const scaleY = unref(props.scaleY) ?? 1
      const scaleZ = unref(props.scaleZ) ?? 1

      if (!visible || opacity <= 0) return
      if (!fill && !textureSource) return

      if (
        !cachedFaces || cachedW !== width || cachedH !== height || cachedD !== depth
      ) {
        cachedFaces = FACES.map((face) => ({
          vertices: quadToTriangles(face.corners, width, height, depth),
          brightness: faceBrightness(face.normal),
        }))
        cachedW = width
        cachedH = height
        cachedD = depth
      }

      const renderContext = getRenderContext(gl)
      const transform = renderContext.getCurrentTransform()

      // Tint (defaults to white when only a texture is provided)
      const color = fill ? parseColor(fill) : { r: 1, g: 1, b: 1, a: 1 }
      color.a *= opacity * transform.opacity

      // Upload (cached) WebGL texture when provided
      const texture = textureSource ? createTexture(gl, textureSource) : null

      // Compose with the enclosing group transform (same as rect)
      const finalTransform = {
        tx: transform.tx + x * transform.scaleX,
        ty: transform.ty + y * transform.scaleY,
        tz: transform.tz + z * transform.scaleZ,
        rotationX: transform.rotationX + rotationX,
        rotationY: transform.rotationY + rotationY,
        rotationZ: transform.rotationZ + rotation,
        scaleX: transform.scaleX * scaleX,
        scaleY: transform.scaleY * scaleY,
        scaleZ: transform.scaleZ * scaleZ,
      }

      for (let i = 0; i < cachedFaces.length; i++) {
        const face = cachedFaces[i]
        const faceColor = { ...color }
        faceColor.r *= face.brightness
        faceColor.g *= face.brightness
        faceColor.b *= face.brightness
        renderContext.addShape(
          `box-${width}-${height}-${depth}-f${i}`,
          face.vertices,
          faceColor,
          finalTransform,
          QUAD_UV,
          texture,
        )
      }
    },

    deps: () => [
      unref(props.x),
      unref(props.y),
      unref(props.z),
      unref(props.width),
      unref(props.height),
      unref(props.depth),
      unref(props.fill),
      unref(props.texture),
      unref(props.visible),
      unref(props.opacity),
      unref(props.rotation),
      unref(props.rotationX),
      unref(props.rotationY),
      unref(props.scaleX),
      unref(props.scaleY),
      unref(props.scaleZ),
    ],
  })
}
