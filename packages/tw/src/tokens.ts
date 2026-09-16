/**
 * The curated token table: Tailwind-style class → style patch.
 *
 * Coverage is deliberately aligned with the native targets that already
 * consume Tailwind-style classes (`@rasenjs/gpui`'s `tw_parser.rs` and
 * `@rasenjs/lvgl`'s `tw_parser.c`): display, flex layout, sizing, spacing,
 * colors, borders, text, and effects — plus arbitrary values handled by
 * `parseArbitrary`.
 *
 * The table is a plain object (built once at module init) so lookups are
 * O(1). The AOT generator (`tw-generate`) expands the same source into a
 * fully-static per-app table.
 */

import type { TwStylePatch } from './types'

export const TOKENS: Record<string, TwStylePatch> = {
  // ---- Display ------------------------------------------------------------
  flex: { display: 'flex' },
  block: { display: 'block' },
  hidden: { display: 'none' },

  // ---- Flex direction -----------------------------------------------------
  'flex-row': { flexDirection: 'row' },
  'flex-col': { flexDirection: 'column' },
  'flex-row-reverse': { flexDirection: 'row-reverse' },
  'flex-col-reverse': { flexDirection: 'column-reverse' },

  // ---- Flex wrap ----------------------------------------------------------
  'flex-wrap': { flexWrap: 'wrap' },
  'flex-nowrap': { flexWrap: 'nowrap' },
  'flex-wrap-reverse': { flexWrap: 'wrap-reverse' },

  // ---- Justify content ----------------------------------------------------
  'justify-start': { justifyContent: 'flex-start' },
  'justify-end': { justifyContent: 'flex-end' },
  'justify-center': { justifyContent: 'center' },
  'justify-between': { justifyContent: 'space-between' },
  'justify-around': { justifyContent: 'space-around' },
  'justify-evenly': { justifyContent: 'space-evenly' },

  // ---- Align items --------------------------------------------------------
  'items-start': { alignItems: 'flex-start' },
  'items-end': { alignItems: 'flex-end' },
  'items-center': { alignItems: 'center' },
  'items-baseline': { alignItems: 'baseline' },
  'items-stretch': { alignItems: 'stretch' },

  // ---- Flex grow / shrink -------------------------------------------------
  'flex-1': { flexGrow: 1, flexShrink: 1 },
  'flex-auto': { flexGrow: 1, flexShrink: 1 },
  'flex-none': { flexGrow: 0, flexShrink: 0 },
  grow: { flexGrow: 1 },
  'grow-0': { flexGrow: 0 },
  shrink: { flexShrink: 1 },
  'shrink-0': { flexShrink: 0 },

  // ---- Borders ------------------------------------------------------------
  border: { borderWidth: 1 },
  'border-0': { borderWidth: 0 },
  'border-2': { borderWidth: 2 },
  'border-4': { borderWidth: 4 },
  'border-8': { borderWidth: 8 },

  // ---- Text decoration ----------------------------------------------------
  underline: { textDecoration: 'underline' },
  'line-through': { textDecoration: 'line-through' },
  'no-underline': { textDecoration: 'none' }
}

// ---- Spacing scale (px, 4px base) -----------------------------------------
const SPACING: Record<string, number> = {
  '0': 0,
  px: 1,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '11': 44,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
  '24': 96,
  '28': 112,
  '32': 128,
  '36': 144,
  '40': 160,
  '44': 176,
  '48': 192,
  '52': 208,
  '56': 224,
  '60': 240,
  '64': 256,
  '72': 288,
  '80': 320,
  '96': 384
}

for (const [k, v] of Object.entries(SPACING)) {
  TOKENS[`p-${k}`] = { paddingTop: v, paddingRight: v, paddingBottom: v, paddingLeft: v }
  TOKENS[`px-${k}`] = { paddingLeft: v, paddingRight: v }
  TOKENS[`py-${k}`] = { paddingTop: v, paddingBottom: v }
  TOKENS[`pt-${k}`] = { paddingTop: v }
  TOKENS[`pr-${k}`] = { paddingRight: v }
  TOKENS[`pb-${k}`] = { paddingBottom: v }
  TOKENS[`pl-${k}`] = { paddingLeft: v }
  TOKENS[`m-${k}`] = { marginTop: v, marginRight: v, marginBottom: v, marginLeft: v }
  TOKENS[`mx-${k}`] = { marginLeft: v, marginRight: v }
  TOKENS[`my-${k}`] = { marginTop: v, marginBottom: v }
  TOKENS[`mt-${k}`] = { marginTop: v }
  TOKENS[`mr-${k}`] = { marginRight: v }
  TOKENS[`mb-${k}`] = { marginBottom: v }
  TOKENS[`ml-${k}`] = { marginLeft: v }
  TOKENS[`gap-${k}`] = { gap: v }
  TOKENS[`gap-x-${k}`] = { gapX: v }
  TOKENS[`gap-y-${k}`] = { gapY: v }
  TOKENS[`w-${k}`] = { width: v }
  TOKENS[`h-${k}`] = { height: v }
  TOKENS[`min-w-${k}`] = { minWidth: v }
  TOKENS[`min-h-${k}`] = { minHeight: v }
  TOKENS[`max-w-${k}`] = { maxWidth: v }
  TOKENS[`max-h-${k}`] = { maxHeight: v }
  TOKENS[`size-${k}`] = { width: v, height: v }
}

// ---- Sizing specials ------------------------------------------------------
const SIZING: Record<string, string> = {
  auto: 'auto',
  full: '100%',
  'min': 'min-content',
  'max': 'max-content',
  fit: 'fit-content',
  '1/2': '50%',
  '1/3': '33.333%',
  '2/3': '66.667%',
  '1/4': '25%',
  '3/4': '75%',
  '1/5': '20%',
  '2/5': '40%',
  '3/5': '60%',
  '4/5': '80%',
  '1/6': '16.667%',
  '5/6': '83.333%',
  '1/12': '8.333%',
  '5/12': '41.667%',
  '7/12': '58.333%',
  '11/12': '91.667%'
}

for (const [k, v] of Object.entries(SIZING)) {
  TOKENS[`w-${k}`] = { width: v }
  TOKENS[`h-${k}`] = { height: v }
  TOKENS[`min-w-${k}`] = { minWidth: v }
  TOKENS[`min-h-${k}`] = { minHeight: v }
  TOKENS[`max-w-${k}`] = { maxWidth: v }
  TOKENS[`max-h-${k}`] = { maxHeight: v }
  TOKENS[`size-${k}`] = { width: v, height: v }
}
TOKENS['w-screen'] = { width: '100vw' }
TOKENS['h-screen'] = { height: '100vh' }
TOKENS['min-w-screen'] = { minWidth: '100vw' }
TOKENS['min-h-screen'] = { minHeight: '100vh' }
TOKENS['max-w-screen'] = { maxWidth: '100vw' }
TOKENS['max-h-screen'] = { maxHeight: '100vh' }
TOKENS['size-screen'] = { width: '100vw', height: '100vh' }

// ---- Font size ------------------------------------------------------------
const FONT_SIZE: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
  '4xl': 36,
  '5xl': 48,
  '6xl': 60,
  '7xl': 72,
  '8xl': 96,
  '9xl': 128
}
for (const [k, v] of Object.entries(FONT_SIZE)) {
  TOKENS[`text-${k}`] = { fontSize: v }
}

// ---- Font weight ----------------------------------------------------------
const FONT_WEIGHT: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900
}
for (const [k, v] of Object.entries(FONT_WEIGHT)) {
  TOKENS[`font-${k}`] = { fontWeight: v }
}

// ---- Font family ----------------------------------------------------------
const FONT_FAMILY: Record<string, string> = {
  sans: 'system-ui, sans-serif',
  serif: 'ui-serif, serif',
  mono: 'ui-monospace, monospace'
}
for (const [k, v] of Object.entries(FONT_FAMILY)) {
  TOKENS[`font-${k}`] = { fontFamily: v }
}

// ---- Border radius --------------------------------------------------------
const RADIUS: Record<string, number> = {
  none: 0,
  sm: 2,
  DEFAULT: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 9999
}
for (const [k, v] of Object.entries(RADIUS)) {
  TOKENS[k === 'DEFAULT' ? 'rounded' : `rounded-${k}`] = { borderRadius: v }
}

// ---- Opacity --------------------------------------------------------------
const OPACITY: Record<string, number> = {
  '0': 0,
  '5': 0.05,
  '10': 0.1,
  '20': 0.2,
  '25': 0.25,
  '30': 0.3,
  '40': 0.4,
  '50': 0.5,
  '60': 0.6,
  '70': 0.7,
  '75': 0.75,
  '80': 0.8,
  '90': 0.9,
  '95': 0.95,
  '100': 1
}
for (const [k, v] of Object.entries(OPACITY)) {
  TOKENS[`opacity-${k}`] = { opacity: v }
}

// ---- Shadow ---------------------------------------------------------------
const SHADOW: Record<string, TwStylePatch> = {
  sm: { shadowColor: 'rgba(0,0,0,0.05)', shadowBlur: 2, shadowOffsetY: 1 },
  DEFAULT: { shadowColor: 'rgba(0,0,0,0.1)', shadowBlur: 3, shadowOffsetY: 1 },
  md: { shadowColor: 'rgba(0,0,0,0.1)', shadowBlur: 6, shadowOffsetY: 2 },
  lg: { shadowColor: 'rgba(0,0,0,0.1)', shadowBlur: 10, shadowOffsetY: 4 },
  xl: { shadowColor: 'rgba(0,0,0,0.1)', shadowBlur: 20, shadowOffsetY: 8 }
}
for (const [k, v] of Object.entries(SHADOW)) {
  TOKENS[k === 'DEFAULT' ? 'shadow' : `shadow-${k}`] = v
}

// ---- Colors (Tailwind v3 palette) -----------------------------------------
const PALETTE: Record<string, Record<string, string>> = {
  slate: {
    '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1',
    '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155',
    '800': '#1e293b', '900': '#0f172a', '950': '#020617'
  },
  gray: {
    '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db',
    '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151',
    '800': '#1f2937', '900': '#111827', '950': '#030712'
  },
  zinc: {
    '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '300': '#d4d4d8',
    '400': '#a1a1aa', '500': '#71717a', '600': '#52525b', '700': '#3f3f46',
    '800': '#27272a', '900': '#18181b', '950': '#09090b'
  },
  neutral: {
    '50': '#fafafa', '100': '#f5f5f5', '200': '#e5e5e5', '300': '#d4d4d4',
    '400': '#a3a3a3', '500': '#737373', '600': '#525252', '700': '#404040',
    '800': '#262626', '900': '#171717', '950': '#0a0a0a'
  },
  stone: {
    '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '300': '#d6d3d1',
    '400': '#a8a29e', '500': '#78716c', '600': '#57534e', '700': '#44403c',
    '800': '#292524', '900': '#1c1917', '950': '#0c0a09'
  },
  red: {
    '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5',
    '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c',
    '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a'
  },
  orange: {
    '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74',
    '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c',
    '800': '#9a3412', '900': '#7c2d12', '950': '#431407'
  },
  amber: {
    '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d',
    '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309',
    '800': '#92400e', '900': '#78350f', '950': '#451a03'
  },
  yellow: {
    '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047',
    '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207',
    '800': '#854d0e', '900': '#713f12', '950': '#422006'
  },
  lime: {
    '50': '#f7fee7', '100': '#ecfccb', '200': '#d9f99d', '300': '#bef264',
    '400': '#a3e635', '500': '#84cc16', '600': '#65a30d', '700': '#4d7c0f',
    '800': '#3f6212', '900': '#365314', '950': '#1a2e05'
  },
  green: {
    '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac',
    '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d',
    '800': '#166534', '900': '#14532d', '950': '#052e16'
  },
  emerald: {
    '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7',
    '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857',
    '800': '#065f46', '900': '#064e3b', '950': '#022c22'
  },
  teal: {
    '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4',
    '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e',
    '800': '#115e59', '900': '#134e4a', '950': '#042f2e'
  },
  cyan: {
    '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9',
    '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490',
    '800': '#155e75', '900': '#164e63', '950': '#083344'
  },
  sky: {
    '50': '#f0f9ff', '100': '#e0f2fe', '200': '#bae6fd', '300': '#7dd3fc',
    '400': '#38bdf8', '500': '#0ea5e9', '600': '#0284c7', '700': '#0369a1',
    '800': '#075985', '900': '#0c4a6e', '950': '#082f49'
  },
  blue: {
    '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd',
    '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8',
    '800': '#1e40af', '900': '#1e3a8a', '950': '#172554'
  },
  indigo: {
    '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc',
    '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca',
    '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b'
  },
  violet: {
    '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd',
    '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9',
    '800': '#5b21b6', '900': '#4c1d95', '950': '#2e1065'
  },
  purple: {
    '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe',
    '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce',
    '800': '#6b21a8', '900': '#581c87', '950': '#3b0764'
  },
  fuchsia: {
    '50': '#fdf4ff', '100': '#fae8ff', '200': '#f5d0fe', '300': '#f0abfc',
    '400': '#e879f9', '500': '#d946ef', '600': '#c026d3', '700': '#a21caf',
    '800': '#86198f', '900': '#701a75', '950': '#4a044e'
  },
  pink: {
    '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4',
    '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d',
    '800': '#9d174d', '900': '#831843', '950': '#500724'
  },
  rose: {
    '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af',
    '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c',
    '800': '#9f1239', '900': '#881337', '950': '#4c0519'
  }
}

for (const [name, shades] of Object.entries(PALETTE)) {
  for (const [shade, hex] of Object.entries(shades)) {
    TOKENS[`bg-${name}-${shade}`] = { backgroundColor: hex }
    TOKENS[`text-${name}-${shade}`] = { color: hex }
    TOKENS[`border-${name}-${shade}`] = { borderColor: hex }
  }
}

// ---- Named colors ---------------------------------------------------------
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
  current: 'currentColor'
}
for (const [name, value] of Object.entries(NAMED_COLORS)) {
  TOKENS[`bg-${name}`] = { backgroundColor: value }
  TOKENS[`text-${name}`] = { color: value }
  TOKENS[`border-${name}`] = { borderColor: value }
}