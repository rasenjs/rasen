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

import { com, getReactiveRuntime, type Mountable, type Ref } from '@rasenjs/core'
import type { GlNode } from '../../../node'
import { Mat4x4f, Vec3f, vec3f, forwardVector } from '@rasenjs/math'
import type { MaybeRef } from '../../../types'
import { unref } from '../../../utils'
import { ensureRenderContext, canvasAspect } from './camera'

// forwardVector / rightVector moved to @rasenjs/math (pure math, host-agnostic);
// re-exported here for backwards compatibility.
export { forwardVector, rightVector } from '@rasenjs/math'

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
        rc.requestRedraw()
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

// ── Look 状态机（纯逻辑，零事件 API）────────────────────────────────
//
// 视角控制的本质是「delta → yaw/pitch 推进 + 俯仰限位」，与输入来源无关：
// pointer-lock 的 movementX/Y、拖拽的 clientX 差值、手柄摇杆、触屏滑动，
// 最终都归结为一次 applyDelta。DOM 绑定（pointerlockchange/mousemove 监听）
// 属于宿主适配器（@rasenjs/dom），不在此处。

/** Look 状态机驱动的响应式 refs（标准 Rasen opaque Ref）。 */
export interface LookRefs {
  /** Rotation around world +Y in radians. */
  yaw: Ref<number>
  /** Pitch around the camera right axis in radians. */
  pitch: Ref<number>
}

export interface LookControls {
  /** Apply a look delta (pointer movement or drag distance), then clamp pitch. */
  applyDelta(dx: number, dy: number): void
  /** Clamp pitch into [-limit, +limit]. */
  clampPitch(): void
}

const LOOK_SENSITIVITY = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.01

/**
 * Create the pure look state machine for a FirstPersonCamera.
 *
 * Host-agnostic: reads/writes go through the runtime's unref/setValue
 * (opaque Ref contract — never `.value`), and never touches events/DOM —
 * the host adapter feeds it.
 */
export function createLookControls(
  refs: LookRefs,
  opts?: { sensitivity?: number; pitchLimit?: number },
): LookControls {
  const sensitivity = opts?.sensitivity ?? LOOK_SENSITIVITY
  const limit = opts?.pitchLimit ?? PITCH_LIMIT

  const clampPitch = () => {
    getReactiveRuntime().setValue(refs.pitch, Math.max(-limit, Math.min(limit, unref(refs.pitch))))
  }

  return {
    applyDelta(dx, dy) {
      getReactiveRuntime().setValue(refs.yaw, unref(refs.yaw) + dx * sensitivity)
      getReactiveRuntime().setValue(refs.pitch, unref(refs.pitch) - dy * sensitivity)
      clampPitch()
    },
    clampPitch,
  }
}
