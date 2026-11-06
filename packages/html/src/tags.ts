/**
 * Every lowercase tag the HTML (string) host owns — pure data, for an app's
 * `unplugin-auto-import` bindings:
 *
 * ```ts
 * AutoImport({
 *   include: [/\.tsx$/],
 *   imports: [{ '@rasenjs/html': [...HTML_TAGS] }],
 * })
 * ```
 *
 * The host knows its names; *how* they bind is auto-import's own
 * declarative `imports` map — no resolver, no function, nothing to wire.
 * Recipe: www/guide/advanced/jsx.
 *
 * `canvas` is a plain element here (no GL bridge) — which is exactly what
 * the DOM host's list must NOT mean; each host ships its own list for that
 * reason.
 */
import { HTML_TAGS as BASE_HTML_TAGS } from '@rasenjs/core/html-tags'

/** The string host's names: every element it serialises, plus `<>…</>`. */
export const HTML_TAGS: readonly string[] = [...BASE_HTML_TAGS, 'canvas', 'Fragment']
