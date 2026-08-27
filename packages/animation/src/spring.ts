import { getReactiveRuntime, type Ref } from '@rasenjs/core'
import type { SpringRef, SpringOptions } from './types'

const DEFAULT_STIFFNESS = 100
const DEFAULT_DAMPING = 10
const DEFAULT_MASS = 1
const SETTLE_THRESHOLD = 0.001

function createSpringRef(initial: number, options?: SpringOptions): SpringRef {
  const runtime = getReactiveRuntime()
  const valueRef: Ref<number> = runtime.ref<number>(initial)
  
  let velocity = options?.velocity ?? 0
  let isAnimating = false
  let isSettled = true
  let rafId: number | null = null
  let target = initial
  let stiffness = options?.stiffness ?? DEFAULT_STIFFNESS
  let damping = options?.damping ?? DEFAULT_DAMPING
  let mass = options?.mass ?? DEFAULT_MASS
  let resolve: (() => void) | null = null

  const tick = () => {
    const displacement = runtime.unref(valueRef) - target
    const springForce = -stiffness * displacement
    const dampingForce = -damping * velocity
    const acceleration = (springForce + dampingForce) / mass
    
    velocity += acceleration * 0.016
    runtime.setValue(valueRef, runtime.unref(valueRef) + velocity * 0.016)
    
    const settled = 
      Math.abs(velocity) < SETTLE_THRESHOLD && 
      Math.abs(displacement) < SETTLE_THRESHOLD
    
    if (settled) {
      runtime.setValue(valueRef, target)
      velocity = 0
      isAnimating = false
      isSettled = true
      rafId = null
      resolve?.()
      resolve = null
    } else {
      rafId = requestAnimationFrame(tick)
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

  const to = (t: number, opts?: SpringOptions): Promise<void> => {
    return new Promise((r) => {
      if (opts?.stiffness !== undefined) stiffness = opts.stiffness
      if (opts?.damping !== undefined) damping = opts.damping
      if (opts?.mass !== undefined) mass = opts.mass
      if (opts?.velocity !== undefined) velocity = opts.velocity

      target = t
      isAnimating = true
      isSettled = false
      resolve = r

      if (rafId === null) {
        rafId = requestAnimationFrame(tick)
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
