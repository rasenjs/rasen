/**
 * WebGL types - reusable across components
 */
import type { Bounds } from '@rasenjs/core/utils'
import type { PropValue } from '@rasenjs/core'

// 响应式属性值统一使用 core 的 PropValue（T | Ref<T> | Getter<T>）
export type { PropValue, Ref } from '@rasenjs/core'

export type MaybeRef<T> = PropValue<T>

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
  opacity?: PropValue<number>
  visible?: PropValue<boolean>
}

/**
 * Transform properties (3D — full model transform).
 *
 * 3D shapes (box, mesh, billboard, …) expose these; 2D shapes use the smaller
 * `Transform2DProps` subset instead, keeping their API free of 3D concerns.
 */
export interface TransformProps {
  z?: PropValue<number>
  rotation?: PropValue<number>
  rotationX?: PropValue<number>
  rotationY?: PropValue<number>
  rotationZ?: PropValue<number>
  scale?: PropValue<number>
  scaleX?: PropValue<number>
  scaleY?: PropValue<number>
  scaleZ?: PropValue<number>
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
  rotation?: PropValue<number>
  scaleX?: PropValue<number>
  scaleY?: PropValue<number>
  z?: PropValue<number>
}
