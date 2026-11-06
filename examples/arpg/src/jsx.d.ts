/**
 * JSX type augmentation — exposes canvas-2d components as lowercase JSX tags.
 *
 * TS resolves `jsxImportSource`'s JSX namespace from `<module>/jsx-runtime`, so
 * the augmentation targets `@rasenjs/dom/jsx-runtime`. The runtime side is
 * the vite config's auto-import, with the same names — DOM and canvas share one
 * JSX syntax, which is Rasen's model.
 */
import type {
  CircleProps,
  GroupProps,
  ImageProps,
  LineProps,
  PolygonProps,
  RectProps,
  RingProps,
  SpriteProps,
  TextProps,
} from '@rasenjs/canvas-2d'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      rect: RectProps
      circle: CircleProps
      ring: RingProps
      line: LineProps
      polygon: PolygonProps
      image: ImageProps
      text: TextProps
      group: GroupProps
      sprite: SpriteProps
    }
  }
}
