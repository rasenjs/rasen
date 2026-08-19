/**
 * WebGL types - reusable across components
 */
import type { Bounds } from '@rasenjs/core/utils'

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
 * Transform properties (3D — full model transform).
 *
 * 3D shapes (box, mesh, billboard, …) expose these; 2D shapes use the smaller
 * `Transform2DProps` subset instead, keeping their API free of 3D concerns.
 */
export interface TransformProps {
  z?: number | Ref<number> | ReadonlyRef<number>
  rotation?: number | Ref<number> | ReadonlyRef<number>
  rotationX?: number | Ref<number> | ReadonlyRef<number>
  rotationY?: number | Ref<number> | ReadonlyRef<number>
  rotationZ?: number | Ref<number> | ReadonlyRef<number>
  scale?: number | Ref<number> | ReadonlyRef<number>
  scaleX?: number | Ref<number> | ReadonlyRef<number>
  scaleY?: number | Ref<number> | ReadonlyRef<number>
  scaleZ?: number | Ref<number> | ReadonlyRef<number>
}

/**
 * Transform properties for 2D shapes — a deliberate subset of the 3D
 * transform (2D is just 3D with z = 0 and no X/Y rotation).
 *
 * - `rotation` is around the Z axis
 * - `scaleX` / `scaleY` are per-axis scale factors
 * - `z` is an optional depth offset for layering / 2.5D scenes
 *
 * Internally 2D shapes build the same 3D model transform as 3D shapes, so
 * they share the unified pipeline — but their public API stays 2D.
 */
export interface Transform2DProps {
  rotation?: number | Ref<number> | ReadonlyRef<number>
  scaleX?: number | Ref<number> | ReadonlyRef<number>
  scaleY?: number | Ref<number> | ReadonlyRef<number>
  z?: number | Ref<number> | ReadonlyRef<number>
}
