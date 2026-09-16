/**
 * Step 1-2 — CSS string → style object.
 *
 * Parses a CSS stylesheet (as produced by an external interpreter such as the
 * real Tailwind / UnoCSS engine) into a `Map<className, styleObject>`.
 *
 * The output is a **neutral** camelCase style object: kebab-case properties
 * are converted generically (`padding-top` → `paddingTop`, `row-gap` →
 * `rowGap`), values are normalized (px → number, rem → px, 3-digit hex →
 * 6-digit), and **aggregate keys are kept as-is** (`padding`, `margin`,
 * `shadow`, `border`) — they are expanded by Step 2 (`mergeStyles`).
 *
 * This module is pure TypeScript with zero runtime dependencies, so it runs
 * identically in the browser, Node, RN (Hermes), and Perry (TS → native).
 */

/** Convert a kebab-case CSS property to generic camelCase. */
export function kebabToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())
}

/** Minimal safe arithmetic evaluator for `calc()` — no `eval`. */
function evalExpr(tokens: string[], i: { n: number }): number {
  let value = parseTerm(tokens, i)
  while (i.n < tokens.length && (tokens[i.n] === '+' || tokens[i.n] === '-')) {
    const op = tokens[i.n++]
    const rhs = parseTerm(tokens, i)
    value = op === '+' ? value + rhs : value - rhs
  }
  return value
}

function parseTerm(tokens: string[], i: { n: number }): number {
  let value = parseFactor(tokens, i)
  while (i.n < tokens.length && (tokens[i.n] === '*' || tokens[i.n] === '/')) {
    const op = tokens[i.n++]
    const rhs = parseFactor(tokens, i)
    value = op === '*' ? value * rhs : value / rhs
  }
  return value
}

function parseFactor(tokens: string[], i: { n: number }): number {
  const t = tokens[i.n]
  if (t === '(') {
    i.n++
    const v = evalExpr(tokens, i)
    i.n++ // consume ')'
    return v
  }
  i.n++
  return parseFloat(t)
}

function evalCalc(expr: string): string | null {
  const cleaned = expr.replace(/([\d.]+)[a-z%]+/g, (_: string, n: string) => n)
  const tokens = cleaned.match(/-?\d*\.?\d+|[+\-*/()]/g)
  if (!tokens) return null
  try {
    return `${evalExpr(tokens, { n: 0 })}px`
  } catch {
    return null
  }
}

/** Normalize a CSS declaration value to a number or string. */
export function convertValue(value: string): string | number | undefined {
  let v = value.trim().replace(/\s*!important\s*$/, '')
  // Strip surrounding quotes (e.g. font-family: "Menlo").
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  // rem → px (16px base).
  v = v.replace(/([\d.]+)rem\b/g, (_: string, n: string) => `${parseFloat(n) * 16}px`)
  // calc() → evaluated px.
  v = v.replace(/calc\(([^)]+)\)/g, (_: string, expr: string) => evalCalc(expr) ?? expr)
  // 3-digit hex → 6-digit.
  v = v.replace(/#([0-9a-fA-F]{3})\b/g, (_: string, hex: string) => {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  })
  if (v === '0') return 0
  if (/^\d+$/.test(v)) return parseInt(v, 10)
  if (/^[\d.]+(px)?$/.test(v)) return parseFloat(v)
  return v
}

/**
 * Parse a CSS stylesheet into a `Map<className, styleObject>`.
 *
 * Only top-level class rules (`.foo { ... }`) are collected; prefixed
 * properties (`-webkit-*`, `--custom`) are skipped.
 */
export function cssToStyle(cssText: string): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  const ruleRegex = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)\s*\{([^}]+)\}/g
  let m: RegExpExecArray | null
  while ((m = ruleRegex.exec(cssText)) !== null) {
    const className = m[1]
    const body = m[2]
    const style: Record<string, unknown> = {}
    const declRegex = /([\w-]+)\s*:\s*([^;]+);/g
    let d: RegExpExecArray | null
    while ((d = declRegex.exec(body)) !== null) {
      const cssProp = d[1].trim()
      if (cssProp.startsWith('-')) continue // skip -webkit-*, --custom, etc.
      const cssValue = d[2].trim()
      const prop = kebabToCamel(cssProp)
      const val = convertValue(cssValue)
      if (val !== undefined) style[prop] = val
    }
    if (Object.keys(style).length > 0) map.set(className, style)
  }
  return map
}