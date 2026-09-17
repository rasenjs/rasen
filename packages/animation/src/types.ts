/**
 * Animation types for @rasenjs/animation
 */

import type { FrameSchedule } from './schedule'

/** 所有动画共用的构造选项。 */
export interface AnimationOptions {
  /**
   * 帧源（与渲染器 `schedule` 选项同一形状）。缺省用宿主 rAF。
   *
   * 注入手动帧源即可逐帧驱动并断言精确状态 —— 这是动画行为唯一可被真正
   * 测到的方式（在没注入之前，用例只能断言同步标志，于是三个驱动器 bug
   * 一直活着）。
   */
  schedule?: FrameSchedule
}

export interface AnimatedRef {
  readonly value: number
  stop(): void
  readonly isAnimating: boolean
}

export type EasingFunction = (t: number) => number

export type EasingName =
  | 'linear'
  | 'easeIn' | 'easeOut' | 'easeInOut'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart'
  | 'easeInQuint' | 'easeOutQuint' | 'easeInOutQuint'
  | 'easeInSine' | 'easeOutSine' | 'easeInOutSine'
  | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
  | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc'
  | 'easeInElastic' | 'easeOutElastic' | 'easeInOutElastic'
  | 'easeInBack' | 'easeOutBack' | 'easeInOutBack'
  | 'easeOutBounce'

export interface TweenOptions {
  duration: number
  easing?: EasingFunction | EasingName
  delay?: number
}

export interface SpringOptions {
  stiffness?: number
  damping?: number
  mass?: number
  velocity?: number
}

export interface FrameOptions {
  frames: number[]
  frameRate?: number
  loop?: boolean
}

export interface TweenRef extends AnimatedRef {
  to(target: number, options: TweenOptions): Promise<void>
  set(value: number): void
}

export interface SpringRef extends AnimatedRef {
  to(target: number, options?: SpringOptions): Promise<void>
  set(value: number): void
  setWithVelocity(value: number, velocity: number): void
  readonly velocity: number
  readonly isSettled: boolean
}

export interface FrameRef extends AnimatedRef {
  play(): void
  pause(): void
  stop(): void
  readonly isPlaying: boolean
  readonly isPaused: boolean
  speed: number
  setFrames(frames: number[], options?: Omit<FrameOptions, 'frames'>): void
}

export type AnimationItem = 
  | [TweenRef, number, TweenOptions]
  | [SpringRef, number, SpringOptions?]
