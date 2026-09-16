/**
 * @rasenjs/tw — high-performance Tailwind-style class interpreter.
 *
 * Converts Tailwind-style class strings into a standard flat camelCase style
 * record (`TwStyle`) that every render target can consume directly:
 *
 * - **React Native**: pass the record as a `style` prop.
 * - **DOM**: apply it as a camelCase style object.
 * - **Perry UI**: use `@rasenjs/tw/perry`'s `applyTw` to map it to native
 *   FFI setters.
 * - **gpui / lvgl**: serialize it and map to the native style struct.
 *
 * Performance: memoized runtime interpreter (`tw`) + optional AOT-generated
 * static table (`createTw` + `tw-generate` CLI).
 *
 * @example
 * ```ts
 * import { tw } from '@rasenjs/tw'
 * tw('flex flex-col gap-2 bg-[#505050]')
 * // => { display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#505050' }
 * ```
 */

export { tw, createTw, resolveClasses } from './interpreter'
export { TOKENS } from './tokens'
export { parseArbitrary, parseLength, parseSize } from './arbitrary'
export { cssToStyle, kebabToCamel, convertValue } from './css'
export { mergeStyles, expandAggregates } from './merge'
export type { TwStyle, TwStylePatch } from './types'