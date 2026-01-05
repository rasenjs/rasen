/**
 * WebGL types - reusable across components
 */
import type { Bounds } from '@rasenjs/shared'

// Re-export common types from canvas-2d compatible definitions
export interface Ref<T = unknown> {
  value: T
}

export interface ReadonlyRef<T = unknown> {
  readonly value: T
}

export type MaybeRef<T> = T | Ref<T> | ReadonlyRef<T>

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export type { Bounds }

/**
 * Color in RGBA format (0-1 range for GPU)
 */
export interface Color {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Transform matrix (column-major for WebGL)
 */
export type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
]

/**
 * Common shape properties
 */
export interface CommonDrawProps {
  opacity?: number | Ref<number> | ReadonlyRef<number>
  visible?: boolean | Ref<boolean> | ReadonlyRef<boolean>
}

/**
 * Transform properties
 */
export interface TransformProps {
  rotation?: number | Ref<number> | ReadonlyRef<number>
  scaleX?: number | Ref<number> | ReadonlyRef<number>
  scaleY?: number | Ref<number> | ReadonlyRef<number>
}
