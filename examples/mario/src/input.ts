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
  run = false
  down = false
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
  pressRun() {
    this.run = true
  }
  releaseRun() {
    this.run = false
  }
  pressDown() {
    this.down = true
  }
  releaseDown() {
    this.down = false
  }
  /** Consume a fresh jump press (returns true exactly once per press). */
  consumeJump(): boolean {
    const edge = this.jumpEdge
    this.jumpEdge = false
    return edge
  }
}

const KEYMAP: Record<
  string,
  'left' | 'right' | 'jump' | 'run' | 'down'
> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  KeyX: 'run',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  ArrowDown: 'down',
  KeyS: 'down',
}

export function setupKeyboard(input: Input): void {
  const onDown = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code]
    if (!action) return
    e.preventDefault()
    if (action === 'left') input.pressLeft()
    else if (action === 'right') input.pressRight()
    else if (action === 'run') input.pressRun()
    else if (action === 'down') input.pressDown()
    else input.pressJump()
  }
  const onUp = (e: KeyboardEvent) => {
    const action = KEYMAP[e.code]
    if (!action) return
    if (action === 'left') input.releaseLeft()
    else if (action === 'right') input.releaseRight()
    else if (action === 'run') input.releaseRun()
    else if (action === 'down') input.releaseDown()
    else input.releaseJump()
  }
  window.addEventListener('keydown', onDown)
  window.addEventListener('keyup', onUp)
  window.addEventListener('blur', () => {
    input.left = false
    input.right = false
    input.run = false
    input.down = false
    input.releaseJump()
  })
}
