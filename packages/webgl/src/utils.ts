/**
 * Utility functions
 */

import type { Ref, ReadonlyRef, MaybeRef, Color } from './types'
import type { GlContext } from './node'
import { unref as coreUnref } from '@rasenjs/core'

/**
 * Unwrap a potentially reactive value
 */
export function unref<T>(value: MaybeRef<T>): T {
  return coreUnref(value as T | Ref<T> | ReadonlyRef<T>) as T
}

// Color cache for frequently used colors
const colorCache = new Map<string, Color>()

/**
 * Parse CSS color to RGBA (0-1 range for GPU)
 * Uses cache to avoid repeated parsing of same colors
 * Returns a copy to avoid mutation of cached object
 */
export function parseColor(colorStr: string): Color {
  // Check cache first
  const cached = colorCache.get(colorStr)
  if (cached) {
    // Return a copy to avoid mutating cached color
    return { r: cached.r, g: cached.g, b: cached.b, a: cached.a }
  }
  
  let color: Color
  
  // Simple color parsing - extend as needed
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1)
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
    color = { r, g, b, a }
  } else if (colorStr.startsWith('rgba')) {
    // Parse rgba(r, g, b, a) format
    const match = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
    if (match) {
      const r = parseInt(match[1], 10) / 255
      const g = parseInt(match[2], 10) / 255
      const b = parseInt(match[3], 10) / 255
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1
      color = { r, g, b, a }
    } else {
      color = { r: 1, g: 1, b: 1, a: 1 }
    }
  } else if (colorStr.startsWith('rgb')) {
    // Parse rgb(r, g, b) format
    const match = colorStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/)
    if (match) {
      const r = parseInt(match[1], 10) / 255
      const g = parseInt(match[2], 10) / 255
      const b = parseInt(match[3], 10) / 255
      color = { r, g, b, a: 1 }
    } else {
      color = { r: 1, g: 1, b: 1, a: 1 }
    }
  } else {
    // Default to white
    color = { r: 1, g: 1, b: 1, a: 1 }
  }
  
  // Cache for future use (limit cache size to prevent memory leak)
  if (colorCache.size < 100) {
    colorCache.set(colorStr, color)
  }
  
  return color
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

// Reusable translation matrix to reduce allocations
const reusableMatrix = new Float32Array(9)

/**
 * Create translation matrix
 * Returns a reusable Float32Array - DO NOT store reference, values will change
 */
export function createTranslationMatrix(x: number, y: number): Float32Array {
  reusableMatrix[0] = 1
  reusableMatrix[1] = 0
  reusableMatrix[2] = 0
  reusableMatrix[3] = 0
  reusableMatrix[4] = 1
  reusableMatrix[5] = 0
  reusableMatrix[6] = x
  reusableMatrix[7] = y
  reusableMatrix[8] = 1
  return reusableMatrix
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

// Texture cache keyed by (gl context → source image). A WebGLTexture belongs
// to exactly one context, so the cache must be scoped per context — otherwise
// a page reload (new context) reusing a cached texture fails to bind.
const textureCache = new WeakMap<
  GlContext,
  Map<TexImageSource, Map<string, WebGLTexture>>
>()

/**
 * Texture sampling options (overrides the pixelated sprite defaults).
 */
export interface TextureOptions {
  /** Wrap mode for S (U) axis. Defaults to CLAMP_TO_EDGE. */
  wrapS?: number
  /** Wrap mode for T (V) axis. Defaults to CLAMP_TO_EDGE. */
  wrapT?: number
  /** Minification filter. Defaults to NEAREST. */
  minFilter?: number
  /** Magnification filter. Defaults to NEAREST. */
  magFilter?: number
}

/**
 * Upload a TexImageSource (HTMLImageElement / HTMLCanvasElement / …) as a
 * WebGLTexture (cached per gl context, pixelated filtering for crisp sprite
 * look, clamp-to-edge wrapping).
 *
 * Pass options for a smooth/repeat texture (e.g. skybox panoramas should use
 * LINEAR filtering + REPEAT wrapping so the equirectangular seam is seamless).
 */
export function createTexture(
  gl: GlContext,
  source: TexImageSource,
  options?: TextureOptions
): WebGLTexture {
  let perContext = textureCache.get(gl)
  if (!perContext) {
    perContext = new Map()
    textureCache.set(gl, perContext)
  }
  // Cache key = source (by reference) + sampling options, so a source can be
  // sampled differently (sprite vs skybox) without collisions.
  const optionKey = options
    ? `${options.wrapS ?? 'c'}|${options.wrapT ?? 'c'}|${options.minFilter ?? 'n'}|${options.magFilter ?? 'n'}`
    : 'default'
  let byOptions = perContext.get(source)
  if (!byOptions) {
    byOptions = new Map<string, WebGLTexture>()
    perContext.set(source, byOptions)
  }
  const cached = byOptions.get(optionKey)
  if (cached) return cached

  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create WebGL texture')

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options?.wrapS ?? gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options?.wrapT ?? gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options?.minFilter ?? gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options?.magFilter ?? gl.NEAREST)
  gl.bindTexture(gl.TEXTURE_2D, null)

  byOptions.set(optionKey, texture)
  return texture
}

