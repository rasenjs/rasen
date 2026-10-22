/**
 * A skill button: press to cast, hold to keep casting, drag to aim at any angle.
 *
 * This is the same idea as `bindInput`, applied to a control that owns exactly
 * one DOM element instead of the whole play surface. It is deliberately a plain
 * state machine driven by the element's own pointer handlers — no framework
 * surface, nothing to mount, and unit-testable without a DOM by feeding it
 * samples.
 *
 * The aim angle is converted from the button's screen delta into a world angle
 * here, because that is where the direction comes from: the player drags toward
 * the thing they want to hit, and the 2:1 isometric projection means the screen
 * vector is not the world vector.
 */

import { screenDeltaToWorldAngle } from '../iso'

export interface SkillButtonHandlers {
  /** Aim indicator moved. Called with a world angle. */
  onAim(active: boolean, angle: number): void
  /** Release. `angle` is the aimed world angle, or `null` for a plain tap. */
  onCast(angle: number | null): void
  /** Hold-to-repeat started or stopped. */
  onHold(active: boolean): void
}

export interface SkillButtonOptions {
  /** Drag distance (px) that turns a press into an aim. Default `18`. */
  aimThreshold?: number
  /** Hold time (ms) before the cast starts repeating. Default `420`. */
  holdDelay?: number
}

export class SkillButtonControl {
  private readonly aimThreshold: number
  private readonly holdDelay: number
  private pointerId: number | null = null
  private originX = 0
  private originY = 0
  private dragging = false
  private angle = 0
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly handlers: SkillButtonHandlers,
    options: SkillButtonOptions = {},
  ) {
    this.aimThreshold = options.aimThreshold ?? 18
    this.holdDelay = options.holdDelay ?? 420
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  pointerDown(event: PointerEvent): void {
    if (this.pointerId !== null) return
    const element = event.currentTarget as HTMLElement
    const rect = element.getBoundingClientRect()
    this.pointerId = event.pointerId
    this.originX = rect.left + rect.width / 2
    this.originY = rect.top + rect.height / 2
    this.dragging = false
    this.angle = 0

    try {
      element.setPointerCapture(event.pointerId)
    } catch {
      // Best-effort, as in bindInput.
    }

    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.dragging || this.pointerId === null) return
      // Holding a skill button means "keep casting this", which is the whole
      // point of a hold gesture on a touch layout.
      this.handlers.onCast(null)
      this.handlers.onHold(true)
    }, this.holdDelay)

    event.preventDefault()
    event.stopPropagation()
  }

  pointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return
    const dx = event.clientX - this.originX
    const dy = event.clientY - this.originY
    if (!this.dragging && Math.hypot(dx, dy) < this.aimThreshold) return
    if (!this.dragging) {
      this.dragging = true
      this.clearTimer()
    }
    this.angle = screenDeltaToWorldAngle(dx, dy)
    this.handlers.onAim(true, this.angle)
  }

  pointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return
    this.clearTimer()
    const wasDragging = this.dragging
    const angle = this.angle
    this.reset()
    this.handlers.onHold(false)
    this.handlers.onAim(false, angle)
    this.handlers.onCast(wasDragging ? angle : null)
  }

  pointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return
    this.clearTimer()
    const angle = this.angle
    this.reset()
    this.handlers.onHold(false)
    this.handlers.onAim(false, angle)
  }

  private reset(): void {
    this.pointerId = null
    this.dragging = false
  }
}
