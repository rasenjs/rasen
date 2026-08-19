/**
 * WebGL Test utilities
 */

import { vi } from 'vitest'
import type { ReactiveRuntime } from '@rasenjs/core'

/**
 * Create mock WebGL context
 */
export function createMockWebGLContext(): WebGLRenderingContext {
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 600
  
  // Mock WebGL context for testing
  const mockGL: Partial<WebGLRenderingContext> = {
    canvas,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,
    
    // Mock WebGL methods
    createShader: vi.fn(() => ({} as WebGLShader)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({} as WebGLProgram)),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({} as WebGLUniformLocation)),
    createBuffer: vi.fn(() => ({} as WebGLBuffer)),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    deleteBuffer: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    uniform4fv: vi.fn(),
    uniform3f: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform1i: vi.fn(),
    uniformMatrix4fv: vi.fn(),
    createTexture: vi.fn(() => ({} as WebGLTexture)),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    generateMipmap: vi.fn(),
    getExtension: vi.fn(() => null),
    getError: vi.fn(() => 0),
    depthFunc: vi.fn(),
    disable: vi.fn(),
    isContextLost: vi.fn(() => false),
    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    drawArrays: vi.fn(),
    flush: vi.fn(),
    getParameter: vi.fn((param) => {
      if (param === 0x8869) return 8 // MAX_VERTEX_ATTRIBS
      if (param === 0x8DFB) return 16 // MAX_TEXTURE_IMAGE_UNITS
      return 0
    }),
    
    // Constants
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    COLOR_BUFFER_BIT: 0x00004000,
    DEPTH_BUFFER_BIT: 0x00000100,
    BLEND: 0x0BE2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88E4,
    DYNAMIC_DRAW: 0x88E8,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    DEPTH_TEST: 0x0B71,
    LEQUAL: 0x0203,
    CULL_FACE: 0x0B44,
    TEXTURE_2D: 0x0DE1,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8D40,
    RENDERBUFFER: 0x8D41,
    DEPTH_COMPONENT16: 0x81A5,
    COLOR_ATTACHMENT0: 0x8CE0,
    DEPTH_ATTACHMENT: 0x8D00
  }
  
  return mockGL as WebGLRenderingContext
}

/**
 * Create mock reactive runtime for testing
 */
export function createMockReactiveRuntime(): ReactiveRuntime {
  const watchers = new Map<number, () => void>()
  let watcherId = 0

  return {
    ref: <T>(value: T) => ({ value }),
    computed: (fn: () => any) => ({ value: fn() }),
    watch: (source: any, callback: (newVal: any) => void, options?: any) => {
      const id = watcherId++
      const handler = () => {
        const newValue = typeof source === 'function' ? source() : source
        callback(newValue)
      }
      
      watchers.set(id, handler)
      
      if (options?.immediate) {
        handler()
      }
      
      return () => {
        watchers.delete(id)
      }
    },
    effect: (fn: () => void) => {
      fn()
      return () => {}
    },
    effectScope: () => ({
      run: (fn: () => any) => fn(),
      stop: () => {}
    }),
    unref: <T>(value: T | { value: T }): T =>
      value && typeof value === 'object' && 'value' in value
        ? (value as { value: T }).value
        : (value as T),
    isRef: (value: unknown): boolean =>
      !!(value && typeof value === 'object' && 'value' in value),
    isReactive: () => false
  }
}

/**
 * Wait for async operations
 */
export async function waitForAsync() {
  await new Promise(resolve => setTimeout(resolve, 10))
}

/**
 * Check if WebGL function was called
 */
export function wasGLCalled(
  gl: WebGLRenderingContext,
  method: keyof WebGLRenderingContext
): boolean {
  const spy = gl[method] as any
  return spy && typeof spy.mock !== 'undefined' && spy.mock.calls.length > 0
}

/**
 * Get WebGL function call arguments
 */
export function getGLCallArgs(
  gl: WebGLRenderingContext,
  method: keyof WebGLRenderingContext,
  callIndex = 0
): any[] {
  const spy = gl[method] as any
  return spy?.mock?.calls?.[callIndex] || []
}
