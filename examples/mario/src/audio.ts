/**
 * Tiny WebAudio sound effects — classic square-wave blips, no audio assets.
 */

let ctx: AudioContext | null = null
let muted = false

function ac(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(
  freq: number,
  delay: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.12,
  slideTo?: number,
): void {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + duration)
  }
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

export const sfx = {
  toggleMute(): boolean {
    muted = !muted
    return muted
  },
  jump(): void {
    tone(392, 0, 0.08, 'square', 0.1, 660)
    tone(523, 0.07, 0.1, 'square', 0.08, 880)
  },
  coin(): void {
    tone(988, 0, 0.07, 'square', 0.1)
    tone(1319, 0.07, 0.22, 'square', 0.1)
  },
  stomp(): void {
    tone(260, 0, 0.06, 'square', 0.14, 90)
    tone(140, 0.05, 0.12, 'square', 0.12, 60)
  },
  bump(): void {
    tone(120, 0, 0.08, 'square', 0.12, 80)
  },
  death(): void {
    tone(660, 0, 0.12, 'square', 0.12)
    tone(523, 0.12, 0.12, 'square', 0.12)
    tone(392, 0.24, 0.12, 'square', 0.12)
    tone(262, 0.36, 0.2, 'square', 0.12)
  },
  win(): void {
    tone(523, 0, 0.1, 'square', 0.12)
    tone(659, 0.1, 0.1, 'square', 0.12)
    tone(784, 0.2, 0.1, 'square', 0.12)
    tone(1047, 0.3, 0.3, 'square', 0.12)
  },
}
