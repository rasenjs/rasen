/**
 * Built-in Lynx element components
 *
 * Thin wrappers over `element()` for the built-in tags. Any other tag
 * (custom elements included) stays reachable through `element(tag, props)`.
 */

import type { Mountable } from '@rasenjs/core'
import type { LynxNode } from './node'
import type { LynxElementProps } from './element'
import { element } from './element'

/** <view> — layout container */
export function view(props: LynxElementProps = {}): Mountable<LynxNode> {
  return element('view', props)
}

/** <text> — text container; string children become raw text nodes */
export function text(props: LynxElementProps = {}): Mountable<LynxNode> {
  return element('text', props)
}

/** <image> — image element */
export function image(props: LynxElementProps = {}): Mountable<LynxNode> {
  return element('image', props)
}

/** <scroll-view> — scrollable container */
export function scrollView(props: LynxElementProps = {}): Mountable<LynxNode> {
  return element('scroll-view', props)
}

/** <page> — page root */
export function page(props: LynxElementProps = {}): Mountable<LynxNode> {
  return element('page', props)
}
