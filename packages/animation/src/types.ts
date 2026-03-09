/**
 * Animation types for @rasenjs/animation
 */

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
  setFrames(frames: number[], options?: FrameOptions): void
}

export type AnimationItem = 
  | [TweenRef, number, TweenOptions]
  | [SpringRef, number, SpringOptions?]
