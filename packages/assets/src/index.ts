/**
 * @rasenjs/assets — Spine + GLTF parsing, data types and the Spine runtime.
 *
 * Pure data layer: parsers (no I/O, no image loading) plus the Spine runtime
 * (Skeleton pose solving, AnimationState, path constraints, hit testing).
 * Host renderer packages (canvas-2d / webgl) own the rendering components.
 */

// --- Spine types + parsers ---
export * from './spine/index'

// --- GLTF ---
export { loadGLTF, parseGLB, type GLTFMesh, type GLTFLoadResult } from './gltf/parser'

// --- Common image utilities (host-injected adapter; no DOM at runtime) ---
export { loadImage, loadImageBitmap, loadImages, setImageAdapter, type ImageAdapter, type ImageLike } from './common/image'
export type { ImageSource } from './common/image'