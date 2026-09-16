/**
 * CSS color parsing — converts CSS color strings into normalized RGBA
 * channels in `[0, 1]`, the shape Perry UI's FFI setters expect.
 *
 * Supports: hex (`#rgb`, `#rrggbb`, `#rrggbbaa`), `rgb()` / `rgba()`,
 * `hsl()` / `hsla()`, and a small set of named colors.
 */

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = {
  transparent: '#00000000',
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  brown: '#a52a2a',
  navy: '#000080',
  teal: '#008080',
  silver: '#c0c0c0',
  gold: '#ffd700',
  lime: '#00ff00',
  maroon: '#800000',
  olive: '#808000',
  aqua: '#00ffff',
  fuchsia: '#ff00ff',
  indigo: '#4b0082',
  violet: '#ee82ee',
  coral: '#ff7f50',
  salmon: '#fa8072',
  tomato: '#ff6347',
  khaki: '#f0e68c',
  turquoise: '#40e0d0',
  plum: '#dda0dd',
  orchid: '#da70d6',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  ivory: '#fffff0',
  snow: '#fffafa',
  mint: '#f5fffa',
  lavender: '#e6e6fa',
  skyblue: '#87ceeb',
  steelblue: '#4682b4',
  slateblue: '#6a5acd',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  darkred: '#8b0000',
  darkgreen: '#006400',
  darkblue: '#00008b',
  darkorange: '#ff8c00',
  darkviolet: '#9400d3',
  lightblue: '#add8e6',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightyellow: '#ffffe0',
  lightcyan: '#e0ffff',
  darkcyan: '#008b8b',
  darkmagenta: '#8b008b',
  darkkhaki: '#bdb76b',
  darkolive: '#556b2f',
  darkorchid: '#9932cc',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkgoldenrod: '#b8860b',
  lightcoral: '#f08080',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  mediumblue: '#0000cd',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  palevioletred: '#db7093',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  powderblue: '#b0e0e6',
  rebeccapurple: '#663399',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  skyblue2: '#87ceeb',
  slateGray: '#708090',
  springgreen: '#00ff7f',
  steelBlue: '#4682b4',
  thistle: '#d8bfd8',
  wheat: '#f5deb3',
  whitesmoke: '#f5f5f5',
  yellowgreen: '#9acd32'
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

function hexToRgba(hex: string): RgbaColor | null {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (h.length !== 6 && h.length !== 8) return null
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
  return { r, g, b, a }
}

function rgbToRgba(s: string): RgbaColor | null {
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+%?)\s*)?\)/i)
  if (!m) return null
  const r = Number(m[1]) / 255
  const g = Number(m[2]) / 255
  const b = Number(m[3]) / 255
  let a = m[4] === undefined ? 1 : Number(m[4])
  if (m[4]?.endsWith('%')) a = Number(m[4].slice(0, -1)) / 100
  if ([r, g, b, a].some((n) => Number.isNaN(n))) return null
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) }
}

function hslToRgba(s: string): RgbaColor | null {
  const m = s.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+%?)\s*)?\)/i)
  if (!m) return null
  const h = ((Number(m[1]) % 360) + 360) % 360 / 360
  const sPct = Number(m[2]) / 100
  const l = Number(m[3]) / 100
  let a = m[4] === undefined ? 1 : Number(m[4])
  if (m[4]?.endsWith('%')) a = Number(m[4].slice(0, -1)) / 100
  if ([h, sPct, l, a].some((n) => Number.isNaN(n))) return null

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + sPct) : l + sPct - l * sPct
  const p = 2 * l - q
  return {
    r: clamp01(hue2rgb(p, q, h + 1 / 3)),
    g: clamp01(hue2rgb(p, q, h)),
    b: clamp01(hue2rgb(p, q, h - 1 / 3)),
    a: clamp01(a)
  }
}

/**
 * Parse a CSS color string into normalized RGBA channels in `[0, 1]`.
 *
 * @returns `null` when the string is not a recognized color.
 */
export function parseColor(input: string): RgbaColor | null {
  const s = input.trim()
  if (!s) return null
  if (s.startsWith('#')) return hexToRgba(s)
  if (/^rgba?\(/i.test(s)) return rgbToRgba(s)
  if (/^hsla?\(/i.test(s)) return hslToRgba(s)
  const named = NAMED[s.toLowerCase()]
  if (named) return hexToRgba(named)
  return null
}