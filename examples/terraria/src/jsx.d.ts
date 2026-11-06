/**
 * JSX type augmentation — canvas-2d components as lowercase JSX tags.
 *
 * TypeScript resolves `jsxImportSource`'s JSX namespace from `<module>/jsx-runtime`,
 * so this targets `@rasenjs/dom/jsx-runtime`. The runtime half is the vite
 * config's auto-import, with the same names — DOM and canvas share one JSX
 * syntax, which is the model.
 *
 * `each` is not declared here: it is a core helper used as an expression rather
 * than as a tag, so it never reaches the JSX namespace.
 */
import type {
  CircleProps,
  GroupProps,
  RectProps,
  TextProps,
} from '@rasenjs/canvas-2d'

declare module '@rasenjs/dom/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      rect: RectProps
      circle: CircleProps
      text: TextProps
      group: GroupProps
    }
  }
}
