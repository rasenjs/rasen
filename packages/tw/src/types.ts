/**
 * The standard style record produced by `tw()`.
 *
 * A flat, camelCase, CSS-like object — deliberately neutral so every render
 * target can consume it directly:
 *
 * - **React Native**: pass it as a `style` prop (RN styles are flat camelCase).
 * - **DOM**: apply it as a camelCase style object (`el.style[key] = value`).
 * - **Perry UI**: the `applyTw` bridge maps each key to the matching
 *   `perry_ui_*` FFI setter (see `@rasenjs/tw/perry`).
 * - **gpui / lvgl**: serialize it and map to the native style struct.
 *
 * Lengths are numbers in **px** (native-friendly) or strings for relative
 * values (`'100%'`, `'50%'`, `'auto'`, `'100vw'`, `'100vh'`). Colors are CSS
 * strings (`'#3B82F6'`, `'rgba(0,0,0,0.5)'`).
 */
export interface TwStyle {
  // ---- Display & Flex -----------------------------------------------------
  display?: 'flex' | 'block' | 'none'
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch'
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
  flexGrow?: number
  flexShrink?: number

  // ---- Sizing -------------------------------------------------------------
  width?: number | string
  height?: number | string
  minWidth?: number | string
  minHeight?: number | string
  maxWidth?: number | string
  maxHeight?: number | string

  // ---- Spacing ------------------------------------------------------------
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  gap?: number
  gapX?: number
  gapY?: number

  // ---- Background & Border ------------------------------------------------
  backgroundColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number

  // ---- Text ---------------------------------------------------------------
  color?: string
  fontSize?: number
  fontWeight?: number
  fontFamily?: string
  textDecoration?: 'none' | 'underline' | 'line-through'

  // ---- Effects ------------------------------------------------------------
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  opacity?: number

  // ---- Misc ---------------------------------------------------------------
  hidden?: boolean
  enabled?: boolean
  tooltip?: string
}

/** A partial style record — the shape of a single token's contribution. */
export type TwStylePatch = Partial<TwStyle>