/**
 * @rasenjs/spine — self-developed Spine runtime.
 *
 * Parsers and types live in `@rasenjs/assets`. This package re-exports
 * them for backward compatibility and provides the runtime (Skeleton,
 * AnimationState).
 */

// --- Re-export types + parsers from @rasenjs/assets ---
export * from '@rasenjs/assets'

// --- Runtime (stay here — depends on the types above) ---
export { Skeleton, type Bone, type Slot, type IkConstraintRuntime, type PathConstraintRuntime } from './skeleton'
export { AnimationState, applyAnimation, getAnimationDuration, type SpineEvent } from './animation'
export { hitTestSpine, type SpineHit } from './hit-test'
