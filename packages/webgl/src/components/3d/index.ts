/**
 * 3D components (Rasen 3D roadmap: Phase 0.3 / 1.1 / 1.2 / 1.3)
 *
 * The WebGL pipeline (MVP shader, Mat4x4f transforms, depth/cull mode in the
 * RenderContext) already supports 3D — these components complete the top of
 * that stack.
 *
 * Organised by responsibility:
 *   - `primitives` — renderable shapes (box, billboard, mesh)
 *   - `voxel`      — pure helpers for voxel worlds (mesh building, ray-casting)
 *
 * Cameras are NOT components: the camera is intrinsic to the canvas and set
 * via the flat `CameraConfig` (RenderContext `camera` option / `setCamera()`).
 */

export { box } from './primitives/box'
export type { BoxProps } from './primitives/box'
export { billboard } from './primitives/billboard'
export type { BillboardProps } from './primitives/billboard'
export { mesh } from './primitives/mesh'
export type { MeshGeometry, MeshProps } from './primitives/mesh'
export { skybox } from './primitives/skybox'
export type { SkyboxProps } from './primitives/skybox'
export { buildVoxelMesh, voxelRaycast } from './voxel/voxel'
export type {
  VoxelFaces,
  VoxelMeshOptions,
  VoxelBox,
  VoxelRaycastHit,
} from './voxel/voxel'
