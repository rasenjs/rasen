/**
 * Step 2 — aggregate expansion + priority merge.
 *
 * `expandAggregates` expands aggregate style keys (`padding`, `margin`,
 * `shadow`, `border`) into single keys so receivers can apply them directly.
 * `mergeStyles` merges multiple style sources with later-wins priority,
 * expanding aggregates per source first — so `{ padding: 16 }` then
 * `{ paddingTop: 4 }` correctly yields `paddingTop: 4` with the other three
 * sides still `16`.
 *
 * Pure TypeScript, zero dependencies — runs in browser / Node / RN / Perry.
 */

/** Normalize a box value (number | string | {top,right,bottom,left}) to sides. */
function normalizeBox(v: unknown): { top: unknown; right: unknown; bottom: unknown; left: unknown } | null {
  if (v == null) return null
  if (typeof v === 'number' || typeof v === 'string') {
    return { top: v, right: v, bottom: v, left: v }
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const top = o.top ?? o.vertical ?? o.all
    const right = o.right ?? o.horizontal ?? o.all
    const bottom = o.bottom ?? o.vertical ?? o.all
    const left = o.left ?? o.horizontal ?? o.all
    if (top === undefined && right === undefined && bottom === undefined && left === undefined) return null
    return { top, right, bottom, left }
  }
  return null
}

/**
 * Expand aggregate keys into single keys.
 *
 * - `padding` / `margin` → per-side single keys
 * - `shadow` (object) → `shadowColor` / `shadowBlur` / `shadowOffsetX` / `shadowOffsetY`
 * - `border` (object) → `borderWidth` / `borderColor`
 * - `gap` is kept as-is (already a single key RN understands)
 */
export function expandAggregates(style: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(style)) {
    if (k === 'padding') {
      const p = normalizeBox(v)
      if (p) {
        out.paddingTop = p.top
        out.paddingRight = p.right
        out.paddingBottom = p.bottom
        out.paddingLeft = p.left
      }
    } else if (k === 'margin') {
      const m = normalizeBox(v)
      if (m) {
        out.marginTop = m.top
        out.marginRight = m.right
        out.marginBottom = m.bottom
        out.marginLeft = m.left
      }
    } else if (k === 'shadow' && v && typeof v === 'object') {
      const s = v as Record<string, unknown>
      if (s.color !== undefined) out.shadowColor = s.color
      if (s.blur !== undefined) out.shadowBlur = s.blur
      if (s.offsetX !== undefined) out.shadowOffsetX = s.offsetX
      if (s.offsetY !== undefined) out.shadowOffsetY = s.offsetY
    } else if (k === 'border' && v && typeof v === 'object') {
      const b = v as Record<string, unknown>
      if (b.width !== undefined) out.borderWidth = b.width
      if (b.color !== undefined) out.borderColor = b.color
    } else {
      out[k] = v
    }
  }
  return out
}

/**
 * Merge multiple style sources into a single single-key record.
 *
 * Later sources override earlier ones. Each source is aggregate-expanded
 * before merging, so aggregate-vs-single conflicts resolve correctly.
 *
 * @example
 * ```ts
 * mergeStyles({ padding: 16 }, { paddingTop: 4 }, { backgroundColor: '#fff' })
 * // => { paddingTop: 4, paddingRight: 16, paddingBottom: 16, paddingLeft: 16, backgroundColor: '#fff' }
 * ```
 */
export function mergeStyles(
  ...sources: Array<Record<string, unknown> | null | undefined>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const src of sources) {
    if (!src) continue
    Object.assign(out, expandAggregates(src))
  }
  return out
}