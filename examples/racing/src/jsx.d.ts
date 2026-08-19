/**
 * JSX type augmentation for the Racing game — exposes WebGL 3D components
 * as lowercase JSX tags.
 */
import type {
  BillboardProps,
  BoxProps,
  GroupProps,
  MeshProps,
  PerspectiveCameraProps,
} from '@rasenjs/webgl'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: MeshProps
      box: BoxProps
      billboard: BillboardProps
      group: GroupProps
      perspectiveCamera: PerspectiveCameraProps
    }
  }
}
