import { ref, type Ref } from '@rasenjs/core'
import type { TweenRef, TweenOptions } from './types'
import { getEasing } from './easing'

function createTweenRef(initial: number): TweenRef {
  const valueRef: Ref<number> = ref(initial)
  
  let isAnimating = false
  let rafId: number | null = null
  let startTime: number | null = null
  let fromValue = initial
  let targetValue = initial
  let duration = 0
  let easingFn = getEasing('linear')
  let resolve: (() => void) | null = null

  const interpolate = (from: number, to: number, progress: number): number => {
    return from + (to - from) * progress
  }

  const tick = (timestamp: number) => {
    if (!startTime) {
      startTime = timestamp
    }

    const elapsed = timestamp - startTime
    const rawProgress = Math.min(elapsed / duration, 1)
    const progress = easingFn(rawProgress)

    valueRef.value = interpolate(fromValue, targetValue, progress)

    if (rawProgress < 1) {
      rafId = requestAnimationFrame(tick)
    } else {
      valueRef.value = targetValue
      isAnimating = false
      rafId = null
      resolve?.()
      resolve = null
    }
  }

  const stop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    isAnimating = false
    resolve?.()
    resolve = null
  }

  const to = (target: number, options: TweenOptions): Promise<void> => {
    return new Promise((r) => {
      stop()

      fromValue = valueRef.value
      targetValue = target
      duration = options.duration
      easingFn = getEasing(options.easing ?? 'linear')
      isAnimating = true
      startTime = null
      resolve = r

      if (options.delay && options.delay > 0) {
        setTimeout(() => {
          rafId = requestAnimationFrame(tick)
        }, options.delay)
      } else {
        rafId = requestAnimationFrame(tick)
      }
    })
  }

  const set = (value: number) => {
    stop()
    valueRef.value = value
    fromValue = value
    targetValue = value
  }

  return {
    get value() { return valueRef.value },
    get isAnimating() { return isAnimating },
    to,
    set,
    stop
  }
}

export const tween = createTweenRef
