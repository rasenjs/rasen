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

import type { Ref } from '@rasenjs/core'

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
 * Create pointer-lock + drag-look controls for a canvas.
 *
 * @param canvas The canvas that captures the pointer.
 * @param refs   Injected yaw/pitch/locked refs to drive.
 *
 * @example
 * ```ts
 * const controls = createPointerLockControls(canvas, { yaw, pitch, locked })
 * canvasEl.addEventListener('click', () => {
 *   if (!controls.locked.value) controls.request()
 * })
 * ```
 */
export function createPointerLockControls(
  canvas: HTMLCanvasElement,
  refs: PointerLockControlRefs,
): PointerLockControls {
  const { yaw, pitch, locked } = refs
  let dragging = false
  let lastX = 0
  let lastY = 0

  const request = () => {
    try {
      canvas.requestPointerLock()
    } catch {
      // requestPointerLock threw — pointer lock unsupported here.
      locked.value = true
      return
    }
    // Pointer lock is granted asynchronously. If it never arrives (denied /
    // unsupported), enable the drag fallback so the game still starts.
    window.setTimeout(() => {
      if (document.pointerLockElement !== canvas) {
        locked.value = true
      }
    }, 250)
  }

  const release = () => {
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    locked.value = false
    dragging = false
  }

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      locked.value = true
    }
  })

  // Drag-look fallback (only used when pointer lock isn't active).
  canvas.addEventListener('mousedown', (e) => {
    if (!locked.value || document.pointerLockElement === canvas) return
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
  })
  window.addEventListener('mouseup', () => {
    dragging = false
  })
  window.addEventListener('blur', () => {
    dragging = false
  })

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      yaw.value += e.movementX * SENSITIVITY
      pitch.value -= e.movementY * SENSITIVITY
    } else if (dragging) {
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      yaw.value += dx * SENSITIVITY
      pitch.value -= dy * SENSITIVITY
    }
    pitch.value = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.value))
  })

  return { yaw, pitch, locked, request, release }
}
