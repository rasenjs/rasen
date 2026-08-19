/**
 * Keyboard input — WASD driving controls (matches Godot input map:
 * forward=W, back=S, left=A, right=D, bounce=Space).
 */
import type { Keys } from './vehicle'

export function setupKeyboard(): Keys {
  const keys: Keys = { forward: false, back: false, left: false, right: false }
  const map: Record<string, keyof Keys> = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
  }
  window.addEventListener('keydown', (e) => {
    const k = map[e.code]
    if (k) { keys[k] = true; e.preventDefault() }
  })
  window.addEventListener('keyup', (e) => {
    const k = map[e.code]
    if (k) keys[k] = false
  })
  return keys
}