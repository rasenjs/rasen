/**
 * @rasenjs/vue-rn/web — StyleSheet
 *
 * Converts RN style objects to atomic CSS rules injected into the DOM.
 * Mirrors react-native-web's StyleSheet.create() approach.
 *
 * StyleSheet.create() produces opaque objects with $$css flag.
 * Components use StyleSheet.resolve() to get [className, inlineStyle].
 *
 * Usage:
 *   const s = StyleSheet.create({ root: { flex: 1 } })
 *   // s.root → { className: 'r-1a', $$css: true }
 *   StyleSheet.resolve([s.root, { opacity: 0.5 }])
 *   // → ['r-1a', { opacity: 0.5 }]
 */

let _injected = false
const STYLE_ID = '__rasen_stylesheet__'
const classCache = new Map<string, string>()
let counter = 0
function nextClass(): string {
  return `r-${(++counter).toString(36)}`
}

// ── Property expansion ────────────────────────────────────────────────

const UNITLESS: Record<string, true> = {
  flex: true, flexGrow: true, flexShrink: true,
  opacity: true, zIndex: true, fontWeight: true,
  aspectRatio: true,
}

const SHORTHANDS: Record<string, string[]> = {
  paddingHorizontal: ['paddingLeft', 'paddingRight'],
  paddingVertical: ['paddingTop', 'paddingBottom'],
  marginHorizontal: ['marginLeft', 'marginRight'],
  marginVertical: ['marginTop', 'marginBottom'],
}

function expandKey(key: string): string[] {
  return SHORTHANDS[key] ?? [key]
}

function cssVal(key: string, value: unknown): string {
  if (typeof value === 'number' && !(key in UNITLESS)) return `${value}px`
  return String(value)
}

function camelToKebab(key: string): string {
  return key.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)
}

export function expandRule(key: string, value: unknown): [string, string][] {
  return expandKey(key).map(k => [camelToKebab(k), cssVal(key, value)])
}

// ── CSS injection ────────────────────────────────────────────────────

let sheet: CSSStyleSheet | null = null

function getSheet(): CSSStyleSheet | null {
  if (typeof document === 'undefined') return null
  if (sheet) return sheet
  const el = document.getElementById(STYLE_ID) as HTMLStyleElement
  if (el) { sheet = el.sheet as CSSStyleSheet; return sheet }
  const style = document.createElement('style')
  style.id = STYLE_ID
  document.head!.appendChild(style)
  sheet = style.sheet as CSSStyleSheet
  return sheet
}

function inject(rule: string): void {
  const s = getSheet()
  if (!s) return
  try { s.insertRule(rule, s.cssRules.length) } catch { /* skip invalid */ }
}

// ── Atomic compilation ────────────────────────────────────────────────

export function compileAtomic(key: string, value: unknown): string | null {
  const ck = `${key}:${String(value)}`
  const cached = classCache.get(ck)
  if (cached) return cached
  const pairs = expandRule(key, value)
  if (!pairs.length) return null
  const cn = nextClass()
  for (const [k, v] of pairs) inject(`.${cn}{${k}:${v}}`)
  classCache.set(ck, cn)
  return cn
}

// ── StyleSheet API ──────────────────────────────────────────────────

export interface RegisteredStyle {
  className: string
  $$css: true
}

export const StyleSheet = {
  create<T extends Record<string, Record<string, unknown>>>(styles: T): { [K in keyof T]: RegisteredStyle } {
    const r = {} as any
    for (const [name, rules] of Object.entries(styles)) {
      const cls: string[] = []
      for (const [k, v] of Object.entries(rules)) {
        if (v == null) continue
        const c = compileAtomic(k, v)
        if (c) cls.push(c)
      }
      r[name] = { className: cls.join(' '), $$css: true }
    }
    return r
  },

  resolve(styles: unknown[]): [string, Record<string, unknown> | null] {
    let cls = ''
    let inline: Record<string, unknown> | null = null
    for (const s of styles) {
      if (!s) continue
      if ((s as RegisteredStyle).$$css) {
        cls += (s as RegisteredStyle).className + ' '
      } else if (typeof s === 'object') {
        for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
          if (v == null) continue
          if (!inline) inline = {}
          for (const [ck, cv] of expandRule(k, v)) inline[ck] = cv
        }
      }
    }
    return [cls.trim(), inline]
  },

  injectKeyframes(name: string, css: string): void {
    inject(`@keyframes ${name}{${css}}`)
  },
}

// ── Reset styles (injected once) ─────────────────────────────────────

export function injectReset(): void {
  if (_injected) return
  _injected = true
  const rules = [
    'body{margin:0}',
    'html{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:rgba(0,0,0,0)}',
    'input::-webkit-search-cancel-button,input::-webkit-search-decoration,input::-webkit-search-results-button,input::-webkit-search-results-decoration{display:none}',
    'button::-moz-focus-inner,input::-moz-focus-inner{border:0;padding:0}',
  ]
  for (const r of rules) inject(r)
  StyleSheet.injectKeyframes('rasen-spin', '0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}')
}
