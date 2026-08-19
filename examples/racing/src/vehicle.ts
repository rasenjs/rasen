/**
 * Vehicle — port of Kenney Racing's scripts/vehicle.gd.
 *
 * The original drives a RigidBody sphere (angular velocity) and eases the
 * visual model onto it. Here we simulate the same feel kinematically:
 *   - `linearSpeed` is a 0..1 throttle state (accelerate / brake / reverse)
 *   - steering rotates the heading (`yaw`), scaled by grip + direction
 *   - the model moves along its forward axis (the truck's cab faces -Z local)
 *
 * Effects (body lean, wheel spin, front-wheel steer) are exposed as state so
 * the renderer can drive the separate truck parts.
 */

export interface Keys {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
}

const MOVE_SPEED = 13 // world units / sec at full throttle
const WHEEL_SPIN = 9 // wheel rotation per unit of acceleration

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

export class Vehicle {
  // Position / heading
  x = 3.5
  /** Ground height — the vehicle rides on the flat track surface. */
  y = -0.125
  z = 5
  yaw = 0

  // Motion state (ported from vehicle.gd)
  linearSpeed = 0
  angularSpeed = 0
  acceleration = 0
  linearVelocity = 0

  // Visual effects
  lean = 0
  wheelSpin = 0
  frontSteer = 0

  // Lap tracking
  lap = 0
  progress = 0
  private prevProgress = 0

  private prevX = this.x
  private prevZ = this.z

  reset(): void {
    this.x = 3.5
    this.z = 5
    this.yaw = 0
    this.linearSpeed = 0
    this.angularSpeed = 0
    this.acceleration = 0
    this.lean = 0
    this.wheelSpin = 0
    this.frontSteer = 0
    this.lap = 0
    this.progress = 0
    this.prevProgress = 0
    this.prevX = this.x
    this.prevZ = this.z
  }

  update(dt: number, keys: Keys, centerline: Array<{ x: number; z: number }>): void {
    // Input axes (Godot Input.get_axis: positive = right / forward)
    const inputX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const inputZ = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)

    // Steering (vehicle.gd). Godot's rotate_y is opposite-handed to Rasen's
    // rotateY, so the sign of the target angular speed is flipped.
    let direction = Math.sign(this.linearSpeed)
    if (direction === 0) direction = Math.abs(inputZ) > 0.1 ? Math.sign(inputZ) : 1
    const grip = clamp(Math.abs(this.linearSpeed), 0.2, 1)
    const targetAngular = inputX * grip * 4 * direction
    this.angularSpeed = lerp(this.angularSpeed, targetAngular, dt * 4)
    this.yaw += this.angularSpeed * dt

    // Throttle / brake / reverse (vehicle.gd)
    if (inputZ < 0 && this.linearSpeed > 0.01) {
      this.linearSpeed = lerp(this.linearSpeed, 0, dt * 8)
    } else if (inputZ < 0) {
      this.linearSpeed = lerp(this.linearSpeed, inputZ / 2, dt * 2)
    } else {
      this.linearSpeed = lerp(this.linearSpeed, inputZ, dt * 6)
    }
    this.acceleration = lerp(this.acceleration, this.linearSpeed, dt * 1)

    // Move along the forward axis. The truck's cab faces +Z in model space
    // (front wheels at +Z), and the original drives along its local X axis
    // (rolling the sphere), which resolves to +Z at yaw=0. So world forward =
    // (sin(yaw), 0, cos(yaw)).
    const fwdX = Math.sin(this.yaw)
    const fwdZ = Math.cos(this.yaw)
    this.x += fwdX * this.linearSpeed * MOVE_SPEED * dt
    this.z += fwdZ * this.linearSpeed * MOVE_SPEED * dt

    // Linear velocity (for impact volume)
    this.linearVelocity = Math.hypot(this.x - this.prevX, this.z - this.prevZ) / dt
    this.prevX = this.x
    this.prevZ = this.z

    // Effects (vehicle.gd effect_body / effect_wheels). Signs flipped to match
    // Rasen's opposite-handed rotations.
    this.lean = lerpAngle(this.lean, (inputX / 5) * this.linearSpeed, dt * 5)
    this.wheelSpin += this.acceleration * WHEEL_SPIN * dt
    this.frontSteer = lerp(this.frontSteer, inputX / 1.5, dt * 10)

    // Lap progress along the track centerline
    this.updateProgress(centerline)
  }

  /** Drift intensity 0..1 — drives skid trails + sound. */
  get drift(): number {
    return clamp(Math.abs(this.linearSpeed - this.acceleration) + Math.abs(this.lean) * 2, 0, 1)
  }

  /** Normalized speed 0..1 for camera zoom + engine pitch. */
  get speedFactor(): number {
    return clamp(Math.abs(this.linearSpeed), 0, 1)
  }

  private updateProgress(centerline: Array<{ x: number; z: number }>): void {
    if (centerline.length < 2) return
    // Nearest centerline point index
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < centerline.length; i++) {
      const dx = this.x - centerline[i].x
      const dz = this.z - centerline[i].z
      const d = dx * dx + dz * dz
      if (d < bestD) { bestD = d; best = i }
    }
    // Progress = arc length up to the nearest point (plus fractional cell)
    const frac = best / centerline.length
    this.progress = frac
    // Wrap detection: crossing the finish (index 0) forward increments the lap
    const delta = this.progress - this.prevProgress
    if (delta < -0.5) this.lap++ // wrapped end → start (forward)
    else if (delta > 0.5) this.lap = Math.max(0, this.lap - 1) // reversed across line
    this.prevProgress = this.progress
  }

  /** Distance to the nearest track centerline point (for off-track reset). */
  distanceToTrack(centerline: Array<{ x: number; z: number }>): number {
    let best = Infinity
    for (const p of centerline) {
      const dx = this.x - p.x
      const dz = this.z - p.z
      const d = Math.hypot(dx, dz)
      if (d < best) best = d
    }
    return best
  }
}