/**
 * JSX type augmentation — exposes canvas-2d components as lowercase JSX tags.
 *
 * TS resolves `jsxImportSource`'s JSX namespace from `<module>/jsx-runtime`,
 * so the augmentation targets `@rasenjs/dom/jsx-runtime`. Runtime: the tags
 * are registered via `configureTags` in main.ts (matching the names below),
 * so DOM and canvas share one JSX syntax (Rasen's model).
 */
import type {
  GroupProps,
  ImageProps,
  RectProps,
  SpriteProps,
  TextProps,
} from '@rasenjs/canvas-2d'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      rect: RectProps
      image: ImageProps
      text: TextProps
      group: GroupProps
      sprite: SpriteProps
    }
  }
}
