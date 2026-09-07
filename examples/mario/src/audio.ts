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
  // ── Full-game SFX ──────────────────────────────────────────────────────
  powerupAppear(): void {
    tone(262, 0, 0.06, 'square', 0.1, 523)
    tone(330, 0.06, 0.06, 'square', 0.1, 659)
    tone(392, 0.12, 0.12, 'square', 0.1, 784)
  },
  powerupConsume(): void {
    const seq = [262, 330, 392, 523, 659, 784]
    seq.forEach((f, i) => tone(f, i * 0.05, 0.06, 'square', 0.1))
  },
  oneUp(): void {
    const seq = [330, 392, 659, 523, 587, 784]
    seq.forEach((f, i) => tone(f, i * 0.09, 0.08, 'square', 0.1))
  },
  kick(): void {
    tone(400, 0, 0.05, 'square', 0.12, 120)
    tone(200, 0.04, 0.08, 'square', 0.1, 80)
  },
  brickBreak(): void {
    // crunchy shatter: sharp attack + descending debris tones
    tone(220, 0, 0.06, 'square', 0.2, 90)
    tone(160, 0.03, 0.08, 'square', 0.18, 55)
    tone(110, 0.08, 0.12, 'square', 0.16, 40)
    tone(320, 0.02, 0.05, 'square', 0.12, 120)
  },
  pipe(): void {
    tone(300, 0, 0.1, 'square', 0.12, 150)
    tone(300, 0.12, 0.1, 'square', 0.12, 150)
  },
  flagpole(): void {
    tone(392, 0, 0.5, 'square', 0.09, 1568)
  },
  hurry(): void {
    tone(784, 0, 0.08, 'square', 0.1)
    tone(784, 0.12, 0.08, 'square', 0.1)
    tone(784, 0.24, 0.08, 'square', 0.1)
  },
  land(): void {
    tone(140, 0, 0.04, 'square', 0.05, 90)
  },
  levelClear(): void {
    const seq: Array<[number, number]> = [
      [523, 0], [659, 0.12], [784, 0.24], [1047, 0.36],
      [784, 0.54], [880, 0.66], [1047, 0.78], [1319, 0.96],
    ]
    for (const [f, t] of seq) tone(f, t, 0.12, 'square', 0.11)
  },
}
