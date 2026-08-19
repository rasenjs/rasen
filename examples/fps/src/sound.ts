/**
 * Sound — real Kenney FPS sound effects.
 */

export class SoundManager {
  private sources: Map<string, HTMLAudioElement>

  constructor(sounds: Map<string, HTMLAudioElement>) {
    this.sources = sounds
  }

  play(name: string, volume = 1) {
    const src = this.sources.get(name)
    if (!src) return
    const clone = src.cloneNode(true) as HTMLAudioElement
    clone.volume = volume
    clone.play().catch(() => {})
  }
}
