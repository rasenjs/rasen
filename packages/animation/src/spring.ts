import { getReactiveRuntime, type Ref } from '@rasenjs/core'
import type { AnimationOptions, SpringRef, SpringOptions } from './types'
import { rafSchedule, runFrames } from './schedule'
const DEFAULT_STIFFNESS = 100
const DEFAULT_DAMPING = 10
const DEFAULT_MASS = 1
const SETTLE_THRESHOLD = 0.001

/**
 * 子步上限（秒）。
 *
 * 弹簧是刚性系统：用一帧的 dt 直接积分，dt 一到 100ms 就发散（数值爆炸）。
 * 旧实现干脆把每帧写死成 16ms，代价是**速度随刷新率变**（144Hz 下快 2.4 倍）。
 * 正解是把一帧的 dt 切成不超过这个值的小步做半隐式欧拉 —— 既稳定，
 * 又对帧率无关。
 */
const MAX_SUBSTEP = 1 / 120
function createSpringRef(initial: number, options?: SpringOptions & AnimationOptions): SpringRef {
  const runtime = getReactiveRuntime()
  const valueRef: Ref<number> = runtime.ref<number>(initial)
  const schedule = options?.schedule ?? rafSchedule()

  let velocity = options?.velocity ?? 0
  let isAnimating = false
  let isSettled = true
  let target = initial
  let stiffness = options?.stiffness ?? DEFAULT_STIFFNESS
  let damping = options?.damping ?? DEFAULT_DAMPING
  let mass = options?.mass ?? DEFAULT_MASS
  let resolve: (() => void) | null = null
  let unsubscribe: (() => void) | null = null
  /** 不足一个子步的余量（秒）。跨帧携带 —— 这一步使积分与"帧怎么切"无关。 */
  let carry = 0

  const settle = () => {
    runtime.setValue(valueRef, target)
    velocity = 0
    carry = 0
    isAnimating = false
    isSettled = true
    unsubscribe?.()
    unsubscribe = null
    const done = resolve
    resolve = null
    done?.()
  }

  const integrate = (h: number) => {
    const displacement = runtime.unref(valueRef) - target
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass
    velocity += acceleration * h
    runtime.setValue(valueRef, runtime.unref(valueRef) + velocity * h)
  }

  /**
   * 每帧推进：dt 是毫秒，物理量用秒。
   *
   * 固定子步 + 余量跨帧携带：同一段总时长无论切成 10ms/帧还是 20ms/帧，
   * 积分出的子步序列完全一致 —— 既稳定（不用大 dt 单步积分）又与帧划分无关。
   */
  const advance = (dt: number) => {
    if (!isAnimating) return
    carry += dt / 1000
    while (carry >= MAX_SUBSTEP) {
      carry -= MAX_SUBSTEP
      integrate(MAX_SUBSTEP)

      const displacement = runtime.unref(valueRef) - target
      if (Math.abs(velocity) < SETTLE_THRESHOLD && Math.abs(displacement) < SETTLE_THRESHOLD) {
        settle()
        return
      }
    }
  }

  const stop = () => {
    isAnimating = false
    unsubscribe?.()
    unsubscribe = null
    const done = resolve
    resolve = null
    done?.()
  }

  const to = (t: number, opts?: SpringOptions): Promise<void> => {
    return new Promise((r) => {
      if (opts?.stiffness !== undefined) stiffness = opts.stiffness
      if (opts?.damping !== undefined) damping = opts.damping
      if (opts?.mass !== undefined) mass = opts.mass
      if (opts?.velocity !== undefined) velocity = opts.velocity

      // 重新定向：先把上一个未决的承诺结掉，否则它会永远挂着（旧实现会覆盖 resolve）。
      const previous = resolve
      resolve = r
      previous?.()

      target = t
      carry = 0
      isAnimating = true
      isSettled = false
      if (!unsubscribe) {
        unsubscribe = runFrames(schedule, advance)
      }
    })
  }

  const set = (value: number) => {
    stop()
    runtime.setValue(valueRef, value)
    velocity = 0
    target = value
    isSettled = true
  }

  const setWithVelocity = (value: number, v: number) => {
    stop()
    runtime.setValue(valueRef, value)
    velocity = v
    target = value
    isSettled = Math.abs(v) < SETTLE_THRESHOLD
  }

  return {
    get value() { return runtime.unref(valueRef) },
    get velocity() { return velocity },
    get isAnimating() { return isAnimating },
    get isSettled() { return isSettled },
    to,
    set,
    setWithVelocity,
    stop
  }
}

export const spring = createSpringRef
