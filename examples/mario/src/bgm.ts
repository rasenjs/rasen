/**
 * BGM — background music player.
 *
 * Tracks loop via plain <audio> elements (the approach the Meth Meth Method
 * game uses). Theme tracks follow the level theme; the hurry-up variant
 * replaces the theme when the timer drops below the threshold; one-shot
 * tracks (die / game-over / level-clear) pause the theme while playing.
 */

import type { Theme } from './themes'

/** Preferred audio extension for this browser (ogg is unsupported in Safari). */
const AUDIO_EXT: 'ogg' | 'm4a' = (() => {
  const probe = document.createElement('audio')
  return probe.canPlayType('audio/ogg') ? 'ogg' : 'm4a'
})()

const THEME_TRACKS: Record<Theme, string> = {
  overworld: `/audio/music/overworld.${AUDIO_EXT}`,
  underworld: `/audio/music/underworld.${AUDIO_EXT}`,
  castle: `/audio/music/castle.${AUDIO_EXT}`,
}

/** Speed-up factor for the hurry phase (classic SMB plays the theme faster). */
const HURRY_RATE = 1.35

const ONESHOT_TRACKS: Record<string, string> = {
  die: `/audio/music/die.${AUDIO_EXT}`,
  gameover: `/audio/music/game-over.${AUDIO_EXT}`,
  clear: `/audio/music/level-clear.${AUDIO_EXT}`,
  /** short "hurry up!" jingle, played once before the fast theme kicks in */
  hurry: `/audio/music/hurry.${AUDIO_EXT}`,
}

export class Bgm {
  private themes = new Map<Theme, HTMLAudioElement>()
  private oneshots = new Map<string, HTMLAudioElement>()
  private current: HTMLAudioElement | null = null
  private muted = false

  private themeAudio(theme: Theme): HTMLAudioElement {
    let audio = this.themes.get(theme)
    if (!audio) {
      audio = new Audio(THEME_TRACKS[theme])
      audio.loop = true
      audio.volume = 0.55
      this.themes.set(theme, audio)
    }
    return audio
  }

  private oneshotAudio(name: string): HTMLAudioElement {
    let audio = this.oneshots.get(name)
    if (!audio) {
      audio = new Audio(ONESHOT_TRACKS[name])
      audio.volume = 0.55
      this.oneshots.set(name, audio)
    }
    return audio
  }

  private pauseAll() {
    this.current?.pause()
    for (const a of this.oneshots.values()) a.pause()
    this.current = null
  }

  /** Loop the level theme (faster when in the hurry phase). */
  playTheme(theme: Theme, hurry = false) {
    if (this.muted) return
    this.pauseAll()
    const audio = this.themeAudio(theme)
    audio.playbackRate = hurry ? HURRY_RATE : 1
    audio.currentTime = 0
    void audio.play().catch((err: unknown) => {
      console.warn(`[bgm] playTheme(${theme}) failed:`, err)
    })
    this.current = audio
  }

  /** Hurry phase: play the "hurry up!" jingle once, then loop the fast theme. */
  hurry(theme: Theme) {
    if (this.muted) return
    this.pauseAll()
    const jingle = this.oneshotAudio('hurry')
    jingle.onended = () => {
      if (!this.muted) this.playTheme(theme, true)
    }
    jingle.currentTime = 0
    void jingle.play().catch((err: unknown) => {
      // autoplay refused — fall straight through to the fast theme
      console.warn('[bgm] hurry jingle failed:', err)
      this.playTheme(theme, true)
    })
  }

  /** Play a one-shot jingle; the theme resumes afterwards if resume given. */
  playOnce(
    name: 'die' | 'gameover' | 'clear',
    resume?: { theme: Theme; hurry: boolean },
  ) {
    this.pauseAll()
    if (this.muted) return
    const audio = this.oneshotAudio(name)
    audio.onended = () => {
      if (resume) this.playTheme(resume.theme, resume.hurry)
    }
    audio.currentTime = 0
    void audio.play().catch((err: unknown) => {
      console.warn(`[bgm] playOnce(${name}) failed:`, err)
    })
  }

  stop() {
    this.pauseAll()
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    if (this.muted) this.pauseAll()
    return this.muted
  }
}
