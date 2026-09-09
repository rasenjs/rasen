/**
 * WebGL Test utilities
 */

import { vi } from 'vitest'
import type { ReactiveRuntime, Ref } from '@rasenjs/core'
import type { GlContext } from '../node'

// domlike GL 句柄别名（与 node.ts 的 Context 造型策略一致：自实现最小造型）
type GlShader = object
type GlProgram = object
type GlBuffer = object
type GlTexture = object
type GlUniformLocation = object

/**
 * Create mock WebGL context
 *
 * 返回纯粋的 domlike GlContext（不再自引用为节点）。
 * 测试里用官方入口物化渲染根：`const root = createRoot(mockCtx)`，
 * 组件挂到 root 下 —— 与真实场景完全同构。
 */
export function createMockWebGLContext(): GlContext {
  // domlike 表面：不再经 document.createElement
  const canvas = { width: 800, height: 600 }

  const mockGL = {
    canvas,
    drawingBufferWidth: 800,
    drawingBufferHeight: 600,

    // Mock WebGL methods
    createShader: vi.fn(() => ({} as GlShader)),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({} as GlProgram)),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({} as GlUniformLocation)),
    createBuffer: vi.fn(() => ({} as GlBuffer)),
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
    createTexture: vi.fn(() => ({} as GlTexture)),
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
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    COLOR_BUFFER_BIT: 0x00004000,
    DEPTH_BUFFER_BIT: 0x00000100,
    BLEND: 0x0be2,
    ONE: 1,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    DST_COLOR: 0x0306,
    ONE_MINUS_SRC_COLOR: 0x0307,
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    DEPTH_TEST: 0x0b71,
    LEQUAL: 0x0203,
    CULL_FACE: 0x0b44,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE1: 0x84c1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8d40,
    RENDERBUFFER: 0x8d41,
    DEPTH_COMPONENT16: 0x81a5,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH_ATTACHMENT: 0x8d00
  }

  return mockGL as unknown as GlContext
}

/**
 * Create mock reactive runtime for testing
 *
 * 极简响应式实现：ref 为可订阅的 { value } 盒子，subscribe 在 getter
 * 求值期间收集读到的 ref 依赖，写入时同步重估并按 Object.is 跳过等值。
 * 让测试里的响应式更新真实生效（写 ref → 触发重绘调度）。
 */
export function createMockReactiveRuntime(): ReactiveRuntime {
  /** 一组订阅者（挂在每个 ref 上） */
  interface Dep {
    subs: Set<() => void>
  }

  let activeDeps: Set<Dep> | null = null

  function createRef<T>(value: T): Ref<T> {
    const dep: Dep = { subs: new Set() }
    let v = value
    const box = {
      get value() {
        activeDeps?.add(dep)
        return v
      },
      set value(next: T) {
        if (Object.is(v, next)) return
        v = next
        for (const fn of [...dep.subs]) fn()
      }
    }
    return box as unknown as Ref<T>
  }

  return {
    subscribe<T>(getter: () => T, callback: (value: T, oldValue: T) => void) {
      const deps = new Set<Dep>()
      let prev: T

      const run = (): T => {
        for (const d of deps) d.subs.delete(notify)
        deps.clear()
        const saved = activeDeps
        activeDeps = deps
        try {
          return getter()
        } finally {
          activeDeps = saved
        }
      }

      const notify = () => {
        const next = run()
        if (!Object.is(prev, next)) {
          const old = prev
          prev = next
          callback(next, old)
        }
      }

      prev = run()

      return () => {
        for (const d of deps) d.subs.delete(notify)
        deps.clear()
      }
    },

    effectScope() {
      return {
        run<T>(fn: () => T): T | undefined {
          return fn()
        },
        stop() {}
      }
    },

    ref: <T>(value: T) => createRef(value),

    unref: <T>(value: T | Ref<T>): T =>
      value !== null &&
      typeof value === 'object' &&
      'value' in (value as object)
        ? (value as unknown as { value: T }).value
        : (value as T),

    setValue: <T>(ref: Ref<T>, value: T): void => {
      ;(ref as unknown as { value: T }).value = value
    },

    isRef: (value: unknown): boolean =>
      !!value && typeof value === 'object' && 'value' in value
  }
}

/**
 * Wait for async operations
 */
export async function waitForAsync() {
  await new Promise((resolve) => setTimeout(resolve, 10))
}

/**
 * Check if WebGL function was called
 */
export function wasGLCalled(gl: GlContext, method: keyof GlContext): boolean {
  const spy = gl[method] as any
  return spy && typeof spy.mock !== 'undefined' && spy.mock.calls.length > 0
}

/**
 * Get WebGL function call arguments
 */
export function getGLCallArgs(
  gl: GlContext,
  method: keyof GlContext,
  callIndex = 0
): any[] {
  const spy = gl[method] as any
  return spy?.mock?.calls?.[callIndex] || []
}
