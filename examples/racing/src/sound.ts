/**
 * Sound manager — ports the Godot audio effects:
 *   - engine: looping engine.ogg, pitch + volume follow speed/throttle
 *   - skid:   looping skid.ogg, volume follows drift intensity
 *   - impact: one-shot impact.ogg on collisions / off-track resets
 */
export class SoundManager {
  private engine: HTMLAudioElement
  private skid: HTMLAudioElement
  private impact: HTMLAudioElement

  constructor(sounds: Map<string, HTMLAudioElement>) {
    this.engine = sounds.get('engine')!
    this.skid = sounds.get('skid')!
    this.impact = sounds.get('impact')!
    this.engine.loop = true
    this.skid.loop = true
    this.engine.volume = 0
    this.skid.volume = 0
    // Start the loops muted; they fade in as the car moves.
    this.engine.play().catch(() => {})
    this.skid.play().catch(() => {})
  }

  /** Called every frame with the vehicle state (vehicle.gd effect_engine). */
  update(dt: number, speedFactor: number, throttle: number, drift: number): void {
    // Engine: volume from speed + throttle, pitch from speed
    const targetVolume = -15 + (speedFactor + throttle * 0.5) * 10 // remap 0..1.5 → -15..0
    this.engine.volume = lerp(this.engine.volume, clamp(targetVolume, 0, 1), dt * 5)
    const targetPitch = 0.5 + speedFactor * 2.5 + (throttle > 0.1 ? 0.2 : 0)
    this.engine.playbackRate = lerp(this.engine.playbackRate, targetPitch, dt * 2)

    // Skid: volume from drift intensity
    const skidVol = drift > 0.25 ? clamp((drift - 0.25) / 0.75, 0, 1) : 0
    this.skid.volume = lerp(this.skid.volume, skidVol * 0.9, dt * 10)
  }

  playImpact(velocity: number): void {
    // vehicle.gd: volume from impact velocity (0..6 → -20..0 dB)
    const vol = clamp(velocity / 6, 0, 1)
    this.impact.volume = vol
    this.impact.currentTime = 0
    this.impact.play().catch(() => {})
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}