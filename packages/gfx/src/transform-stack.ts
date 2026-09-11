/**
 * Group-hierarchy transform state + stack, shared by every backend.
 *
 * `rotation` is an alias for rotationZ (2D compatibility). The composition
 * (push) math lives here ONCE — RenderContext and WebGPURoot both own a
 * TransformStack, so group nesting composes identically on WebGL and WebGPU.
 */

export interface TransformState {
  tx: number
  ty: number
  tz: number
  rotation: number      // Alias for rotationZ (2D compatibility)
  rotationX: number
  rotationY: number
  rotationZ: number
  scaleX: number
  scaleY: number
  scaleZ: number
  opacity: number
}

export const IDENTITY_TRANSFORM: TransformState = {
  tx: 0,
  ty: 0,
  tz: 0,
  rotation: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  opacity: 1,
}

/** Object form accepted by addShape/pushTransform (fields default like the
 *  identity). */
export interface TransformInput {
  tx: number
  ty: number
  tz?: number
  rotationX?: number
  rotationY?: number
  rotationZ?: number
  scaleX?: number
  scaleY?: number
  scaleZ?: number
  opacity?: number
}

export class TransformStack {
  private current: TransformState = { ...IDENTITY_TRANSFORM }
  private stack: TransformState[] = []

  push(transform: Partial<TransformState>): void {
    this.stack.push({ ...this.current })

    const tx = transform.tx ?? 0
    const ty = transform.ty ?? 0
    const tz = transform.tz ?? 0
    const rotationX = transform.rotationX ?? 0
    const rotationY = transform.rotationY ?? 0
    const rotationZ = transform.rotationZ ?? 0
    const scaleX = transform.scaleX ?? 1
    const scaleY = transform.scaleY ?? 1
    const scaleZ = transform.scaleZ ?? 1
    const opacity = transform.opacity ?? 1

    const parent = this.current

    const cos = Math.cos(parent.rotationZ)
    const sin = Math.sin(parent.rotationZ)
    const rotatedX = tx * cos - ty * sin
    const rotatedY = tx * sin + ty * cos

    this.current = {
      tx: parent.tx + rotatedX * parent.scaleX,
      ty: parent.ty + rotatedY * parent.scaleY,
      tz: parent.tz + tz * parent.scaleZ,
      rotation: parent.rotationZ + rotationZ,  // Alias for rotationZ
      rotationX: parent.rotationX + rotationX,
      rotationY: parent.rotationY + rotationY,
      rotationZ: parent.rotationZ + rotationZ,
      scaleX: parent.scaleX * scaleX,
      scaleY: parent.scaleY * scaleY,
      scaleZ: parent.scaleZ * scaleZ,
      opacity: parent.opacity * opacity,
    }
  }

  pop(): void {
    const previous = this.stack.pop()
    if (previous) {
      this.current = previous
    }
  }

  /** A copy of the current state (callers may mutate their copy). */
  snapshot(): TransformState {
    return { ...this.current }
  }

  reset(): void {
    this.stack = []
    this.current = { ...IDENTITY_TRANSFORM }
  }
}
