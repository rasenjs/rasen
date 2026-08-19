/**
 * Input — keyboard state for the FPS game.
 */

export { createPointerLockControls } from '@rasenjs/webgl'

/** Track held keys by `e.code`. */
export function setupKeyboard(): Set<string> {
  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    keys.add(e.code)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('blur', () => keys.clear())
  return keys
}
