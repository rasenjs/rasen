/**
 * Player — first-person controller with shooting.
 *
 * WASD movement, gravity, AABB collision, pointer lock mouse look,
 * left-click to shoot rays, health system, weapon knockback, landing bounce.
 */

import { computed, ref } from '@rasenjs/reactive-signals'
import type { ReadonlyRef } from '@rasenjs/core'
import { aabb, overlapsAabb, type Aabb } from '@rasenjs/math'
import { forwardVector, rightVector } from '@rasenjs/webgl'
import type { Wall } from './level'

const HALF_WIDTH = 0.3
const HEIGHT = 1.8
const EYE_HEIGHT = 1.62
const MOVE_SPEED = 6
const JUMP_SPEED = 9
const GRAVITY = 24
const ACCEL = 12
const SHOOT_DISTANCE = 10

export interface Weapon {
  name: string
  damage: number
  cooldown: number
  spread: number
  shotCount: number
  /** Backward knockback velocity applied to the player on each shot. */
  knockback: number
  /** Camera pitch knockback range (radians) — Godot knockback.x. */
  minKnockbackPitch: number
  maxKnockbackPitch: number
  /** Camera yaw knockback range (radians) — Godot knockback.y (random sign). */
  minKnockbackYaw: number
  maxKnockbackYaw: number
  /** Raycast fire distance — Godot weapon.max_distance. */
  maxDistance: number
  color: string
}

// Weapons match Godot weapons/*.tres exactly.
// Blaster (blaster.tres): cooldown 0.25, spread 1.0, shot_count 3, knockback 40,
//   min_knockback (0.025,0.025), max_knockback (0.045,0.04), max_distance 10.
// Blaster Repeater (blaster-repeater.tres): damage 10, cooldown 0.1, spread 0.5,
//   shot_count 1, knockback 10, min_knockback (0.001,0.001), max_knockback
//   (0.0025,0.002), max_distance 10.
export const WEAPONS: Weapon[] = [
  { name: 'Blaster', damage: 25, cooldown: 0.25, spread: 1.0, shotCount: 3, knockback: 40, minKnockbackPitch: 0.025, maxKnockbackPitch: 0.045, minKnockbackYaw: 0.025, maxKnockbackYaw: 0.04, maxDistance: 10, color: '#fbbf24' },
  { name: 'Blaster Repeater', damage: 10, cooldown: 0.1, spread: 0.5, shotCount: 1, knockback: 10, minKnockbackPitch: 0.001, maxKnockbackPitch: 0.0025, minKnockbackYaw: 0.001, maxKnockbackYaw: 0.002, maxDistance: 10, color: '#60a5fa' },
]

export interface RayHit {
  x: number; y: number; z: number
  nx: number; ny: number; nz: number
}

export class Player {
  readonly pos = ref({ x: 0, y: 0, z: 0 })
  readonly yaw = ref(0)
  readonly pitch = ref(0)
  readonly health = ref(100)
  readonly maxHealth = 100
  readonly weaponIndex = ref(0)
  readonly lastShot = ref(0)
  readonly eye: ReadonlyRef<{ x: number; y: number; z: number }>
  readonly currentWeapon: ReadonlyRef<Weapon>

  private vel = { x: 0, y: 0, z: 0 }
  private onGround = false

  constructor() {
    this.eye = computed(() => {
      const p = this.pos.value
      return { x: p.x, y: p.y + EYE_HEIGHT, z: p.z }
    })
    this.currentWeapon = computed(() => WEAPONS[this.weaponIndex.value])
  }

  spawn(x: number, y: number, z: number) {
    this.pos.value = { x, y, z }
    this.vel = { x: 0, y: 0, z: 0 }
    this.health.value = this.maxHealth
  }

  damage(amount: number) {
    this.health.value = Math.max(0, this.health.value - amount)
  }

  private boxAt(x: number, y: number, z: number): Aabb {
    return aabb(x - HALF_WIDTH, y, z - HALF_WIDTH, x + HALF_WIDTH, y + HEIGHT, z + HALF_WIDTH)
  }

  private collides(walls: Wall[], x: number, y: number, z: number): boolean {
    const box = this.boxAt(x, y, z)
    for (const w of walls) {
      const wallBox = aabb(w.x - w.w / 2, w.y - w.h / 2, w.z - w.d / 2,
                           w.x + w.w / 2, w.y + w.h / 2, w.z + w.d / 2)
      if (overlapsAabb(box, wallBox)) return true
    }
    return false
  }

  /** Find the highest wall top that the player is standing on */
  private findWallTop(walls: Wall[], x: number, y: number, z: number): number {
    let bestTop = y
    const box = this.boxAt(x, y, z)
    for (const w of walls) {
      const wallTop = w.y + w.h / 2
      const wallBottom = w.y - w.h / 2
      if (wallTop <= y) continue // wall is entirely below us
      const wallBox = aabb(w.x - w.w / 2, wallBottom, w.z - w.d / 2,
                           w.x + w.w / 2, wallTop, w.z + w.d / 2)
      if (overlapsAabb(box, wallBox) && wallTop > bestTop) {
        bestTop = wallTop
      }
    }
    return bestTop
  }

  /** Find the lowest wall bottom that the player is hitting from below */
  private findWallBottom(walls: Wall[], x: number, y: number, z: number): number {
    let bestBottom = y + HEIGHT
    const box = this.boxAt(x, y, z)
    for (const w of walls) {
      const wallTop = w.y + w.h / 2
      const wallBottom = w.y - w.h / 2
      if (wallBottom >= y + HEIGHT) continue
      const wallBox = aabb(w.x - w.w / 2, wallBottom, w.z - w.d / 2,
                           w.x + w.w / 2, wallTop, w.z + w.d / 2)
      if (overlapsAabb(box, wallBox) && wallBottom < bestBottom) {
        bestBottom = wallBottom
      }
    }
    return bestBottom - HEIGHT
  }

  /** Shoot a ray and return the first wall hit point + normal. */
  shootRay(walls: Wall[]): RayHit | null {
    const eye = this.eye.value
    const dir = forwardVector(this.yaw.value, this.pitch.value)
    let closest: RayHit | null = null
    let minT = SHOOT_DISTANCE

    for (const w of walls) {
      const hit = rayBoxIntersect(eye, dir, w)
      if (hit && hit.t < minT) {
        minT = hit.t
        closest = { x: hit.x, y: hit.y, z: hit.z, nx: hit.nx, ny: hit.ny, nz: hit.nz }
      }
    }
    return closest
  }

  canShoot(now: number): boolean {
    const w = this.currentWeapon.value
    return now - this.lastShot.value >= w.cooldown
  }

  /**
   * Apply weapon knockback (matches Godot player.gd action_shoot):
   * - camera pitch kicks up (camera.rotation.x += knockback.x)
   * - yaw kicks sideways with a random sign (rotation.y += knockback.y)
   * - player is pushed backward (movement_velocity += (0,0,knockback))
   */
  applyKnockback(weapon: Weapon) {
    const kx = weapon.minKnockbackPitch + Math.random() * (weapon.maxKnockbackPitch - weapon.minKnockbackPitch)
    const ky = (weapon.minKnockbackYaw + Math.random() * (weapon.maxKnockbackYaw - weapon.minKnockbackYaw)) * (Math.random() < 0.5 ? -1 : 1)
    this.pitch.value += kx
    this.yaw.value += ky
    // Backward push — opposite of the facing direction (Godot local +Z = back).
    const y = this.yaw.value
    this.vel.x += -Math.sin(y) * weapon.knockback
    this.vel.z += Math.cos(y) * weapon.knockback
  }

  switchWeapon() {
    this.weaponIndex.value = (this.weaponIndex.value + 1) % WEAPONS.length
  }

  update(dt: number, walls: Wall[], keys: Set<string>) {
    const y = this.yaw.value
    const fwd = forwardVector(y, 0)
    const right = rightVector(y)
    let mx = 0; let mz = 0
    if (keys.has('KeyW')) { mx += fwd.x; mz += fwd.z }
    if (keys.has('KeyS')) { mx -= fwd.x; mz -= fwd.z }
    if (keys.has('KeyA')) { mx -= right.x; mz -= right.z }
    if (keys.has('KeyD')) { mx += right.x; mz += right.z }
    const len = Math.hypot(mx, mz)
    if (len > 0) { mx /= len; mz /= len }

    const k = 1 - Math.exp(-ACCEL * dt)
    this.vel.x += (mx * MOVE_SPEED - this.vel.x) * k
    this.vel.z += (mz * MOVE_SPEED - this.vel.z) * k

    if (keys.has('Space') && this.onGround) {
      this.vel.y = JUMP_SPEED
      this.onGround = false
    }
    this.vel.y -= GRAVITY * dt

    const p = this.pos.value
    let nx = p.x + this.vel.x * dt
    if (this.collides(walls, nx, p.y, p.z)) { nx = p.x; this.vel.x = 0 }
    let nz = p.z + this.vel.z * dt
    if (this.collides(walls, nx, p.y, nz)) { nz = p.z; this.vel.z = 0 }
    let ny = p.y + this.vel.y * dt
    if (this.collides(walls, nx, ny, nz)) {
      if (this.vel.y < 0) {
        // Snap to the highest wall top below the player
        const wallTop = this.findWallTop(walls, nx, ny, nz)
        ny = wallTop
        this.onGround = true
      } else if (this.vel.y > 0) {
        const wallBottom = this.findWallBottom(walls, nx, ny, nz)
        ny = wallBottom
      }
      this.vel.y = 0
    } else {
      this.onGround = false
    }

    // Fall respawn
    if (ny < -10) {
      this.spawn(0, 5, 0)
      return
    }

    this.pos.value = { x: nx, y: ny, z: nz }
  }
}

/** Ray-AABB intersection (slab method). */
export function rayBoxIntersect(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  wall: Wall,
): { t: number; x: number; y: number; z: number; nx: number; ny: number; nz: number } | null {
  const minX = wall.x - wall.w / 2, maxX = wall.x + wall.w / 2
  const minY = wall.y - wall.h / 2, maxY = wall.y + wall.h / 2
  const minZ = wall.z - wall.d / 2, maxZ = wall.z + wall.d / 2

  let tmin = -Infinity, tmax = Infinity
  let nAxis = 0 // 0=x, 1=y, 2=z
  let nSign = 1

  for (const [axis, o, d, lo, hi] of [
    [0, origin.x, dir.x, minX, maxX],
    [1, origin.y, dir.y, minY, maxY],
    [2, origin.z, dir.z, minZ, maxZ],
  ] as const) {
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null
    } else {
      const inv = 1 / d
      let t1 = (lo - o) * inv
      let t2 = (hi - o) * inv
      let n = -1
      if (t1 > t2) { [t1, t2] = [t2, t1]; n = 1 }
      if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = n }
      if (t2 < tmax) tmax = t2
      if (tmin > tmax) return null
    }
  }

  if (tmin < 0 || tmin > 50) return null
  const t = tmin
  const x = origin.x + dir.x * t
  const y = origin.y + dir.y * t
  const z = origin.z + dir.z * t
  const nx = nAxis === 0 ? -nSign : 0
  const ny = nAxis === 1 ? -nSign : 0
  const nz = nAxis === 2 ? -nSign : 0
  return { t, x, y, z, nx, ny, nz }
}
