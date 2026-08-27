/**
 * Player — first-person controller with voxel AABB collision.
 *
 * `pos` is the player's *feet* position; the camera eye sits 1.62 above it.
 * Movement is derived from yaw (horizontal forward/right) with smooth velocity
 * (exponential approach), gravity, jumping and per-axis collision against the
 * voxel world (the classic Minecraft-style sweep).
 */

import { computed, ref } from '@rasenjs/reactive-signals'
import type { Ref } from '@rasenjs/core'
import { aabb, overlapsAabb, type Aabb } from '@rasenjs/math'
import { forwardVector, rightVector } from '@rasenjs/webgl'
import type { World } from './world'

const HALF_WIDTH = 0.3
const HEIGHT = 1.8
const EYE_HEIGHT = 1.62
const WALK_SPEED = 4.3
const SPRINT_SPEED = 6.8
const JUMP_SPEED = 8.6
const GRAVITY = 24
const ACCEL = 12

export class Player {
  /** Feet position (block center convention for the world). */
  readonly pos = ref({ x: 0, y: 0, z: 0 })
  readonly yaw = ref(0)
  readonly pitch = ref(0)
  /** Camera eye position (feet + eye height). */
  readonly eye: Ref<{ x: number; y: number; z: number }>

  private vel = { x: 0, y: 0, z: 0 }
  private onGround = false

  constructor() {
    this.eye = computed(() => {
      const p = this.pos.value
      return { x: p.x, y: p.y + EYE_HEIGHT, z: p.z }
    })
  }

  /** Drop the player onto the terrain at (x, z). */
  spawn(world: World, x: number, z: number): void {
    const y = world.heightAt(Math.floor(x), Math.floor(z)) + 2
    this.pos.value = { x, y, z }
    this.vel = { x: 0, y: 0, z: 0 }
    this.onGround = false
  }

  /** The player's collision box at feet position (x, y, z). */
  private boxAt(x: number, y: number, z: number): Aabb {
    return aabb(
      x - HALF_WIDTH, y, z - HALF_WIDTH,
      x + HALF_WIDTH, y + HEIGHT, z + HALF_WIDTH,
    )
  }

  /** Does the player's collision box overlap the block at integer (x, y, z)? */
  occupies(x: number, y: number, z: number): boolean {
    const p = this.pos.value
    // block spans [x-0.5, x+0.5]
    return overlapsAabb(this.boxAt(p.x, p.y, p.z), aabb(x - 0.5, y - 0.5, z - 0.5, x + 0.5, y + 0.5, z + 0.5))
  }

  /** Axis-aligned collision: is the player's box at (x, y, z) inside a solid block? */
  private collides(world: World, x: number, y: number, z: number): boolean {
    const box = this.boxAt(x, y, z)
    for (let bx = Math.floor(box.minX); bx <= Math.floor(box.maxX); bx++) {
      for (let by = Math.floor(box.minY); by <= Math.floor(box.maxY); by++) {
        for (let bz = Math.floor(box.minZ); bz <= Math.floor(box.maxZ); bz++) {
          // block bx spans [bx-0.5, bx+0.5]; skip cells not strictly overlapping
          // (touching a face is NOT a collision — standing on a block is fine)
          if (!overlapsAabb(box, aabb(bx - 0.5, by - 0.5, bz - 0.5, bx + 0.5, by + 0.5, bz + 0.5))) continue
          if (world.isSolid(world.getBlock(bx, by, bz))) return true
        }
      }
    }
    return false
  }

  update(dt: number, world: World, keys: Set<string>): void {
    const y = this.yaw.value

    // Horizontal move direction from WASD (yaw only, pitch ignored).
    const fwd = forwardVector(y, 0)
    const right = rightVector(y)
    let mx = 0
    let mz = 0
    if (keys.has('KeyW')) { mx += fwd.x; mz += fwd.z }
    if (keys.has('KeyS')) { mx -= fwd.x; mz -= fwd.z }
    if (keys.has('KeyA')) { mx -= right.x; mz -= right.z }
    if (keys.has('KeyD')) { mx += right.x; mz += right.z }
    const len = Math.hypot(mx, mz)
    if (len > 0) {
      mx /= len
      mz /= len
    }

    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED
    const k = 1 - Math.exp(-ACCEL * dt)
    this.vel.x += (mx * speed - this.vel.x) * k
    this.vel.z += (mz * speed - this.vel.z) * k

    // Jump
    if (keys.has('Space') && this.onGround) {
      this.vel.y = JUMP_SPEED
      this.onGround = false
    }

    // Gravity
    this.vel.y -= GRAVITY * dt

    // Integrate per-axis with collision resolution.
    const p = this.pos.value
    let nx = p.x + this.vel.x * dt
    if (this.collides(world, nx, p.y, p.z)) {
      nx = p.x
      this.vel.x = 0
    }

    let nz = p.z + this.vel.z * dt
    if (this.collides(world, nx, p.y, nz)) {
      nz = p.z
      this.vel.z = 0
    }

    let ny = p.y + this.vel.y * dt
    if (this.collides(world, nx, ny, nz)) {
      if (this.vel.y < 0) {
        // landing — snap the feet onto the surface below
        this.onGround = true
        ny = Math.floor(ny) + 0.5
      } else if (this.vel.y > 0) {
        // bumped head — snap to the block bottom above
        ny = Math.ceil(ny) - 0.5
      } else {
        ny = p.y
      }
      this.vel.y = 0
    } else {
      this.onGround = false
    }

    this.pos.value = { x: nx, y: ny, z: nz }
  }
}
