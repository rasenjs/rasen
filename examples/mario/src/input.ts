/**
 * Input handling (keyboard + touch buttons).
 *
 * Exposes held-state (left/right/jump) plus an edge-triggered jump press
 * so a single tap starts a jump even while holding.
 */

export class Input {
  left = false
  right = false
  jump = false
  private jumpEdge = false

  pressLeft() {
    this.left = true
  }
  releaseLeft() {
    this.left = false
  }
  pressRight() {
    this.right = true
  }
  releaseRight() {
    this.right = false
  }
  pressJump() {
    if (!this.jump) this.jumpEdge = true
    this.jump = true
  }
  releaseJump() {
    this.jump = false
  }
  /** Consume a fresh jump press (returns true exactly once per press). */
  consumeJump(): boolean {
    const edge = this.jumpEdge
    this.jumpEdge = false
    return edge
  }
}

const KEYMAP: Record<string, 'left' | 'right' | 'jump'> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
}

export function setupKeyboard(input: Input): void {
  const onDown = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code]
    if (!action) return
    e.preventDefault()
    if (action === 'left') input.pressLeft()
    else if (action === 'right') input.pressRight()
    else input.pressJump()
  }
  const onUp = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code]
    if (!action) return
    if (action === 'left') input.releaseLeft()
    else if (action === 'right') input.releaseRight()
    else input.releaseJump()
  }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', () => {
    input.left = false
    input.right = false
    input.jump = false
    input.releaseJump()
  })
}
