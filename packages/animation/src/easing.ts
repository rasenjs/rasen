import type { EasingFunction, EasingName } from './types'

const PI = Math.PI
const HALF_PI = PI / 2

export const linear: EasingFunction = (t) => t

export const easeInQuad: EasingFunction = (t) => t * t
export const easeOutQuad: EasingFunction = (t) => t * (2 - t)
export const easeInOutQuad: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

export const easeInCubic: EasingFunction = (t) => t * t * t
export const easeOutCubic: EasingFunction = (t) => {
  const t1 = t - 1
  return t1 * t1 * t1 + 1
}
export const easeInOutCubic: EasingFunction = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1

export const easeInQuart: EasingFunction = (t) => t * t * t * t
export const easeOutQuart: EasingFunction = (t) => {
  const t1 = t - 1
  return 1 - t1 * t1 * t1 * t1
}
export const easeInOutQuart: EasingFunction = (t) => {
  const t1 = t - 1
  return t < 0.5 ? 8 * t * t * t * t : 1 - 8 * t1 * t1 * t1 * t1
}

export const easeInQuint: EasingFunction = (t) => t * t * t * t * t
export const easeOutQuint: EasingFunction = (t) => {
  const t1 = t - 1
  return 1 + t1 * t1 * t1 * t1 * t1
}
export const easeInOutQuint: EasingFunction = (t) => {
  const t1 = t - 1
  return t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * t1 * t1 * t1 * t1 * t1
}

export const easeInSine: EasingFunction = (t) => 1 - Math.cos(t * HALF_PI)
export const easeOutSine: EasingFunction = (t) => Math.sin(t * HALF_PI)
export const easeInOutSine: EasingFunction = (t) =>
  0.5 * (1 - Math.cos(PI * t))

export const easeInExpo: EasingFunction = (t) =>
  t === 0 ? 0 : Math.pow(2, 10 * (t - 1))
export const easeOutExpo: EasingFunction = (t) =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
export const easeInOutExpo: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t
  return t < 0.5
    ? 0.5 * Math.pow(2, 20 * t - 10)
    : 1 - 0.5 * Math.pow(2, -20 * t + 10)
}

export const easeInCirc: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t)
export const easeOutCirc: EasingFunction = (t) => Math.sqrt(1 - (t - 1) * (t - 1))
export const easeInOutCirc: EasingFunction = (t) =>
  t < 0.5
    ? 0.5 * (1 - Math.sqrt(1 - 4 * t * t))
    : 0.5 * (1 + Math.sqrt(-4 * t * t + 8 * t - 3))

export const easeInElastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t
  return -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * PI)
}
export const easeOutElastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t
  return Math.pow(2, -10 * t) * Math.sin((t - 0.1) * 5 * PI) + 1
}
export const easeInOutElastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t
  const TWO_PI = PI * 2
  return t < 0.5
    ? -0.5 * Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * TWO_PI / 4.5)
    : 0.5 * Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * TWO_PI / 4.5) + 1
}

export const easeInBack: EasingFunction = (t) => {
  const c = 1.70158
  return t * t * ((c + 1) * t - c)
}
export const easeOutBack: EasingFunction = (t) => {
  const c = 1.70158
  const t1 = t - 1
  return 1 + t1 * t1 * ((c + 1) * t1 + c)
}
export const easeInOutBack: EasingFunction = (t) => {
  const c = 1.70158 * 1.525
  return t < 0.5
    ? 0.5 * (2 * t) * (2 * t) * ((c + 1) * 2 * t - c)
    : 0.5 * (1 + (2 * t - 2) * (2 * t - 2) * ((c + 1) * (2 * t - 2) + c))
}

export const easeOutBounce: EasingFunction = (t) => {
  const n1 = 7.5625
  const d1 = 2.75
  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    return n1 * (t - 1.5 / d1) * (t - 1.5 / d1) + 0.75
  } else if (t < 2.5 / d1) {
    return n1 * (t - 2.25 / d1) * (t - 2.25 / d1) + 0.9375
  } else {
    return n1 * (t - 2.625 / d1) * (t - 2.625 / d1) + 0.984375
  }
}

export const easeInBounce: EasingFunction = (t) => 1 - easeOutBounce(1 - t)

export const easeInOutBounce: EasingFunction = (t) =>
  t < 0.5
    ? 0.5 * easeInBounce(2 * t)
    : 0.5 * easeOutBounce(2 * t - 1) + 0.5

export const easeIn = easeInQuad
export const easeOut = easeOutQuad
export const easeInOut = easeInOutQuad

export const easingMap: Record<EasingName, EasingFunction> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  easeInOutQuart,
  easeInQuint,
  easeOutQuint,
  easeInOutQuint,
  easeInSine,
  easeOutSine,
  easeInOutSine,
  easeInExpo,
  easeOutExpo,
  easeInOutExpo,
  easeInCirc,
  easeOutCirc,
  easeInOutCirc,
  easeInElastic,
  easeOutElastic,
  easeInOutElastic,
  easeInBack,
  easeOutBack,
  easeInOutBack,
  easeOutBounce
}

export function getEasing(easing: EasingFunction | EasingName): EasingFunction {
  if (typeof easing === 'function') return easing
  return easingMap[easing] || linear
}
