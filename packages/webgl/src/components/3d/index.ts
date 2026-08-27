/**
 * 3D components (Rasen 3D roadmap: Phase 0.3 / 1.1 / 1.2 / 1.3)
 *
 * The WebGL pipeline (MVP shader, Mat4x4f transforms, depth/cull mode in the
 * RenderContext) already supports 3D — these components complete the top of
 * that stack.
 *
 * Organised by responsibility:
 *   - `primitives` — renderable shapes (box, billboard, mesh)
 *   - `cameras`    — view/projection components (perspective, ortho, first-person)
 *   - `voxel`      — pure helpers for voxel worlds (mesh building, ray-casting)
 */

export { box } from './primitives/box'
export type { BoxProps } from './primitives/box'
export { billboard } from './primitives/billboard'
export type { BillboardProps } from './primitives/billboard'
export { mesh } from './primitives/mesh'
export type { MeshGeometry, MeshProps } from './primitives/mesh'
export { skybox } from './primitives/skybox'
export type { SkyboxProps } from './primitives/skybox'
export { PerspectiveCamera, OrthographicCamera } from './cameras/camera'
export type {
  CameraProps,
  PerspectiveCameraProps,
  OrthographicCameraProps,
} from './cameras/camera'
export { FirstPersonCamera, forwardVector, rightVector, createLookControls } from './cameras/first-person-camera'
export type {
  FirstPersonCameraProps,
  LookRefs,
  LookControls,
} from './cameras/first-person-camera'
export { buildVoxelMesh, voxelRaycast } from './voxel/voxel'
export type {
  VoxelFaces,
  VoxelMeshOptions,
  VoxelBox,
  VoxelRaycastHit,
} from './voxel/voxel'
