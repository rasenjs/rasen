/**
 * Weapon — first-person weapon mesh that follows the camera.
 *
 * Uses rasen's element() pattern. Builds the full camera-space→world
 * transform matrix manually so the weapon tracks yaw AND pitch correctly
 * (no gimbal issues from fixed rotation order).
 */

import type { LoadedGLTF } from '@rasenjs/gfx'
import { createTexture, getRenderContext, element, unref } from '@rasenjs/gfx'
import { Mat4x4f } from '@rasenjs/math'
import type { Player } from './player'

export interface WeaponProps {
  player: Player
  geometry: LoadedGLTF
  /** Recoil offset (0 = rest, >0 = kicked back toward camera). */
  recoil?: { value: number }
  /** Muzzle flash visibility (true while firing). */
  muzzleFlash?: { value: boolean }
  /** burst.png texture for the muzzle flash sprite. */
  burstTexture?: TexImageSource
}

// Muzzle flash quad (burst.png is 256×256; Godot muzzle scale 0.4–0.75).
const MUZZLE_SIZE = 0.9
const MUZZLE_VERTS = new Float32Array([
  -MUZZLE_SIZE / 2, -MUZZLE_SIZE / 2, 0, MUZZLE_SIZE / 2, -MUZZLE_SIZE / 2, 0, MUZZLE_SIZE / 2, MUZZLE_SIZE / 2, 0,
  -MUZZLE_SIZE / 2, -MUZZLE_SIZE / 2, 0, MUZZLE_SIZE / 2, MUZZLE_SIZE / 2, 0, -MUZZLE_SIZE / 2, MUZZLE_SIZE / 2, 0,
])
const MUZZLE_UV = new Float32Array([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0])

/**
 * Weapon component — renders a first-person weapon that follows the camera.
 *
 * @example
 * ```tsx
 * <weapon player={player} geometry={blasterGeo} />
 * ```
 */
export const weapon = (props: WeaponProps) => {
  const { geometry } = props

  return element({
    getBounds: () => null,

    draw: (gl) => {
      const renderContext = getRenderContext(gl)
      const batch = renderContext.getBatchRenderer()
      if (!batch) return

      const texture = createTexture(gl, geometry.texture!)
      const recoil = unref(props.recoil) ?? 0

      // Weapon world matrix = viewInverse · R_Y(π) · T(offset) · S
      // Using the inverse of the camera view matrix guarantees the weapon is
      // placed exactly in camera space — consistent with how the overlay
      // (weapon) camera sees it, so left/right/up/down are never flipped.
      // Godot blaster: Container.position = (1.2, -1, -2.75) in camera space
      // (right 1.2, up -1, forward 2.75 — OpenGL camera forward is -Z, so the
      // Z component is -2.75), rotation (0,180,0), scale 1.0.
      // Recoil adds +Z (toward camera) so the weapon visibly kicks back.
      const view = renderContext.getViewMatrix()
      // Order: S → R_Y(π) (rotate model) → T(offset) (place in camera space) → viewInverse.
      // (If T came before R_Y, the model would be rotated around the origin and
      //  end up BEHIND the camera — invisible.)
      const matrix = view.invert()
        .multiply(Mat4x4f.translate(1.2, -1, -2.75 + recoil))
        .multiply(Mat4x4f.rotateY(Math.PI))
        .multiply(Mat4x4f.scale(1.0, 1.0, 1.0))

      // Weapon IS lit (pass normals) so it has shading depth like the original
      // weapon camera — flat unlit weapon looks 2D.
      // Layer 2 → rendered by the overlay (weapon) camera.
      batch.addShape(geometry.vertices, { r: 1, g: 1, b: 1, a: 1 }, matrix, geometry.uv, texture, undefined, undefined, geometry.normals, 2)

      // Muzzle flash — burst sprite at the gun muzzle (Godot Muzzle at
      // (1.5, -0.75, -6) in CameraItem space, AnimatedSprite3D burst.png).
      const muzzleFlash = unref(props.muzzleFlash)
      const burstTexture = unref(props.burstTexture)
      if (muzzleFlash && burstTexture) {
        const burst = createTexture(gl, burstTexture)
        const muzzleMatrix = view.invert()
          .multiply(Mat4x4f.translate(1.5, -0.75, -6))
          .multiply(Mat4x4f.scale(1.0, 1.0, 1.0))
        batch.addShape(MUZZLE_VERTS, { r: 1, g: 1, b: 1, a: 1 }, muzzleMatrix, MUZZLE_UV, burst, undefined, undefined, undefined, 2)
      }
    },

    deps: () => [
      geometry,
      props.recoil,
      props.muzzleFlash,
      props.burstTexture,
    ],
  })
}
