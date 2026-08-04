/**
 * @rasenjs/rn-dom — elements/shared: 共享样式/常量 helper
 *
 * 供各标签节点类(TextInputNode / SwitchNode / ImageNode / TextElement /
 * ModalNode / ScrollViewNode / ActivityIndicatorNode)的 __RN_normalizeProps 使用。
 * 原 elements.cjs 的 __RN_normalizeProps 内部 helper 迁移至此。
 */

/** Shallow-flatten a style (array → merged object; last object wins).
 *  Enough for prop lookups (resizeMode/tintColor/verticalAlign/userSelect/
 *  fontWeight). Full flattening (numeric styles etc.) is done by Fabric's
 *  ReactNativeStyleAttributes. */
export function flatStyle(style: unknown): Record<string, unknown> | null {
  if (style == null) return null
  if (!Array.isArray(style)) return style as Record<string, unknown>
  let out: Record<string, unknown> | null = null
  for (const item of style) {
    if (item != null && typeof item === 'object' && !Array.isArray(item)) {
      if (!out) out = {}
      for (const k in item as Record<string, unknown>) out[k] = (item as Record<string, unknown>)[k]
    }
  }
  return out
}

/** Append an override object AFTER existing style (last wins in Fabric). */
export function appendStyleOverride(style: unknown, override: Record<string, unknown>): unknown {
  if (style == null) return [override]
  if (Array.isArray(style)) return style.concat([override])
  return [style, override]
}

/** Prepend a base object BEFORE existing style (user style wins). */
export function appendStylePrefix(style: unknown, base: Record<string, unknown>): unknown {
  if (style == null) return [base]
  if (Array.isArray(style)) return [base].concat(style)
  return [base, style]
}

// ── Shared constant maps (mirror RN's Text.js / TextInput.js) ────────
export const VERTICAL_ALIGN_MAP: Record<string, string> = {
  auto: 'auto', top: 'top', bottom: 'bottom', middle: 'center',
}
export const USER_SELECT_TO_SELECTABLE: Record<string, boolean> = {
  auto: true, text: true, none: false, contain: true, all: true,
}

/**
 * 通用 aria-* → accessibility 转换(对齐 RN View.js 的默认 JS 转换)。
 * 返回浅拷贝后的 props。各元素类 normalizeProps 末尾调用:
 *   aria-label→accessibilityLabel、aria-labelledby→accessibilityLabelledBy(数组)、
 *   aria-live→accessibilityLiveRegion(off→none)、aria-hidden→
 *   accessibilityElementsHidden(+importantForAccessibility)、id→nativeID、
 *   tabIndex→focusable、aria-busy/checked/disabled/expanded/selected→
 *   accessibilityState、aria-valuemax/min/now/text→accessibilityValue。
 */
export function applyAria(props: Record<string, unknown>): Record<string, unknown> {
  const next = { ...props }
  const as = props.accessibilityState as Record<string, unknown> | undefined
  if (
    props['aria-busy'] != null || props['aria-checked'] != null ||
    props['aria-disabled'] != null || props['aria-expanded'] != null ||
    props['aria-selected'] != null
  ) {
    next.accessibilityState = {
      busy: props['aria-busy'] ?? as?.busy,
      checked: props['aria-checked'] ?? as?.checked,
      disabled: props['aria-disabled'] ?? as?.disabled,
      expanded: props['aria-expanded'] ?? as?.expanded,
      selected: props['aria-selected'] ?? as?.selected,
    }
  }
  if (props['aria-label'] !== undefined) next.accessibilityLabel = props['aria-label']
  if (props['aria-labelledby'] != null) {
    next.accessibilityLabelledBy = (props['aria-labelledby'] as string).split(/\s*,\s*/g)
  }
  if (props['aria-live'] !== undefined) {
    next.accessibilityLiveRegion = props['aria-live'] === 'off' ? 'none' : props['aria-live']
  }
  if (props['aria-hidden'] !== undefined) {
    next.accessibilityElementsHidden = props['aria-hidden']
    if (props['aria-hidden'] === true) next.importantForAccessibility = 'no-hide-descendants'
  }
  if (props.id != null) next.nativeID = props.id
  if (props.tabIndex !== undefined) next.focusable = !props.tabIndex
  const av = props.accessibilityValue as Record<string, unknown> | undefined
  if (
    props['aria-valuemax'] != null || props['aria-valuemin'] != null ||
    props['aria-valuenow'] != null || props['aria-valuetext'] != null
  ) {
    next.accessibilityValue = {
      max: props['aria-valuemax'] ?? av?.max,
      min: props['aria-valuemin'] ?? av?.min,
      now: props['aria-valuenow'] ?? av?.now,
      text: props['aria-valuetext'] ?? av?.text,
    }
  }
  return next
}

export const SCROLL_BASE_VERTICAL = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'column',
  overflow: 'scroll',
}
export const SCROLL_BASE_HORIZONTAL = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'row',
  overflow: 'scroll',
}
