/**
 * JSX type augmentation for FPS game — exposes WebGL 3D components
 * as lowercase JSX tags.
 */
import type {
  BillboardProps,
  BoxProps,
  FirstPersonCameraProps,
  GroupProps,
  MeshProps,
  RectProps,
  SkyboxProps,
} from '@rasenjs/gfx'
import type { WeaponProps } from './weapon'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      firstPersonCamera: FirstPersonCameraProps
      mesh: MeshProps
      box: BoxProps
      billboard: BillboardProps
      group: GroupProps
      rect: RectProps
      skybox: SkyboxProps
      weapon: WeaponProps
    }
  }
}
