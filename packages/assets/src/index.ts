/**
 * @rasenjs/assets — asset format parsers and the Spine runtime.
 *
 * Pure data layer: parsers (no I/O, no image loading) plus the Spine runtime
 * (Skeleton pose solving, AnimationState, path constraints, hit testing).
 * Host renderer packages (canvas-2d / webgl) own the rendering components.
 */

// --- Spine types + parsers ---
export * from './spine/index'

// --- Granny 3D containers (retail builds ship BitKnit2 payloads) ---
export * from './gr2/index'

// --- NVN texture containers and swizzled layouts ---
export * from './nvn/index'

// --- Diablo II level layout (.ds1) ---
export * from './d2/index'

// --- GLTF ---
export { loadGLTF, parseGLB, type GLTFMesh, type GLTFLoadResult } from './gltf/parser'

// --- Common image utilities (adapter slot lives in @rasenjs/core; no DOM at runtime) ---
export { loadImage, loadImageBitmap, loadImages, type ImageAdapter, type ImageLike } from './common/image'
export type { ImageSource } from './common/image'

// --- Checksums (asset manifests) ---
export { md5, md5Hex } from './common/md5'
