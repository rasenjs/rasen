/**
 * @rasenjs/rn-html — HTML-like native tags for React Native.
 *
 * This package owns the *native* side of HTML tags; @rasenjs/rn-dom owns the
 * DOM-shaped API. They meet on one convention: rn-dom resolves a tag it does
 * not know by trying `HTML` + Capitalized(tag) + `Element`, so `div` becomes
 * `HTMLDivElement` — the name the native components below are registered under.
 *
 * Bringing a component up is RN's own side effect: `requireNativeComponent(name)`
 * asks the native registry for the component and caches its view config. The host
 * app must have installed the native package (autolinking) before this runs.
 */

// Static import on purpose: Metro resolves dependencies by scanning for literal
// `require('...')` / import statements. A lazily-called `require('react-native')`
// gets wrapped by the bundler into an indirect helper (`__require("react-native")`)
// that Metro cannot see, so react-native is never registered as a dependency and
// the call throws `Unknown named module: "react-native"` at runtime.
import { requireNativeComponent } from 'react-native'

// ─────────────────────────────────────────────────────────────────────────────
// Tag table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HTML tags that have a native host in this package.
 *
 * Kept as the single source of truth: it drives `registerHtmlComponents()` and
 * is exported so renderers can enumerate supported tags.
 */
export const HTML_TAGS = [
  'div',
  'span',
] as const

/**
 * Tags that actually render on iOS today.
 *
 * iOS has no legacy text view manager left to reuse (text is
 * `RCTParagraphComponentView`, a native Fabric component), so `span` has no iOS
 * host yet — it renders as <UnimplementedView>. Android is complete.
 */
export const HTML_TAGS_IOS = ['div'] as const

export type HtmlTag = (typeof HTML_TAGS)[number]

/**
 * Tag → native component name, implementing rn-dom's fallback convention.
 *
 * `div` → `HTMLDivElement`, `span` → `HTMLSpanElement`.
 */
export function nativeNameFor(tag: string): string {
  return 'HTML' + tag.charAt(0).toUpperCase() + tag.slice(1) + 'Element'
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bring every rn-html component into RN's view config registry.
 *
 * Call once from the app entry file, before creating any element:
 *
 * ```js
 * import { registerHtmlComponents } from '@rasenjs/rn-html'
 * registerHtmlComponents()
 * ```
 *
 * Safe to call more than once — registration is memoized by RN.
 */
export function registerHtmlComponents(): void {
  // requireNativeComponent is a side effect: it populates RN's
  // ReactNativeViewConfigRegistry with the config for that component.
  for (const tag of HTML_TAGS) {
    requireNativeComponent(nativeNameFor(tag))
  }
}
