/**
 * HTML 转义与属性序列化工具
 *
 * Escaping and style serialization are re-exported from @rasenjs/core: the DOM
 * renderer writes the same markup through the same rules, so a second copy here
 * would be a second thing to keep in sync (and escaping is security-relevant).
 */
import { escapeHtml, escapeAttr, stringifyStyleInline } from '@rasenjs/core'

export { escapeHtml, escapeAttr }

/** 将属性值转换为字符串 */
export function stringifyAttr(
  name: string,
  value: string | number | boolean | null | undefined
): string {
  if (value === null || value === undefined || value === false) {
    return ''
  }
  if (value === true) {
    return ` ${name}`
  }
  return ` ${name}="${escapeAttr(String(value))}"`
}

/** 将样式对象转换为 style 属性字符串 */
export function stringifyStyle(
  styles: Record<string, unknown>
): string {
  return stringifyStyleInline(styles)
}

/**
 * 将类名数组或对象转换为 class 属性字符串
 */
export function stringifyClass(
  className: string | string[] | Record<string, boolean> | undefined
): string {
  if (!className) {
    return ''
  }
  if (typeof className === 'string') {
    return className
  }
  if (Array.isArray(className)) {
    return className.filter(Boolean).join(' ')
  }
  // 对象形式 { 'class-name': true/false }
  return Object.entries(className)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ')
}

/**
 * 自闭合标签列表
 */
export const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

/**
 * 判断是否为自闭合标签
 */
export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase())
}
