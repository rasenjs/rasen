/**
 * Every lowercase tag the DOM host owns — pure data, for an app's
 * `unplugin-auto-import` bindings:
 *
 * ```ts
 * AutoImport({
 *   include: [/\.tsx$/],
 *   imports: [
 *     { '@rasenjs/dom': [...DOM_TAGS] },   // host names: elements + canvas + Fragment
 *     { '@rasenjs/gfx': ['mesh', 'box'] }, // the app's own components
 *   ],
 * })
 * ```
 *
 * The host knows its names; *how* they bind is auto-import's own
 * declarative `imports` map — no resolver, no function, nothing to wire.
 * Recipe: www/guide/advanced/jsx.
 */
import { HTML_TAGS } from '@rasenjs/core/html-tags'

/** The DOM host's names: every element it renders, the canvas bridge, and `<>…</>`. */
export const DOM_TAGS: readonly string[] = [...HTML_TAGS, 'canvas', 'Fragment']
