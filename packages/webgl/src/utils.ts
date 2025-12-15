/**
 * Utility functions
 */

import type { Ref, ReadonlyRef, MaybeRef, Color } from './types'

/**
 * Unwrap a potentially reactive value
 */
export function unref<T>(value: MaybeRef<T>): T {
  return typeof value === 'object' && value !== null && 'value' in value
    ? (value as Ref<T> | ReadonlyRef<T>).value
    : (value as T)
}

/**
 * Parse CSS color to RGBA (0-1 range for GPU)
 */
export function parseColor(colorStr: string): Color {
  // Simple color parsing - extend as needed
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1)
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  
  // Default to white
  return { r: 1, g: 1, b: 1, a: 1 }
}

/**
 * Create identity matrix
 */
export function createIdentityMatrix(): number[] {
  return [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ]
}

/**
 * Create translation matrix
 */
export function createTranslationMatrix(x: number, y: number): number[] {
  return [
    1, 0, 0,
    0, 1, 0,
    x, y, 1
  ]
}

/**
 * Create scale matrix
 */
export function createScaleMatrix(sx: number, sy: number): number[] {
  return [
    sx, 0, 0,
    0, sy, 0,
    0, 0, 1
  ]
}

/**
 * Create rotation matrix
 */
export function createRotationMatrix(angle: number): number[] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [
    c, s, 0,
    -s, c, 0,
    0, 0, 1
  ]
}

/**
 * Multiply two 3x3 matrices (column-major)
 */
export function multiplyMatrices(a: number[], b: number[]): number[] {
  const result = new Array(9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i * 3 + j] = 
        a[i * 3 + 0] * b[0 * 3 + j] +
        a[i * 3 + 1] * b[1 * 3 + j] +
        a[i * 3 + 2] * b[2 * 3 + j]
    }
  }
  return result
}

/**
 * Create orthographic projection matrix for 2D
 */
export function createOrthoMatrix(
  width: number,
  height: number
): number[] {
  // Map [0, width] x [0, height] to [-1, 1] x [-1, 1] (WebGL clip space)
  return [
    2 / width, 0, 0,
    0, -2 / height, 0,
    -1, 1, 1
  ]
}
