/**
 * Input — touch-first input for the ARPG slice.
 *
 * Everything here is host-agnostic except `dom.ts`: pure state machines that
 * turn contacts into intent, plus the thin adapters that feed them from
 * pointer events. The game only reads intent.
 *
 * The point of keeping this inside the game (rather than in a package) is that
 * the abstraction is not obvious yet: once the game has shown which of these
 * shapes actually get reused, the reusable half moves to `packages/input`.
 */

export {
  angleBetween,
  angleDelta,
  clamp,
  distance,
  type PointerSample,
  type Vec2,
} from './types'

export {
  createGestureRecognizer,
  type GestureEvent,
  type GestureHandler,
  type GestureOptions,
  type GestureRecognizer,
} from './gestures'

export {
  createVirtualStick,
  type VirtualStick,
  type VirtualStickOptions,
} from './stick'

export {
  computeAim,
  pickAutoTarget,
  type AimOptions,
  type AimResult,
  type AutoTargetOptions,
  type TargetLike,
} from './aim'

export {
  bindInput,
  sampleFromEvent,
  type BindInputOptions,
  type GestureBinding,
  type StickBinding,
} from './dom'

export { SkillButtonControl, type SkillButtonHandlers, type SkillButtonOptions } from './aim-button'
