/**
 * PointerLockControls — first-person mouse look for a canvas.
 *
 * Wires pointer-lock + click-and-drag mouse look onto reactive `yaw`/`pitch`
 * refs (injected, so the host decides which reactivity implementation to
 * use — Rasen's core-interface + injected-runtime model).
 *
 * Pointer lock gives FPS-style control via raw `movementX/movementY` deltas.
 * When it's unavailable or denied (embedded frames, some browsers) the view
 * is still controlled by click-and-drag, so the game is never blocked behind
 * a start screen.
 */

import { setValue, unref, type Ref } from '@rasenjs/core'

/** domlike 指针事件（仅收录实际使用的字段） */
export interface PointerEventLike {
  readonly clientX: number
  readonly clientY: number
  readonly movementX: number
  readonly movementY: number
}

/**
 * domlike 指针锁定交互面 —— 对接方需提供的最小 API 造型。
 *
 * 典型实现（应用层组装，非本库职责）：
 * ```ts
 * const surface = {
 *   requestPointerLock: () => canvas.requestPointerLock(),
 *   exitPointerLock: () => document.exitPointerLock(),
 *   isLocked: () => document.pointerLockElement === canvas,
 *   setTimeout: (cb, ms) => window.setTimeout(cb, ms),
 *   addEventListener: (t, cb) => target.addEventListener(t, cb),
 * }
 * ```
 */
export interface PointerLockSurface {
  /** 在画布上请求指针锁定（须由用户手势触发） */
  requestPointerLock(): void
  /** 退出指针锁定 */
  exitPointerLock(): void
  /** 当前是否锁定在目标画布上（实现内部比较 pointerLockElement） */
  isLocked(): boolean
  setTimeout(cb: () => void, ms: number): unknown
  addEventListener(
    type: 'pointerlockchange' | 'mousedown' | 'mousemove' | 'mouseup' | 'blur',
    cb: (e: PointerEventLike) => void
  ): void
}

/** Refs the controls drive (host-provided). */
export interface PointerLockControlRefs {
  /** Rotation around world +Y in radians (0 = looking down -Z). */
  yaw: Ref<number>
  /** Rotation around the camera right axis in radians (0 = level). */
  pitch: Ref<number>
  /** True once mouse control is active (pointer lock or drag fallback). */
  locked: Ref<boolean>
}

export interface PointerLockControls extends PointerLockControlRefs {
  /** Request pointer lock on the canvas (call from a user gesture). */
  request: () => void
  /** Exit pointer lock / stop mouse control. */
  release: () => void
}

const SENSITIVITY = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.01

/**
 * Create pointer-lock + drag-look controls.
 *
 * @param surface domlike 交互面（document/canvas 组合的抽象，外部注入）
 * @param refs    Injected yaw/pitch/locked refs to drive.
 *
 * @example
 * ```ts
 * const controls = createPointerLockControls(surface, { yaw, pitch, locked })
 * canvasEl.addEventListener('click', () => {
 *   if (!controls.locked.value) controls.request()
 * })
 * ```
 */
export function createPointerLockControls(
  surface: PointerLockSurface,
  refs: PointerLockControlRefs,
): PointerLockControls {
  const { yaw, pitch, locked } = refs
  let dragging = false
  let lastX = 0
  let lastY = 0

  const request = () => {
    try {
      surface.requestPointerLock()
    } catch {
      // requestPointerLock threw — pointer lock unsupported here.
      setValue(locked, true)
      return
    }
    // Pointer lock is granted asynchronously. If it never arrives (denied /
    // unsupported), enable the drag fallback so the game still starts.
    surface.setTimeout(() => {
      if (!surface.isLocked()) {
        setValue(locked, true)
      }
    }, 250)
  }

  const release = () => {
    if (surface.isLocked()) surface.exitPointerLock()
    setValue(locked, false)
    dragging = false
  }

  surface.addEventListener('pointerlockchange', () => {
    if (surface.isLocked()) {
      setValue(locked, true)
    }
  })

  // Drag-look fallback (only used when pointer lock isn't active).
  surface.addEventListener('mousedown', (e) => {
    if (!unref(locked) || surface.isLocked()) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  })
  surface.addEventListener('mouseup', () => {
    dragging = false
  })
  surface.addEventListener('blur', () => {
    dragging = false
  })

  surface.addEventListener('mousemove', (e) => {
    if (surface.isLocked()) {
      setValue(yaw, unref(yaw) + e.movementX * SENSITIVITY)
      setValue(pitch, unref(pitch) - e.movementY * SENSITIVITY)
    } else if (dragging) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      setValue(yaw, unref(yaw) + dx * SENSITIVITY)
      setValue(pitch, unref(pitch) - dy * SENSITIVITY)
    }
    setValue(
      pitch,
      Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, unref(pitch)))
    )
  })

  return { yaw, pitch, locked, request, release }
}
