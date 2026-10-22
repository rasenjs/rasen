import { describe, expect, it } from 'vitest'
import { SOUND_NAMES, resolveCueSamples, type AudioSampleManifest } from '../audio'
import { decodeOpusAsset, encodeOggOpus, inspectOggOpus } from '../../tools/export-audio'

/**
 * The audio bus has two pieces worth testing without a browser: which cue a
 * manifest entry is allowed to answer for, and the game's audio container.
 *
 * The manifest comes from an exporter that runs against whatever build of the
 * game the player has, so the interesting cases are the malformed ones: an entry
 * for a cue this build does not have must be ignored rather than played in the
 * wrong place, and a container that does not match the measured layout must be
 * refused rather than exported as silence.
 */

/** A synthetic packet whose TOC stereo bit matches `channels`. */
function packet(channels: 1 | 2, seed: number, length = 8): Uint8Array {
  const bytes = new Uint8Array(length)
  // 0x4b = single-frame, mono; 0x4c = the same with the stereo bit set.
  bytes[0] = channels === 2 ? 0x4c : 0x4b
  for (let i = 1; i < length; i++) bytes[i] = (seed * 31 + i * 7) & 0xff
  return bytes
}

/** The game's own container, built the way `tools/export-audio.ts` reads it. */
function gameContainer(
  channels: 1 | 2,
  sampleRate: number,
  packets: readonly Uint8Array[],
): Uint8Array {
  const recordSize = 8 + packets[0].length
  const body = new Uint8Array(recordSize * packets.length)
  const view = new DataView(body.buffer)
  packets.forEach((bytes, index) => {
    const at = index * recordSize
    view.setUint32(at, bytes.length, false)
    body.set(bytes, at + 8)
  })

  const file = new Uint8Array(40 + body.length)
  const fileView = new DataView(file.buffer)
  fileView.setUint32(0, 0x80000001, true)
  fileView.setUint32(4, 24, true)
  fileView.setUint16(8, channels === 2 ? 0x0200 : 0x0100, true)
  fileView.setUint16(10, recordSize, true)
  fileView.setUint32(12, sampleRate, true)
  fileView.setUint32(16, 32, true)
  fileView.setUint32(28, 104, true)
  fileView.setUint32(32, 0x80000004, true)
  fileView.setUint32(36, body.length, true)
  file.set(body, 40)
  return file
}

describe('sound cues', () => {
  it('is the list the audio bus and the exporter both count against', () => {
    expect(SOUND_NAMES.length).toBe(12)
    expect(new Set(SOUND_NAMES).size).toBe(SOUND_NAMES.length)
    expect(SOUND_NAMES).toContain('pickup-gold')
  })
})

describe('cue resolution', () => {
  it('resolves every cue a manifest answers for', () => {
    const manifest: AudioSampleManifest = {
      entries: [
        { cue: 'swing', file: 'swing.ogg', bytes: 10, source: 'hd/global/sfx/combat/weapon/x.opus' },
        { cue: 'ui', file: 'ui.ogg' },
      ],
    }
    const resolved = resolveCueSamples(manifest)
    expect(resolved.size).toBe(2)
    expect(resolved.get('swing')?.file).toBe('swing.ogg')
    expect(resolved.get('ui')?.source).toBeUndefined()
    expect(resolved.has('hit')).toBe(false)
  })

  it('ignores a cue this build does not define', () => {
    const manifest: AudioSampleManifest = { entries: [{ cue: 'nostromo', file: 'x.ogg' }] }
    expect(resolveCueSamples(manifest).size).toBe(0)
  })

  it('ignores entries that cannot name a file', () => {
    const manifest = {
      entries: [
        { cue: 'hit' },
        { cue: 'crit', file: '' },
        { cue: 'death', file: 42 },
        { file: 'ui.ogg' },
        null,
      ],
    } as unknown as AudioSampleManifest
    expect(resolveCueSamples(manifest).size).toBe(0)
  })

  it('keeps the first entry for a cue, so file order is the tie-break', () => {
    const manifest: AudioSampleManifest = {
      entries: [
        { cue: 'hit', file: 'first.ogg' },
        { cue: 'hit', file: 'second.ogg' },
      ],
    }
    expect(resolveCueSamples(manifest).get('hit')?.file).toBe('first.ogg')
  })

  it('treats a missing or empty manifest as "nothing exported"', () => {
    expect(resolveCueSamples(null).size).toBe(0)
    expect(resolveCueSamples({}).size).toBe(0)
    expect(resolveCueSamples({ entries: [] }).size).toBe(0)
  })

  it('leaves the music track out of the cue map', () => {
    const manifest: AudioSampleManifest = {
      entries: [],
      music: { cue: 'music', file: 'music.ogg', bytes: 100 },
    }
    expect(resolveCueSamples(manifest).size).toBe(0)
    expect(manifest.music?.file).toBe('music.ogg')
  })

  it('resolves against an explicit cue list', () => {
    const manifest: AudioSampleManifest = { entries: [{ cue: 'swing', file: 'swing.ogg' }] }
    expect(resolveCueSamples(manifest, ['hit']).size).toBe(0)
    expect(resolveCueSamples(manifest, ['swing']).size).toBe(1)
  })
})

describe('the game audio container', () => {
  it('splits a container into its Opus packets', () => {
    const packets = [packet(2, 1), packet(2, 2), packet(2, 3)]
    const asset = decodeOpusAsset(gameContainer(2, 16000, packets))
    expect(asset.channels).toBe(2)
    expect(asset.sampleRate).toBe(16000)
    expect(asset.packets.length).toBe(3)
    expect(Array.from(asset.packets[1])).toEqual(Array.from(packets[1]))
  })

  it('reads the channel count from the header flag', () => {
    expect(decodeOpusAsset(gameContainer(1, 48000, [packet(1, 1)])).channels).toBe(1)
    expect(decodeOpusAsset(gameContainer(2, 48000, [packet(2, 1)])).channels).toBe(2)
  })

  it('refuses a file whose chunks or records do not match the layout', () => {
    const good = gameContainer(2, 16000, [packet(2, 1), packet(2, 2)])
    const wrongChunk = good.slice()
    new DataView(wrongChunk.buffer).setUint32(0, 0x80000009, true)
    expect(() => decodeOpusAsset(wrongChunk)).toThrow(/unexpected first chunk/)

    const truncated = good.slice(0, good.length - 4)
    expect(() => decodeOpusAsset(truncated)).toThrow(/whole number of/)

    const empty = new Uint8Array(24)
    expect(() => decodeOpusAsset(empty)).toThrow()
  })

  it('refuses a packet whose stereo bit contradicts the header', () => {
    const monoPackets = [packet(1, 1), packet(1, 2)]
    const wrong = gameContainer(2, 16000, monoPackets)
    expect(() => decodeOpusAsset(wrong)).toThrow(/but the header says 2 channel/)
  })

  it('re-frames packets as an Ogg Opus stream that passes its own checks', () => {
    const packets = Array.from({ length: 90 }, (_, index) => packet(2, index))
    const file = encodeOggOpus({ channels: 2, sampleRate: 16000, packets, recordSize: 16 })
    expect(String.fromCharCode(...file.slice(0, 4))).toBe('OggS')
    const check = inspectOggOpus(file)
    expect(check.ok).toBe(true)
    expect(check.packets).toBe(90)
    // 90 packets at 40 per page plus the two header pages.
    expect(check.pages).toBe(2 + Math.ceil(90 / 40))
  })

  it('catches a corrupted page', () => {
    const packets = [packet(1, 1), packet(1, 2), packet(1, 3)]
    const file = encodeOggOpus({ channels: 1, sampleRate: 16000, packets, recordSize: 16 })
    const corrupted = file.slice()
    corrupted[corrupted.length - 1] ^= 0xff
    expect(inspectOggOpus(corrupted).ok).toBe(false)
  })

  it('refuses to write an empty stream', () => {
    expect(() => encodeOggOpus({ channels: 1, sampleRate: 16000, packets: [], recordSize: 16 })).toThrow(
      /empty stream/,
    )
  })
})
