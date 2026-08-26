/**
 * FirstPersonCamera — 3D camera driven by yaw/pitch instead of a look-at
 * target (Rasen 3D roadmap: Phase 1.3).
 *
 * The standard camera for first-person / exploration scenes (walking, flying,
 * FPS-style controls). The eye `position`, `yaw` (rotation around world +Y)
 * and `pitch` (rotation around the camera's right axis) are all reactive —
 * drive them with plain refs from a game loop / pointer-lock input.
 *
 * Forward vector convention (right-handed, matches the rest of Rasen):
 *   yaw = 0, pitch = 0  →  looking down -Z
 *   yaw increases       →  turning counter-clockwise (to the right on screen)
 *
 * @example
 * ```tsx
 * <FirstPersonCamera
 *   position={pos}
 *   yaw={yaw}
 *   pitch={pitch}
 *   fov={Math.PI / 3}
 * />
 * ```
 */

import { com, getReactiveRuntime, type Mountable } from '@rasenjs/core'
import type { GlNode } from '../../../node'
import { Mat4x4f, Vec3f, vec3f } from '@rasenjs/math'
import type { MaybeRef } from '../../../types'
import { unref } from '../../../utils'
import { ensureRenderContext, canvasAspect } from './camera'

export interface FirstPersonCameraProps {
  /** Eye position. */
  position?: MaybeRef<{ x: number; y: number; z: number } | Vec3f>
  /** Yaw around world +Y in radians (0 = looking down -Z). */
  yaw?: MaybeRef<number>
  /** Pitch around the camera right axis in radians (0 = level). */
  pitch?: MaybeRef<number>
  /** Up vector (defaults to +Y). */
  up?: MaybeRef<{ x: number; y: number; z: number } | Vec3f>
  fov?: MaybeRef<number>
  /** Aspect ratio (defaults to the canvas logical aspect). */
  aspect?: MaybeRef<number>
  near?: MaybeRef<number>
  far?: MaybeRef<number>
}

/**
 * Unit forward vector for a yaw/pitch pair.
 *
 * @example
 * ```ts
 * const dir = forwardVector(yaw.value, pitch.value)
 * // move forward: pos += dir * speed
 * ```
 */
export function forwardVector(yaw: number, pitch: number): Vec3f {
  const cp = Math.cos(pitch)
  return vec3f(cp * Math.sin(yaw), Math.sin(pitch), -cp * Math.cos(yaw))
}

/**
 * Unit right vector (perpendicular to forward, flat on the XZ plane).
 * Useful for strafing.
 */
export function rightVector(yaw: number): Vec3f {
  return vec3f(Math.cos(yaw), 0, Math.sin(yaw))
}

function toVec3(v: { x: number; y: number; z: number } | Vec3f): Vec3f {
  return v instanceof Vec3f ? v : vec3f(v.x, v.y, v.z)
}

/**
 * FirstPersonCamera — reactive yaw/pitch first-person view.
 */
export const FirstPersonCamera = com(
  (props: FirstPersonCameraProps): Mountable<GlNode> => {
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
        const yaw = unref(props.yaw) ?? 0
        const pitch = unref(props.pitch) ?? 0
        const up = toVec3(unref(props.up) ?? { x: 0, y: 1, z: 0 })

        const fwd = forwardVector(yaw, pitch)
        const target = vec3f(eye.x + fwd.x, eye.y + fwd.y, eye.z + fwd.z)

        rc.setProjectionMatrix(Mat4x4f.perspective(fov, aspect, near, far))
        rc.setViewMatrix(Mat4x4f.lookAt(eye, target, up))
        rc.manualUpdate()
      }
      apply()

      const runtime = getReactiveRuntime()
      const stopWatch = runtime.subscribe(
        () => {
          const p = unref(props.position)
          const u = unref(props.up)
          return [
            unref(props.fov),
            unref(props.aspect),
            unref(props.near),
            unref(props.far),
            unref(props.yaw),
            unref(props.pitch),
            p ? p.x : 0, p ? p.y : 0, p ? p.z : 0,
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
