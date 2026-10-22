/**
 * Audio.
 *
 * Three sources, one bus, in order of preference:
 *
 * 1. `public/original/sfx/manifest.json` — written by `tools/export-audio.ts`
 *    from the player's *own* Diablo II: Resurrected package. A cue found there
 *    plays the game's real sound.
 * 2. `public/assets/manifest.json` — written by `tools/fetch-assets.mjs`, for a
 *    sample pack dropped in by hand.
 * 3. WebAudio synthesis.
 *
 * That means the game sounds complete with **zero** files in the repository —
 * which is the only honest way to ship a demo whose reference product
 * distributes no content of its own — while still letting the game's own audio
 * be used when the player has it.
 *
 * Synthesis is not a placeholder here: an impact is a filtered noise burst with
 * a fast decay and a low sine thump, ice is a high noise band with a metallic
 * ring, and the music is a slow D-minor drone with a sparse bell line. It is
 * what makes a hit land without a sample library, and it stays in place for
 * every cue the package cannot answer.
 */

/**
 * Every sound cue the game can play. This list is the contract: the exporter
 * (`tools/export-audio.ts`) and the verifier (`tools/verify-audio.ts`) both
 * count against it, so "how much of the game has real audio" is a number that
 * cannot drift away from the code.
 */
export const SOUND_NAMES = [
  'swing',
  'hit',
  'crit',
  'fireball',
  'nova',
  'potion',
  'pickup-gold',
  'pickup-item',
  'levelup',
  'death',
  'ui',
  'roar',
] as const

export type SoundName = (typeof SOUND_NAMES)[number]

export interface AudioBus {
  play(name: SoundName, volume?: number, rate?: number): void
  setMuted(muted: boolean): void
  get muted(): boolean
  startMusic(): void
  stopMusic(): void
  /** Undefined when the browser has no WebAudio (headless, some embeds). */
  readonly available: boolean
  readonly usingSamples: boolean
}

interface ManifestEntry {
  id: string
  file: string
  kind: string
  license?: string
  author?: string
}

interface Manifest {
  entries?: ManifestEntry[]
}

/**
 * One sample written by `tools/export-audio.ts`, cut out of the player's own
 * Diablo II: Resurrected package. `source` is the logical path inside the game
 * so the mapping can be checked against the package rather than trusted.
 */
export interface AudioSampleEntry {
  /** Sound cue this sample plays for. */
  cue: string
  /** File name inside the sound directory, e.g. `swing.opus`. */
  file: string
  /** Logical path of the original file inside the game package. */
  source?: string
  /** Size of the exported file in bytes. */
  bytes?: number
  /** Container/codec as written, e.g. `opus`. */
  format?: string
}

export interface AudioSampleManifest {
  generator?: string
  entries?: AudioSampleEntry[]
  /** The single looping music track, kept separate from the cues. */
  music?: AudioSampleEntry
  /** Total size of everything the exporter wrote, as it reported it. */
  totalBytes?: number
}

/**
 * Resolve cue -> sample out of an export manifest.
 *
 * Pure on purpose: the interesting cases (a manifest from an older export, a
 * cue the exporter found nothing for, a duplicate, a junk entry) are decided
 * here and covered by tests, so a malformed manifest can never take the audio
 * bus down. Unknown cues are ignored rather than mapped onto a neighbour — a
 * wrong sound is worse than a synthesised one. The first entry for a cue wins,
 * so the file order of the manifest is the tie-break.
 *
 * @param manifest the parsed `original/sfx/manifest.json`, or `null` if absent
 * @param cues the cues to resolve (defaults to every cue the game defines)
 * @returns one entry per cue that has real audio
 */
export function resolveCueSamples(
  manifest: AudioSampleManifest | null,
  cues: readonly SoundName[] = SOUND_NAMES,
): Map<SoundName, AudioSampleEntry> {
  const resolved = new Map<SoundName, AudioSampleEntry>()
  const known = new Set<string>(cues)
  for (const entry of manifest?.entries ?? []) {
    if (typeof entry?.cue !== 'string' || typeof entry?.file !== 'string') continue
    if (entry.file === '' || !known.has(entry.cue)) continue
    const cue = entry.cue as SoundName
    if (resolved.has(cue)) continue
    resolved.set(cue, entry)
  }
  return resolved
}

/** Directory the exported samples live in, relative to the app's base URL. */
const SOUND_DIRECTORY = 'original/sfx/'

const SILENT: AudioBus = {
  play() {},
  setMuted() {},
  muted: true,
  startMusic() {},
  stopMusic() {},
  available: false,
  usingSamples: false,
}

/**
 * Reads the generated manifest. A missing manifest is the normal case, not an
 * error: the game is designed to run without a single asset file.
 */
async function loadManifest(base: string): Promise<Manifest | null> {
  try {
    const response = await fetch(`${base}assets/manifest.json`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as Manifest
  } catch {
    return null
  }
}

/**
 * Reads the manifest written by `tools/export-audio.ts`.
 *
 * A missing manifest is the normal case: the app ships no audio, and the player
 * either exports their own game's sounds or hears the synthesiser.
 */
export async function loadSamples(base: string): Promise<AudioSampleManifest | null> {
  try {
    const response = await fetch(`${base}${SOUND_DIRECTORY}manifest.json`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json()) as AudioSampleManifest
  } catch {
    return null
  }
}

export async function createAudio(base = '/'): Promise<AudioBus> {
  const AudioContextCtor =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return SILENT

  let context: AudioContext
  try {
    context = new AudioContextCtor()
  } catch {
    return SILENT
  }

  const master = context.createGain()
  master.gain.value = 0.65
  master.connect(context.destination)

  const sfxBus = context.createGain()
  sfxBus.gain.value = 1
  sfxBus.connect(master)

  const musicBus = context.createGain()
  musicBus.gain.value = 0.32
  musicBus.connect(master)

  // One shared noise buffer beats allocating a second of noise per impact.
  const noiseBuffer = ((): AudioBuffer => {
    const length = Math.floor(context.sampleRate * 1.2)
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    let seed = 0x2f6e2b1
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = (seed / 0x3fffffff - 1) * 0.9
    }
    return buffer
  })()

  const resume = (): void => {
    if (context.state === 'suspended') void context.resume()
  }

  interface ToneOptions {
    type?: OscillatorType
    gain?: number
    slideTo?: number
    attack?: number
    delay?: number
  }

  const tone = (frequency: number, duration: number, options: ToneOptions = {}): void => {
    const start = context.currentTime + (options.delay ?? 0)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = options.type ?? 'sine'
    oscillator.frequency.setValueAtTime(frequency, start)
    if (options.slideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.slideTo), start + duration)
    }
    const peak = options.gain ?? 0.2
    const attack = options.attack ?? 0.005
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(sfxBus)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  interface NoiseOptions {
    filter?: BiquadFilterType
    frequency?: number
    endFrequency?: number
    q?: number
    gain?: number
    delay?: number
  }

  const noise = (duration: number, options: NoiseOptions = {}): void => {
    const start = context.currentTime + (options.delay ?? 0)
    const source = context.createBufferSource()
    source.buffer = noiseBuffer
    source.playbackRate.value = 1

    const filter = context.createBiquadFilter()
    filter.type = options.filter ?? 'lowpass'
    filter.frequency.setValueAtTime(options.frequency ?? 900, start)
    if (options.endFrequency !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, options.endFrequency),
        start + duration,
      )
    }
    filter.Q.value = options.q ?? 1

    const gain = context.createGain()
    const peak = options.gain ?? 0.25
    gain.gain.setValueAtTime(peak, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(sfxBus)
    source.start(start)
    source.stop(start + duration + 0.02)
  }

  const synthesized: Record<SoundName, () => void> = {
    swing: () => {
      noise(0.22, { filter: 'bandpass', frequency: 2400, endFrequency: 600, q: 1.4, gain: 0.16 })
    },
    hit: () => {
      noise(0.16, { filter: 'lowpass', frequency: 1400, endFrequency: 260, gain: 0.34 })
      tone(96, 0.16, { type: 'sine', gain: 0.22, slideTo: 48 })
    },
    crit: () => {
      noise(0.26, { filter: 'lowpass', frequency: 2200, endFrequency: 200, gain: 0.42 })
      tone(150, 0.3, { type: 'triangle', gain: 0.24, slideTo: 55 })
      tone(1180, 0.12, { type: 'square', gain: 0.06 })
    },
    fireball: () => {
      noise(0.5, { filter: 'bandpass', frequency: 500, endFrequency: 1800, q: 2.2, gain: 0.2 })
      tone(210, 0.42, { type: 'sawtooth', gain: 0.1, slideTo: 90 })
    },
    nova: () => {
      noise(0.7, { filter: 'highpass', frequency: 1200, endFrequency: 4200, gain: 0.24 })
      tone(1420, 0.55, { type: 'triangle', gain: 0.09, slideTo: 2600 })
    },
    potion: () => {
      tone(520, 0.16, { type: 'triangle', gain: 0.16, slideTo: 880 })
      tone(780, 0.2, { type: 'sine', gain: 0.1, slideTo: 1180, delay: 0.06 })
    },
    'pickup-gold': () => {
      tone(1320, 0.09, { type: 'square', gain: 0.07 })
      tone(1760, 0.12, { type: 'square', gain: 0.06, delay: 0.05 })
    },
    'pickup-item': () => {
      tone(660, 0.14, { type: 'triangle', gain: 0.13 })
      tone(990, 0.22, { type: 'triangle', gain: 0.11, delay: 0.07 })
      tone(1320, 0.3, { type: 'sine', gain: 0.08, delay: 0.15 })
    },
    levelup: () => {
      const notes = [392, 523.25, 659.25, 784]
      notes.forEach((frequency, index) => {
        tone(frequency, 0.5, { type: 'triangle', gain: 0.14, delay: index * 0.11 })
      })
      tone(196, 1.1, { type: 'sine', gain: 0.12, delay: 0.1 })
    },
    death: () => {
      tone(180, 1.1, { type: 'sawtooth', gain: 0.16, slideTo: 42 })
      noise(0.9, { filter: 'lowpass', frequency: 700, endFrequency: 120, gain: 0.2 })
    },
    ui: () => {
      tone(880, 0.06, { type: 'square', gain: 0.05 })
    },
    roar: () => {
      tone(74, 1.3, { type: 'sawtooth', gain: 0.26, slideTo: 52, attack: 0.08 })
      noise(1.2, { filter: 'lowpass', frequency: 420, endFrequency: 140, gain: 0.3 })
    },
  }

  // -- sample playback (optional) ------------------------------------------

  const samples = new Map<SoundName, AudioBuffer>()
  let musicBuffer: AudioBuffer | null = null
  let musicSourceUrl: string | null = null

  /** Fetch and decode one file; a broken file must not take the game down. */
  const decode = async (url: string): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      return await context.decodeAudioData(await response.arrayBuffer())
    } catch {
      return null
    }
  }

  // The player's own game audio wins: `tools/export-audio.ts` re-frames a sample
  // per cue out of their package. Anything it did not find stays synthesised.
  const original = await loadSamples(base)
  for (const [name, entry] of resolveCueSamples(original)) {
    const decoded = await decode(`${base}${SOUND_DIRECTORY}${entry.file}`)
    if (decoded) samples.set(name, decoded)
  }
  if (original?.music) {
    // The track is minutes long (megabytes), and the game starts before it is
    // wanted, so the URL is kept and decoded on the first `startMusic()`.
    musicSourceUrl = `${base}${SOUND_DIRECTORY}${original.music.file}`
  }

  const manifest = await loadManifest(base)
  for (const entry of manifest?.entries ?? []) {
    try {
      const response = await fetch(`${base}assets/${entry.file}`)
      if (!response.ok) continue
      const decoded = await context.decodeAudioData(await response.arrayBuffer())
      if (entry.kind === 'music') {
        musicBuffer ??= decoded
        continue
      }
      if (entry.kind !== 'audio') continue
      const name = entry.id as SoundName
      if (!(name in synthesized)) continue
      // Never replace a sample that came out of the game itself.
      if (!samples.has(name)) samples.set(name, decoded)
    } catch {
      // A corrupt or half-fetched file must not take the game down.
    }
  }

  const playSample = (name: SoundName, volume: number, rate: number): boolean => {
    const buffer = samples.get(name)
    if (!buffer) return false
    const source = context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const gain = context.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(sfxBus)
    source.start()
    return true
  }

  // -- music ---------------------------------------------------------------

  let musicTimer: ReturnType<typeof setInterval> | null = null
  let musicNodes: Array<OscillatorNode | AudioBufferSourceNode> = []
  let musicPlaying = false

  const stopMusic = (): void => {
    musicPlaying = false
    if (musicTimer !== null) {
      clearInterval(musicTimer)
      musicTimer = null
    }
    for (const node of musicNodes) {
      try {
        node.stop()
      } catch {
        // Already stopped — stopping twice is not an error worth reporting.
      }
    }
    musicNodes = []
  }

  /** D minor: a drone, a fifth above it, and a sparse bell figure. */
  const startSynthMusic = (): void => {
    const drone = (frequency: number, detune: number, gainValue: number): void => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 380
      oscillator.type = 'sawtooth'
      oscillator.frequency.value = frequency
      oscillator.detune.value = detune
      gain.gain.value = gainValue
      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(musicBus)
      oscillator.start()
      musicNodes.push(oscillator)
    }
    drone(73.42, -6, 0.05) // D2
    drone(110.0, 7, 0.028) // A2
    drone(146.83, 0, 0.016) // D3

    const scale = [293.66, 349.23, 440.0, 523.25, 587.33, 698.46] // D F A C D F
    let step = 0
    musicTimer = setInterval(() => {
      if (context.state === 'suspended') return
      const note = scale[(step * 3) % scale.length]
      const start = context.currentTime + 0.05
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const filter = context.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1800
      oscillator.type = 'triangle'
      oscillator.frequency.value = note
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.6)
      oscillator.connect(filter)
      filter.connect(gain)
      gain.connect(musicBus)
      oscillator.start(start)
      oscillator.stop(start + 2.8)
      step++
    }, 1500)
  }

  return {
    available: true,
    usingSamples: samples.size > 0,

    play(name, volume = 1, rate = 1) {
      if (context.state === 'suspended') resume()
      const varied = rate * (0.96 + Math.random() * 0.08)
      if (playSample(name, volume, varied)) return
      const synth = synthesized[name]
      if (synth) synth()
    },

    setMuted(muted) {
      master.gain.value = muted ? 0 : 0.65
    },

    muted: false,

    startMusic() {
      resume()
      if (musicPlaying) return
      musicPlaying = true
      const playTrack = (buffer: AudioBuffer): void => {
        if (!musicPlaying) return
        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(musicBus)
        source.start()
        musicNodes.push(source)
      }
      if (musicBuffer) {
        playTrack(musicBuffer)
        return
      }
      if (musicSourceUrl) {
        void decode(musicSourceUrl).then((buffer) => {
          if (!buffer) return
          musicBuffer = buffer
          playTrack(buffer)
        })
        return
      }
      startSynthMusic()
    },

    stopMusic,
  }
}
