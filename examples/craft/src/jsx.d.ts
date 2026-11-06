/**
 * JSX type augmentation — exposes webgl 3D components as lowercase JSX tags.
 *
 * TS resolves `jsxImportSource`'s JSX namespace from `<module>/jsx-runtime`,
 * so the augmentation targets `@rasenjs/dom/jsx-runtime`. Runtime: the tags
 * are bound by the vite config's auto-import (same names, vite.config.ts),
 * so DOM and WebGL share one JSX syntax (Rasen's model).
 */
import type {
  BillboardProps,
  BoxProps,
  GroupProps,
  MeshProps,
  RectProps,
} from '@rasenjs/gfx'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: MeshProps
      box: BoxProps
      billboard: BillboardProps
      group: GroupProps
      rect: RectProps
    }
  }
}
