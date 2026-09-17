import { getReactiveRuntime, type Ref } from '@rasenjs/core'
import type { AnimationOptions, FrameRef, FrameOptions } from './types'
import { rafSchedule, runFrames, warnNoSchedule } from './schedule'
const DEFAULT_FRAME_RATE = 60

function createFrameRef(options: FrameOptions & AnimationOptions): FrameRef & Ref<number> {
  const runtime = getReactiveRuntime()
  const valueRef: Ref<number> = runtime.ref<number>(options.frames[0] ?? 0)
  const schedule = options.schedule ?? rafSchedule()

  let frames = options.frames
  let frameRate = options.frameRate ?? DEFAULT_FRAME_RATE
  let loop = options.loop ?? true
  let speed = 1

  let isPlaying = false
  let isPaused = false
  let frameIndex = 0
  /** 不足一帧的余量（ms），跨帧累积 —— 帧率与刷新率不同时靠它对齐。 */
  let elapsed = 0
  let unsubscribe: (() => void) | null = null

  const detach = () => {
    unsubscribe?.()
    unsubscribe = null
  }

  /** 每帧推进：dt 由 driver 统一提供，这里只做"按帧率切帧"。 */
  const advance = (dt: number) => {
    if (!isPlaying || isPaused) return

    elapsed += dt * speed
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
          runtime.setValue(valueRef, frames[frameIndex])
          detach()
          return
        }
      }
    }

    runtime.setValue(valueRef, frames[frameIndex])
  }

  const play = () => {
    if (isPlaying && !isPaused) return

    isPlaying = true
    isPaused = false
    // 恢复即重新订阅。旧实现只在 rafId === null 时订阅，而 pause 既没取消也没清空
    // rafId，于是"暂停跨过一帧后 play()"永远订阅不上 —— 画面无声冻死。
    if (!unsubscribe) {
      if (!schedule) warnNoSchedule()
      else unsubscribe = runFrames(schedule, advance)
    }
  }

  const pause = () => {
    isPaused = true
    // 暂停就退订，不留一个会过期的句柄给 play() 判断。
    detach()
  }

  const stop = () => {
    isPlaying = false
    isPaused = false
    frameIndex = 0
    elapsed = 0
    detach()
    runtime.setValue(valueRef, frames[0] ?? 0)
  }

  const setFrames = (newFrames: number[], opts?: Omit<FrameOptions, 'frames'>) => {
    frames = newFrames
    if (opts?.frameRate !== undefined) frameRate = opts.frameRate
    if (opts?.loop !== undefined) loop = opts.loop

    frameIndex = 0
    elapsed = 0
    runtime.setValue(valueRef, frames[0] ?? 0)
  }

  const frameRef = {
    get value() { return runtime.unref(valueRef) },
    set value(v: number) { runtime.setValue(valueRef, v) },
    get isAnimating() { return isPlaying && !isPaused },
    get isPlaying() { return isPlaying },
    get isPaused() { return isPaused },
    get speed() { return speed },
    set speed(v: number) { speed = v },
    play,
    pause,
    stop,
    setFrames
  } as unknown as FrameRef & Ref<number>

  return frameRef
}

export const frame = createFrameRef
