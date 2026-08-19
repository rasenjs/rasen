/**
 * Enemy — flying drone with AI.
 *
 * Faces the player, sine-wave vertical bobbing (matches Godot enemy.gd),
 * periodically shoots at the player, takes damage, dies at 0 HP.
 *
 * NOTE on facing: the enemy model's FRONT is +Z (its blasters point toward
 * +Z, and Godot's enemy.gd calls `look_at(player, UP, true)` with
 * use_model_front=true so +Z faces the player). The Rasen mesh applies
 * Mat4x4f.rotateY around the world Y axis, where the model's +Z axis maps to
 * (sin(yaw), 0, cos(yaw)) in world space. So yaw = atan2(dx, dz) makes the
 * model's +Z point at the player (dx/dz = player − enemy).
 */

import { ref } from '@rasenjs/reactive-signals'

export class Enemy {
  readonly x = ref(0)
  readonly y = ref(0)
  readonly z = ref(0)
  /** Yaw facing the player (radians). Model +Z points toward the player. */
  readonly yaw = ref(0)
  readonly health = ref(100)
  readonly alive = ref(true)
  /** True for a short time after attacking (drives the muzzle flash). */
  readonly muzzleFlash = ref(false)
  private time = 0
  private baseY: number
  /** Attack cooldown — matches Godot enemy.tscn Timer wait_time = 0.25. */
  private attackTimer = 0.25

  constructor(x: number, y: number, z: number) {
    this.x.value = x
    this.y.value = y
    this.z.value = z
    this.baseY = y
  }

  damage(amount: number) {
    if (!this.alive.value) return
    this.health.value -= amount
    if (this.health.value <= 0) {
      this.alive.value = false
    }
  }

  /** Update enemy AI. */
  update(dt: number, playerX: number, playerZ: number) {
    if (!this.alive.value) return
    this.time += dt

    // Sine bob — matches Godot enemy.gd: target_position.y += cos(time*5)*1*delta
    this.y.value = this.baseY + Math.cos(this.time * 5) * 1.0

    // Face the player (Godot: look_at(player, UP, true) → model +Z toward
    // player). Mat4x4f.rotateY maps local +Z → (sin yaw, 0, cos yaw), so we
    // need (sin yaw, cos yaw) = normalize(dx, dz) → yaw = atan2(dx, dz).
    const dx = playerX - this.x.value
    const dz = playerZ - this.z.value
    this.yaw.value = Math.atan2(dx, dz)

    // NOTE: Godot's enemy does NOT move horizontally — it only bobs up/down
    // at its spawn position (enemy.gd: position = target_position, where only
    // target_position.y changes). No chasing.

    // Attack timer
    this.attackTimer -= dt
  }

  /** Check if enemy can attack (timer elapsed). */
  canAttack(): boolean {
    return this.alive.value && this.attackTimer <= 0
  }

  /** Reset attack cooldown after attacking. */
  resetAttack() {
    this.attackTimer = 0.25
  }

  /** Trigger the muzzle flash (both blasters) for ~2 animation frames. */
  flashMuzzle() {
    this.muzzleFlash.value = true
    setTimeout(() => { this.muzzleFlash.value = false }, 70)
  }

  /**
   * World-space muzzle positions (MuzzleA/MuzzleB from enemy.tscn at
   * (±0.45, 0.3, 0.4) in the enemy's local space, where +Z is the front).
   */
  muzzlePositions(): { x: number; y: number; z: number }[] {
    const yaw = this.yaw.value
    // Local axes: +X = right, +Y = up, +Z = front (toward player).
    // Mat4x4f.rotateY maps +X → (cos, 0, sin) and +Z → (sin, 0, cos).
    const rx = Math.cos(yaw), rz = Math.sin(yaw) // right
    const fx = Math.sin(yaw), fz = Math.cos(yaw) // front
    const ex = this.x.value, ey = this.y.value, ez = this.z.value
    return [
      { x: ex + rx * -0.45 + fx * 0.4, y: ey + 0.3, z: ez + rz * -0.45 + fz * 0.4 },
      { x: ex + rx * 0.45 + fx * 0.4, y: ey + 0.3, z: ez + rz * 0.45 + fz * 0.4 },
    ]
  }

  /** Test if a ray from (ox,oy,oz) direction (dx,dy,dz) hits this enemy. */
  rayHit(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number,
  ): number | null {
    const S = 0.8
    const ex = this.x.value, ey = this.y.value, ez = this.z.value
    const minX = ex - S, maxX = ex + S
    const minY = ey - S, maxY = ey + S
    const minZ = ez - S, maxZ = ez + S

    let tmin = -Infinity, tmax = Infinity
    for (const [o, d, lo, hi] of [
      [ox, dx, minX, maxX],
      [oy, dy, minY, maxY],
      [oz, dz, minZ, maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-8) {
        if (o < lo || o > hi) return null
      } else {
        const inv = 1 / d
        let t1 = (lo - o) * inv
        let t2 = (hi - o) * inv
        if (t1 > t2) [t1, t2] = [t2, t1]
        if (t1 > tmin) tmin = t1
        if (t2 < tmax) tmax = t2
        if (tmin > tmax) return null
      }
    }
    if (tmin >= 0 && tmin <= maxDist) return tmin
    return null
  }
}

/** Spawn enemies in the arena. */
export function spawnEnemies(): Enemy[] {
  return [
    new Enemy(-12, 1, -12),
    new Enemy(12, 1, -12),
    new Enemy(-12, 1, 12),
    new Enemy(12, 1, 12),
    new Enemy(0, 1, -15),
    new Enemy(0, 1, 15),
    new Enemy(-8, 1, 0),
    new Enemy(8, 1, 0),
    new Enemy(-6, 1, -6),
    new Enemy(6, 1, 6),
  ]
}
