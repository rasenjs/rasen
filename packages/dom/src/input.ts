/**
 * Input adapters — DOM bindings for host-agnostic input state machines.
 *
 * The look state machine (`createLookControls`) lives here: pure
 * delta → yaw/pitch logic, zero event API. This module is the DOM side:
 * pointer-lock API, event listeners, keyboard state. Games assemble one line
 * here instead of hand-rolling listeners.
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { Ref } from '@rasenjs/core'

/** Refs the look controls drive (standard Rasen opaque refs). */
export interface LookControlRefs {
  yaw: Ref<number>
  pitch: Ref<number>
  /** True once mouse control is active (pointer lock or drag fallback). */
  locked: Ref<boolean>
}

export interface LookControls {
  /** Apply a look delta (pointer movement or drag distance), then clamp pitch. */
  applyDelta(dx: number, dy: number): void
  /** Clamp pitch into [-limit, +limit]. */
  clampPitch(): void
}

const LOOK_SENSITIVITY = 0.0022
const PITCH_LIMIT = Math.PI / 2 - 0.01

/**
 * Pure look state machine: delta → yaw/pitch, pitch clamped. Host-agnostic:
 * reads/writes go through the runtime's opaque Ref contract, never events/DOM
 * — the host adapter feeds it.
 */
export function createLookControls(
  refs: { yaw: Ref<number>; pitch: Ref<number> },
  opts?: { sensitivity?: number; pitchLimit?: number },
): LookControls {
  const rt = getReactiveRuntime()
  const sensitivity = opts?.sensitivity ?? LOOK_SENSITIVITY
  const limit = opts?.pitchLimit ?? PITCH_LIMIT
  const clampPitch = () => {
    rt.setValue(refs.pitch, Math.max(-limit, Math.min(limit, rt.unref(refs.pitch))))
  }
  return {
    applyDelta(dx, dy) {
      rt.setValue(refs.yaw, rt.unref(refs.yaw) + dx * sensitivity)
      rt.setValue(refs.pitch, rt.unref(refs.pitch) - dy * sensitivity)
      clampPitch()
    },
    clampPitch,
  }
}

export interface BoundLookControls {
  /** Request pointer lock on the canvas (call from a user gesture). */
  request(): void
  /** Exit pointer lock / stop mouse control. */
  release(): void
  /** The underlying pure state machine (for custom input sources). */
  look: ReturnType<typeof createLookControls>
}

export interface BindLookControlsOptions {
  /** Radians per pixel of movement (default 0.0022). */
  sensitivity?: number
  /** Pitch clamp in radians (default π/2 − 0.01). */
  pitchLimit?: number
}

/**
 * Bind pointer-lock + drag-look controls to a canvas element.
 *
 * Wires the DOM side (pointerlockchange/mousedown/mousemove/mouseup/blur)
 * and feeds deltas into the camera's pure look state machine. Pointer lock
 * failure falls back to drag-look so the game still works in restricted
 * environments (iframes, headless).
 *
 * @example
 * ```ts
 * const controls = bindLookControls(canvasEl, { yaw, pitch, locked })
 * canvasEl.addEventListener('click', () => {
 *   if (!getReactiveRuntime().unref(controls.locked)) controls.request()
 * })
 * ```
 */
export function bindLookControls(
  canvasEl: HTMLCanvasElement,
  refs: LookControlRefs,
  opts?: BindLookControlsOptions,
): BoundLookControls {
  const look = createLookControls(
    { yaw: refs.yaw, pitch: refs.pitch },
    { sensitivity: opts?.sensitivity, pitchLimit: opts?.pitchLimit },
  )

  let dragging = false
  let lastX = 0
  let lastY = 0

  const isLocked = () => document.pointerLockElement === canvasEl

  const request = () => {
    try {
      canvasEl.requestPointerLock()
    } catch {
      // requestPointerLock threw — unsupported here; enable drag fallback.
      getReactiveRuntime().setValue(refs.locked, true)
      return
    }
    // Lock is granted asynchronously; if it never arrives (denied /
    // unsupported), enable the drag fallback so the game still starts.
    globalThis.setTimeout(() => {
      if (!isLocked()) getReactiveRuntime().setValue(refs.locked, true)
    }, 250)
  }

  const release = () => {
    if (isLocked()) document.exitPointerLock()
    getReactiveRuntime().setValue(refs.locked, false)
    dragging = false
  }

  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) getReactiveRuntime().setValue(refs.locked, true)
  })

  // Drag-look fallback (only used when pointer lock isn't active).
  document.addEventListener('mousedown', (e) => {
    if (!getReactiveRuntime().unref(refs.locked) || isLocked()) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  })
  document.addEventListener('mouseup', () => {
    dragging = false
  })
  window.addEventListener('blur', () => {
    dragging = false
  })

  document.addEventListener('mousemove', (e) => {
    if (isLocked()) {
      look.applyDelta(e.movementX, e.movementY)
    } else if (dragging) {
      look.applyDelta(e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
    }
  })

  return { request, release, look }
}

/**
 * Track held keys by `e.code` (KeyW / Space / ShiftLeft …).
 *
 * @param preventDefault key codes that should not scroll the page while held.
 * @returns a live Set of currently-held codes; add a listener via onChange or
 *          poll it from the game loop.
 */
export function setupKeyboard(
  preventDefault: string[] = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
): Set<string> {
  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    if (preventDefault.includes(e.code)) e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
  return keys
}
