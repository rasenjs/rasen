/**
 * Skid smoke trails — ports the Godot GPUParticles3D TrailLeft/TrailRight.
 *
 * When the vehicle drifts, smoke puffs spawn at the rear wheels, grow and
 * fade over ~0.5s (matching the particle lifetime). Rendered as camera-facing
 * billboards with the smoke.png texture.
 */
import { ref } from '@rasenjs/reactive-signals'
import type { Ref } from '@rasenjs/core'
import type { Vehicle } from './vehicle'

export interface SmokePuff {
  x: Ref<number>
  y: Ref<number>
  z: Ref<number>
  size: Ref<number>
  opacity: Ref<number>
  age: number
  life: number
}

const TRAIL_LOCAL = [
  { x: 0.25, y: 0.05, z: -0.35 },
  { x: -0.25, y: 0.05, z: -0.35 },
]

export class TrailManager {
  puffs: SmokePuff[] = []
  private accum = 0

  /** World offset of a vehicle-local point under the current yaw. */
  private localToWorld(lx: number, ly: number, lz: number, yaw: number): { x: number; y: number; z: number } {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    return {
      x: lx * c - lz * s,
      y: ly,
      z: lx * s + lz * c,
    }
  }

  update(dt: number, vehicle: Vehicle): SmokePuff[] {
    // Spawn while drifting (Godot: trail.emitting = drift_intensity > 0.25)
    if (vehicle.drift > 0.25) {
      this.accum += dt
      const rate = 0.03 // seconds between puffs
      while (this.accum >= rate) {
        this.accum -= rate
        for (const t of TRAIL_LOCAL) {
          const w = this.localToWorld(t.x, t.y, t.z, vehicle.yaw)
          this.puffs.push({
            x: ref(vehicle.x + w.x),
            y: ref(vehicle.y + w.y),
            z: ref(vehicle.z + w.z),
            size: ref(0.35 + Math.random() * 0.25),
            opacity: ref(0.55),
            age: 0,
            life: 0.5,
          })
        }
      }
    }

    // Advance: grow + fade, drop finished puffs
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]
      p.age += dt
      if (p.age >= p.life) {
        this.puffs.splice(i, 1)
        continue
      }
      const t = p.age / p.life
      p.size.value += dt * 1.6
      p.opacity.value = 0.55 * (1 - t)
    }
    return this.puffs
  }

  clear(): void {
    this.puffs = []
    this.accum = 0
  }
}