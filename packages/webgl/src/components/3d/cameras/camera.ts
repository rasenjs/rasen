/**
 * Camera components — 3D view / projection (Rasen 3D roadmap: Phase 1.1).
 *
 * A camera is a reactive component: on mount it switches the RenderContext
 * into 3D mode, computes the view (lookAt) and projection matrices and pushes
 * them into the renderer. When any camera prop changes it recomputes and
 * forces a redraw. On unmount it restores 2D mode.
 *
 * @example
 * ```tsx
 * <PerspectiveCamera
 *   position={{ x: 0, y: 300, z: 500 }}
 *   target={{ x: 0, y: 0, z: 0 }}
 *   fov={Math.PI / 3}
 * />
 * ```
 */

import { com, getReactiveRuntime, type Mountable } from '@rasenjs/core'
import type { GlContext, GlNode } from '../../../node'
import { Mat4x4f, Vec3f, vec3f } from '@rasenjs/math'
import type { MaybeRef } from '../../../types'
import { unref } from '../../../utils'
import {
  getRenderContext,
  hasRenderContext,
  RenderContext,
} from '../../../render-context'

export interface CameraProps {
  /** Eye position. */
  position?: MaybeRef<{ x: number; y: number; z: number } | Vec3f>
  /** Look-at target. */
  target?: MaybeRef<{ x: number; y: number; z: number } | Vec3f>
  /** Up vector (defaults to +Y). */
  up?: MaybeRef<{ x: number; y: number; z: number } | Vec3f>
  near?: MaybeRef<number>
  far?: MaybeRef<number>
}

export interface PerspectiveCameraProps extends CameraProps {
  /** Vertical field of view in radians (default π/3). */
  fov?: MaybeRef<number>
  /** Aspect ratio (defaults to the canvas logical aspect). */
  aspect?: MaybeRef<number>
}

export interface OrthographicCameraProps extends CameraProps {
  left?: MaybeRef<number>
  right?: MaybeRef<number>
  bottom?: MaybeRef<number>
  top?: MaybeRef<number>
}

function toVec3(v: { x: number; y: number; z: number } | Vec3f): Vec3f {
  return v instanceof Vec3f ? v : vec3f(v.x, v.y, v.z)
}

export function canvasAspect(gl: GlContext): number {
  const w = gl.canvas.width
  const h = gl.canvas.height
  return h > 0 ? w / h : 1
}

export function ensureRenderContext(
  gl: GlContext,
  rcOptions?: import('../../../node').GlNode['rcOptions'],
): RenderContext {
  if (!hasRenderContext(gl)) {
    // 配置由桥接方（dom <canvas>）经 node.rcOptions 注入；此处仅兜底默认值
    new RenderContext(gl, rcOptions)
  }
  return getRenderContext(gl)
}

/**
 * PerspectiveCamera — 3D view with a perspective projection.
 */
export const PerspectiveCamera = com(
  (props: PerspectiveCameraProps): Mountable<GlNode> => {
    return (node) => {
      const gl = node.ctx
      const rc = ensureRenderContext(gl, node.rcOptions)
      rc.enableDepth()

      const apply = () => {
        const fov = unref(props.fov) ?? Math.PI / 3
        const aspect = unref(props.aspect) ?? canvasAspect(gl)
        const near = unref(props.near) ?? 0.1
        const far = unref(props.far) ?? 2000
        const eye = toVec3(unref(props.position) ?? { x: 0, y: 0, z: 10 })
        const target = toVec3(unref(props.target) ?? { x: 0, y: 0, z: 0 })
        const up = toVec3(unref(props.up) ?? { x: 0, y: 1, z: 0 })

        rc.setProjectionMatrix(Mat4x4f.perspective(fov, aspect, near, far))
        rc.setViewMatrix(Mat4x4f.lookAt(eye, target, up))
        rc.manualUpdate()
      }
      apply()

      const runtime = getReactiveRuntime()
      const stopWatch = runtime.subscribe(
        () => {
          const p = unref(props.position)
          const t = unref(props.target)
          const u = unref(props.up)
          return [
            unref(props.fov),
            unref(props.aspect),
            unref(props.near),
            unref(props.far),
            p ? p.x : 0, p ? p.y : 0, p ? p.z : 0,
            t ? t.x : 0, t ? t.y : 0, t ? t.z : 0,
            u ? u.x : 0, u ? u.y : 0, u ? u.z : 0,
          ]
        },
        apply,
      )

      return () => {
        stopWatch()
        rc.disableDepth()
      }
    }
  },
)

/**
 * OrthographicCamera — 3D view with an orthographic projection.
 */
export const OrthographicCamera = com(
  (props: OrthographicCameraProps): Mountable<GlNode> => {
    return (node) => {
      const gl = node.ctx
      const rc = ensureRenderContext(gl, node.rcOptions)
      rc.enableDepth()

      const apply = () => {
        const near = unref(props.near) ?? -1000
        const far = unref(props.far) ?? 2000
        const eye = toVec3(unref(props.position) ?? { x: 0, y: 0, z: 100 })
        const target = toVec3(unref(props.target) ?? { x: 0, y: 0, z: 0 })
        const up = toVec3(unref(props.up) ?? { x: 0, y: 1, z: 0 })

        const left = unref(props.left) ?? -100
        const right = unref(props.right) ?? 100
        const bottom = unref(props.bottom) ?? -100
        const top = unref(props.top) ?? 100
        rc.setProjectionMatrix(Mat4x4f.ortho(left, right, bottom, top, near, far))
        rc.setViewMatrix(Mat4x4f.lookAt(eye, target, up))
        rc.manualUpdate()
      }
      apply()

      const runtime = getReactiveRuntime()
      const stopWatch = runtime.subscribe(
        () => {
          const p = unref(props.position)
          const t = unref(props.target)
          const u = unref(props.up)
          return [
            unref(props.near),
            unref(props.far),
            unref(props.left),
            unref(props.right),
            unref(props.bottom),
            unref(props.top),
            p ? p.x : 0, p ? p.y : 0, p ? p.z : 0,
            t ? t.x : 0, t ? t.y : 0, t ? t.z : 0,
            u ? u.x : 0, u ? u.y : 0, u ? u.z : 0,
          ]
        },
        apply,
      )

      return () => {
        stopWatch()
        rc.disableDepth()
      }
    }
  },
)
