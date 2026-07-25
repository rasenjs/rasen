/**
 * @rasenjs/vue-rn/web — createElement
 *
 * Low-level VNode factory for RN-like components.
 * Handles RN→DOM prop mapping, style resolution, accessibility.
 *
 * Usage:
 *   createElement('View', { style: { flex: 1 } }, slots.default?.())
 *   // → <div class="r-xxx" ...>
 */

import { h } from 'vue'
import type { VNode } from 'vue'
import { StyleSheet, expandRule } from './stylesheet'
import type { RegisteredStyle } from './stylesheet'

// ── Tag map ──────────────────────────────────────────────────────────

const TAG_MAP: Record<string, string> = {
  View: 'div', Text: 'span', Image: 'img',
  TextInput: 'input', ScrollView: 'div',
  SafeAreaView: 'div', ActivityIndicator: 'div', Switch: 'div',
}

// ── Event map ────────────────────────────────────────────────────────

const EVENT_MAP: Record<string, string> = {
  onTouchEnd: 'onClick', onPress: 'onClick',
  onPressIn: 'onMouseDown', onPressOut: 'onMouseUp',
  onLongPress: 'onContextMenu',
  onChange: 'onChange', onFocus: 'onFocus', onBlur: 'onBlur',
  onSubmitEditing: 'onSubmit', onKeyPress: 'onKeyDown',
  onLayout: '', // skipped
  onContentSizeChange: '',
  onTouchStart: 'onTouchStart', onTouchMove: 'onTouchMove',
  onTouchCancel: 'onTouchCancel',
}

// ── Attr map ─────────────────────────────────────────────────────────

const ATTR_MAP: Record<string, string> = {
  accessibilityLabel: 'aria-label', accessibilityRole: 'role',
  testID: 'data-testid', nativeID: 'id',
}

// ── Style resolution ─────────────────────────────────────────────────

function resolveStyle(style: unknown): [string, Record<string, unknown> | null] {
  if (!style) return ['', null]
  if (Array.isArray(style)) return StyleSheet.resolve(style)
  if ((style as RegisteredStyle).$$css) return [(style as RegisteredStyle).className, null]
  return StyleSheet.resolve([style])
}

// ── Accessibility state ──────────────────────────────────────────────

const A11Y_MAP: Record<string, string> = {
  disabled: 'aria-disabled', selected: 'aria-selected',
  checked: 'aria-checked', expanded: 'aria-expanded',
  busy: 'aria-busy', hidden: 'aria-hidden',
}

function resolveA11Y(state: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(state)) {
    r[A11Y_MAP[k] ?? k] = v
  }
  return r
}

// ── createElement ────────────────────────────────────────────────────

export interface RNProps {
  style?: unknown
  class?: unknown
  children?: VNode | VNode[] | string | null
  [key: string]: unknown
}

export function createElement(type: string, props: RNProps | null, _children?: VNode | VNode[] | string | null): VNode {
  const tag = TAG_MAP[type] ?? type
  if (!props) return h(tag, {}, _children)

  // Handle TextInput multiline → textarea
  if (type === 'TextInput' && props.multiline === true) {
    return createElement('textarea', { ...props, multiline: undefined, type: undefined }, _children)
  }

  // Resolve style
  const [className, inlineStyle] = resolveStyle(props.style)

  // Build HTML attrs
  const a: Record<string, unknown> = {}
  let hasClass = false

  for (const [key, value] of Object.entries(props)) {
    if (key === 'style' || key === 'children' || key === 'key') continue

    // Class
    if (key === 'class' || key === 'className') {
      if (value) a.class = className ? `${className} ${value}` : value
      hasClass = true
      continue
    }

    // Events
    if (key.startsWith('on')) {
      const mapped = EVENT_MAP[key]
      if (mapped === '') continue // skip (onLayout etc)
      const domKey = mapped ?? key
      if (typeof value === 'function') a[domKey] = value
      continue
    }

    // Accessibility state
    if (key === 'accessibilityState' && typeof value === 'object' && value) {
      Object.assign(a, resolveA11Y(value as Record<string, unknown>))
      continue
    }

    // source → src
    if (key === 'source' && type === 'Image') {
      const src = (value as any)?.uri ?? (value as any)?.url ?? value
      if (src) a.src = String(src)
      continue
    }

    // resizeMode → object-fit
    if (key === 'resizeMode' && type === 'Image') {
      a.style = { ...(a.style as object || {}), objectFit: ({ cover: 'cover', contain: 'contain', stretch: 'fill', center: 'none' })[String(value)] ?? value }
      continue
    }

    // secureTextEntry → type=password
    if (key === 'secureTextEntry') {
      if (value) a.type = 'password'
      continue
    }

    // numberOfLines
    if (key === 'numberOfLines') {
      const n = Number(value)
      a.style = { ...(a.style as object || {}), overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical' }
      continue
    }

    // href/target/rel → pass through
    if (key === 'href' || key === 'target' || key === 'rel') { a[key] = value; continue }

    // Map attrs
    const domKey = ATTR_MAP[key] ?? key
    const SKIP = ['$$css', 'multiline', 'numberOfLines', 'resizeMode', 'source',
      'accessibilityState', 'accessibilityLabel', 'accessibilityRole',
      'testID', 'nativeID', 'secureTextEntry']
    if (!SKIP.includes(key)) a[domKey] = value
  }

  if (!hasClass && className) a.class = className
  if (inlineStyle) {
    const existing = a.style as Record<string, unknown> | undefined
    a.style = existing ? { ...existing, ...inlineStyle } : inlineStyle
  }

  return h(tag, a, _children)
}
