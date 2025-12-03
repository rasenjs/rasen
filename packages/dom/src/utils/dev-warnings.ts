/**
 * 开发环境警告工具
 *
 * 使用方式确保生产环境可以被 tree-shaking 掉：
 * - 所有警告函数内部使用 __DEV__ 判断
 * - 打包工具应配置 __DEV__ 在生产环境为 false
 */

/**
 * 开发环境标识
 * 打包工具应该将此替换为 false（生产）或 true（开发）
 *
 * Vite: define: { __DEV__: JSON.stringify(!isProduction) }
 * Rollup/esbuild: 使用 replace 插件
 */
declare const __DEV__: boolean

/**
 * 是否为开发环境
 */
const isDev =
  typeof __DEV__ !== 'undefined'
    ? __DEV__
    : typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'

/**
 * 常见的 DOM 事件名称（用于检测大小写错误）
 */
const COMMON_EVENT_NAMES = new Set([
  'click',
  'dblclick',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseenter',
  'mouseleave',
  'mouseover',
  'mouseout',
  'keydown',
  'keyup',
  'keypress',
  'focus',
  'blur',
  'focusin',
  'focusout',
  'input',
  'change',
  'submit',
  'reset',
  'scroll',
  'wheel',
  'touchstart',
  'touchend',
  'touchmove',
  'touchcancel',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerenter',
  'pointerleave',
  'pointerover',
  'pointerout',
  'pointercancel',
  'drag',
  'dragstart',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'drop',
  'animationstart',
  'animationend',
  'animationiteration',
  'transitionstart',
  'transitionend',
  'transitionrun',
  'transitioncancel',
  'load',
  'error',
  'abort',
  'contextmenu',
  'select',
  'copy',
  'cut',
  'paste'
])

/**
 * 已警告的 key 集合，避免重复警告
 */
const warnedKeys = new Set<string>()

/**
 * 开发环境下检查事件属性大小写错误
 * 例如：onclick 应该是 onClick，oninput 应该是 onInput
 *
 * @param key - 属性名
 * @param value - 属性值
 */
export function warnInvalidEventCase(key: string, value: unknown): void {
  if (!isDev) return

  // 避免重复警告
  if (warnedKeys.has(key)) return

  // 检查是否以 on 开头但第三个字符是小写（错误写法）
  if (
    key.startsWith('on') &&
    key.length > 2 &&
    key[2] === key[2].toLowerCase()
  ) {
    const eventName = key.slice(2).toLowerCase()

    // 检查是否是常见的事件名称，且值是函数
    if (COMMON_EVENT_NAMES.has(eventName) && typeof value === 'function') {
      warnedKeys.add(key)

      const correctKey =
        'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1)
      console.warn(
        `[Rasen] Invalid event prop "${key}". ` +
          `Event handlers should use camelCase (e.g., "${correctKey}" instead of "${key}"). ` +
          `The handler will be ignored.`
      )
    }
  }
}
