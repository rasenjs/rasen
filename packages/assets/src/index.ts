/**
 * @rasenjs/assets — Spine + GLTF parsing and data types.
 *
 * Pure parsing: no I/O, no image loading, no fetching.
 * Users implement their own loader using these parsers + @rasenjs/spine runtime.
 */

// --- Spine types + parsers ---
export * from './spine/index'

// --- GLTF ---
export { loadGLTF, parseGLB, type GLTFMesh, type GLTFLoadResult } from './gltf/parser'

// --- Common image utilities ---
export { loadImage, loadImageBitmap, isBrowser } from './common/image'
export type { ImageSource } from './common/image'