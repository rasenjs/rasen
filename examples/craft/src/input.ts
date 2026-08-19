/**
 * Input — keyboard state + pointer-lock mouse look.
 *
 * The mouse-look logic lives in the framework (`@rasenjs/webgl` controls);
 * this module keeps the keyboard state and re-exports the controls for the
 * app, so example code stays about the game, not input plumbing.
 */

import { createPointerLockControls } from '@rasenjs/webgl'
import type { PointerLockControls } from '@rasenjs/webgl'

/** Mouse-look controls returned for this example. */
export type MouseControls = PointerLockControls

export { createPointerLockControls }

/** Track held keys by `e.code` (KeyW / KeyA / Space / ShiftLeft …). */
export function setupKeyboard(): Set<string> {
  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    // Don't scroll the page with space / arrows while playing.
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
  return keys
}
