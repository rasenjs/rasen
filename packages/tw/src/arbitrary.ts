/**
 * Arbitrary value parsing — `prefix-[value]` syntax, e.g. `bg-[#505050]`,
 * `w-[500px]`, `p-[10px]`, `text-[20px]`, `rounded-[8px]`, `opacity-[0.5]`.
 *
 * Underscores inside the value are decoded to spaces (Tailwind convention).
 */

import { parseColor } from './color'
import type { TwStylePatch } from './types'

/** Parse a px / rem / plain-number length. Returns `null` when not a length. */
export function parseLength(raw: string): number | null {
  const s = raw.trim()
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^-?\d+(\.\d+)?px$/.test(s)) return Number(s.slice(0, -2))
  if (/^-?\d+(\.\d+)?rem$/.test(s)) return Number(s.slice(0, -3)) * 16
  return null
}

/** Parse a size value: length or percentage string (`'50%'`). */
export function parseSize(raw: string): number | string | null {
  const s = raw.trim()
  const len = parseLength(s)
  if (len !== null) return len
  if (/^-?\d+(\.\d+)?%$/.test(s)) return s
  return null
}

function isColor(v: string): boolean {
  return parseColor(v) !== null
}

function len(v: string): number | null {
  return parseLength(v)
}

function size(v: string): number | string | null {
  return parseSize(v)
}

type ArbitraryResolver = (value: string) => TwStylePatch | null

const ARBITRARY: Record<string, ArbitraryResolver> = {
  bg: (v) => ({ backgroundColor: v }),
  // `text-[#ff0000]` → color, `text-[20px]` → fontSize
  text: (v) => (isColor(v) ? { color: v } : { fontSize: len(v) ?? undefined }),
  // `border-[#123456]` → borderColor, `border-[2px]` → borderWidth
  border: (v) => (isColor(v) ? { borderColor: v } : { borderWidth: len(v) ?? undefined }),
  w: (v) => ({ width: size(v) ?? undefined }),
  h: (v) => ({ height: size(v) ?? undefined }),
  'min-w': (v) => ({ minWidth: size(v) ?? undefined }),
  'max-w': (v) => ({ maxWidth: size(v) ?? undefined }),
  'min-h': (v) => ({ minHeight: size(v) ?? undefined }),
  'max-h': (v) => ({ maxHeight: size(v) ?? undefined }),
  size: (v) => {
    const l = size(v)
    return l === null ? null : { width: l, height: l }
  },
  p: (v) => {
    const n = len(v)
    return n === null ? null : { paddingTop: n, paddingRight: n, paddingBottom: n, paddingLeft: n }
  },
  px: (v) => {
    const n = len(v)
    return n === null ? null : { paddingLeft: n, paddingRight: n }
  },
  py: (v) => {
    const n = len(v)
    return n === null ? null : { paddingTop: n, paddingBottom: n }
  },
  pt: (v) => ({ paddingTop: len(v) ?? undefined }),
  pr: (v) => ({ paddingRight: len(v) ?? undefined }),
  pb: (v) => ({ paddingBottom: len(v) ?? undefined }),
  pl: (v) => ({ paddingLeft: len(v) ?? undefined }),
  m: (v) => {
    const n = len(v)
    return n === null ? null : { marginTop: n, marginRight: n, marginBottom: n, marginLeft: n }
  },
  mx: (v) => {
    const n = len(v)
    return n === null ? null : { marginLeft: n, marginRight: n }
  },
  my: (v) => {
    const n = len(v)
    return n === null ? null : { marginTop: n, marginBottom: n }
  },
  mt: (v) => ({ marginTop: len(v) ?? undefined }),
  mr: (v) => ({ marginRight: len(v) ?? undefined }),
  mb: (v) => ({ marginBottom: len(v) ?? undefined }),
  ml: (v) => ({ marginLeft: len(v) ?? undefined }),
  gap: (v) => ({ gap: len(v) ?? undefined }),
  'gap-x': (v) => ({ gapX: len(v) ?? undefined }),
  'gap-y': (v) => ({ gapY: len(v) ?? undefined }),
  rounded: (v) => ({ borderRadius: len(v) ?? undefined }),
  opacity: (v) => ({ opacity: len(v) ?? undefined }),
  flex: (v) => {
    const n = len(v)
    return n === null ? null : { flexGrow: n, flexShrink: n }
  },
  font: (v) => ({ fontFamily: v }),
  // `shadow-[#000]` → shadowColor, `shadow-[8px]` → shadowBlur
  shadow: (v) => (isColor(v) ? { shadowColor: v } : { shadowBlur: len(v) ?? undefined })
}

const ARBITRARY_RE = /^([a-z-]+)-\[(.+)\]$/

/**
 * Parse a single arbitrary-value token into a style patch.
 *
 * @returns `null` when the token is not an arbitrary value or its value
 *          cannot be interpreted.
 */
export function parseArbitrary(token: string): TwStylePatch | null {
  const m = ARBITRARY_RE.exec(token)
  if (!m) return null
  const prefix = m[1]
  const raw = m[2].replace(/_/g, ' ')
  const resolver = ARBITRARY[prefix]
  if (!resolver) return null
  return resolver(raw)
}