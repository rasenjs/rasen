/**
 * The DOM host's tag manifest — the data a build tool needs to resolve tags.
 *
 * Pass it to the compiler to get the host's defaults, or spread it to extend:
 *
 * ```ts
 * import { TAG_MANIFEST } from '@rasenjs/dom/tags'
 * rasenCompile.vite({
 *   tagManifest: {
 *     elements: [...TAG_MANIFEST.elements, 'marquee'],
 *     components: { ...TAG_MANIFEST.components, widget: { module: '@rasenjs/ui' } },
 *   },
 * })
 * ```
 *
 * `elements` are host elements: they compile to a `template()` and are never
 * imported. `components` are lowercase tags that resolve to a module import
 * (`<canvas/>` → `canvas({…})` from `@rasenjs/dom`), because the JSX transform
 * would otherwise read them as host-element strings. Pure data — importing this
 * module pulls no runtime code, and in particular not the GL stack behind
 * `canvas`.
 */
import { HTML_TAGS } from '@rasenjs/core/html-tags'

export const COMPONENT_TAGS = {
  canvas: { module: '@rasenjs/dom' },
}

export const TAG_MANIFEST = {
  elements: HTML_TAGS,
  components: COMPONENT_TAGS,
} as const
