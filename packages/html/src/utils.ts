/**
 * HTML 转义字符映射
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

/**
 * 转义 HTML 特殊字符，防止 XSS
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/**
 * 转义属性值
 */
export function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPE_MAP[char] || char)
}

/**
 * 将属性值转换为字符串
 */
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

/**
 * 将样式对象转换为 style 属性字符串
 */
export function stringifyStyle(
  styles: Record<string, string | number | null | undefined>
): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(styles)) {
    if (value !== null && value !== undefined) {
      // 将 camelCase 转换为 kebab-case
      const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase()
      parts.push(`${kebabKey}: ${value}`)
    }
  }
  return parts.join('; ')
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
