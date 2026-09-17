import { getReactiveRuntime, type Ref } from '@rasenjs/core'
import type { AnimationOptions, TweenRef, TweenOptions } from './types'
import { getEasing } from './easing'
import { rafSchedule, runFrames, warnNoSchedule } from './schedule'
function createTweenRef(initial: number, options?: AnimationOptions): TweenRef {
  const runtime = getReactiveRuntime()
  const valueRef: Ref<number> = runtime.ref<number>(initial)
  const schedule = options?.schedule ?? rafSchedule()

  let isAnimating = false
  let elapsed = 0
  let fromValue = initial
  let targetValue = initial
  let duration = 0
  let easingFn = getEasing('linear')
  let resolve: (() => void) | null = null
  let unsubscribe: (() => void) | null = null
  let delayTimer: ReturnType<typeof setTimeout> | null = null

  const interpolate = (from: number, to: number, progress: number): number =>
    from + (to - from) * progress

  /** 解除本实例的一切待执行工作（帧订阅 + 延迟定时器）。幂等。 */
  const detach = () => {
    unsubscribe?.()
    unsubscribe = null
    if (delayTimer !== null) {
      clearTimeout(delayTimer)
      delayTimer = null
    }
  }

  /** 每帧推进：只收 dt，不关心时间从哪来（时间基由 driver 统一持有）。 */
  const advance = (dt: number) => {
    if (!isAnimating) return
    elapsed += dt
    const rawProgress = Math.min(elapsed / duration, 1)
    runtime.setValue(valueRef, interpolate(fromValue, targetValue, easingFn(rawProgress)))
    if (rawProgress >= 1) {
      runtime.setValue(valueRef, targetValue)
      isAnimating = false
      detach()
      const done = resolve
      resolve = null
      done?.()
    }
  }

  const start = () => {
    delayTimer = null
    // 延迟窗口内可能已经被 stop()/set() 停掉 —— 这里必须再确认一次，
    // 否则定时器到点会照样启动动画（旧实现正是这样漏的）。
    if (!isAnimating) return
    if (!schedule) {
      warnNoSchedule()
      return
    }
    // 每次开始都新建一轮订阅 —— "上一帧基准"随之重置。
    unsubscribe = runFrames(schedule, advance)
  }

  const stop = () => {
    detach()
    isAnimating = false
    const done = resolve
    resolve = null
    done?.()
  }

  const to = (target: number, options: TweenOptions): Promise<void> => {
    return new Promise((r) => {
      stop()

      fromValue = runtime.unref(valueRef)
      targetValue = target
      duration = options.duration
      easingFn = getEasing(options.easing ?? 'linear')
      elapsed = 0
      isAnimating = true
      resolve = r

      if (options.delay && options.delay > 0) {
        delayTimer = setTimeout(start, options.delay)
      } else {
        start()
      }
    })
  }

  const set = (value: number) => {
    stop()
    runtime.setValue(valueRef, value)
    fromValue = value
    targetValue = value
  }

  return {
    get value() { return runtime.unref(valueRef) },
    get isAnimating() { return isAnimating },
    to,
    set,
    stop
  }
}

export const tween = createTweenRef
