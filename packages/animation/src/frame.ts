import { ref, type Ref } from '@rasenjs/core'
import type { FrameRef, FrameOptions } from './types'

const DEFAULT_FRAME_RATE = 60

function createFrameRef(options: FrameOptions): FrameRef & Ref<number> {
  const valueRef: Ref<number> = ref(options.frames[0] ?? 0)
  
  let frames = options.frames
  let frameRate = options.frameRate ?? DEFAULT_FRAME_RATE
  let loop = options.loop ?? true
  let speed = 1
  
  let isPlaying = false
  let isPaused = false
  let frameIndex = 0
  let elapsed = 0
  let rafId: number | null = null
  let lastTime: number | null = null

  const tick = (timestamp: number) => {
    if (!isPlaying || isPaused) {
      lastTime = null
      return
    }

    if (lastTime === null) {
      lastTime = timestamp
    }

    const delta = (timestamp - lastTime) * speed
    lastTime = timestamp

    elapsed += delta
    const frameTime = 1000 / frameRate

    while (elapsed >= frameTime) {
      elapsed -= frameTime
      frameIndex++

      if (frameIndex >= frames.length) {
        if (loop) {
          frameIndex = 0
        } else {
          frameIndex = frames.length - 1
          isPlaying = false
          valueRef.value = frames[frameIndex]
          return
        }
      }
    }

    valueRef.value = frames[frameIndex]

    if (isPlaying) {
      rafId = requestAnimationFrame(tick)
    }
  }

  const play = () => {
    if (isPlaying && !isPaused) return
    
    isPlaying = true
    isPaused = false
    lastTime = null
    
    if (rafId === null) {
      rafId = requestAnimationFrame(tick)
    }
  }

  const pause = () => {
    isPaused = true
  }

  const stop = () => {
    isPlaying = false
    isPaused = false
    frameIndex = 0
    elapsed = 0
    lastTime = null
    
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    
    valueRef.value = frames[0] ?? 0
  }

  const setFrames = (newFrames: number[], opts?: FrameOptions) => {
    frames = newFrames
    if (opts?.frameRate !== undefined) frameRate = opts.frameRate
    if (opts?.loop !== undefined) loop = opts.loop
    
    frameIndex = 0
    elapsed = 0
    valueRef.value = frames[0] ?? 0
  }

  const frameRef: FrameRef & Ref<number> = {
    get value() { return valueRef.value },
    set value(v: number) { valueRef.value = v },
    get isAnimating() { return isPlaying && !isPaused },
    get isPlaying() { return isPlaying },
    get isPaused() { return isPaused },
    get speed() { return speed },
    set speed(v: number) { speed = v },
    play,
    pause,
    stop,
    setFrames
  }

  return frameRef
}

export const frame = createFrameRef
