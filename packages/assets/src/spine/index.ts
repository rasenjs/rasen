// --- Data types ---
export * from './types'

// --- Parsers ---
export { parseSpineJson, parseSpineJsonString } from './parsers/spine-json'
export { parseSpineBinary } from './parsers/spine-binary'
export { parseSpineAtlas, computeRegionLocal, computeAttachmentWorld, computeAttachmentWorldVertices, computeClippingWorld, getSequenceRegionName, resolveRegionName } from './parsers/atlas'
export { parseDragonBonesJson, parseDragonBonesJsonString, parseDragonBonesAtlas } from './parsers/dragonbones'

// --- Atlas types ---
export type { AtlasPage, AtlasRegion, SpineAtlas, AttachmentGeometry } from './parsers/atlas'

// --- Runtime (pose solving, animation state, path constraints, hit testing) ---
// The former @rasenjs/assets package was merged into here: assets = parsing +
// runtime, host renderer packages (canvas-2d / webgl) own the components.
export { Skeleton, type Bone, type Slot, type IkConstraintRuntime, type PathConstraintRuntime } from './runtime/skeleton'
export { AnimationState, applyAnimation, getAnimationDuration, type SpineEvent } from './runtime/animation'
export { hitTestSpine, type SpineHit } from './runtime/hit-test'
// Sutherland–Hodgman triangle clipping against a convex clip polygon — the
// geometric equivalent of the official SkeletonClipping.clipTriangles. Pure
// math (no GL), shared by the WebGL and canvas-2d spine renderers.
export { clipTriangleToPolygon, makePolygonClockwise } from './runtime/spine-clip'