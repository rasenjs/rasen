import type { PropValue, Mountable } from '@rasenjs/core'
import { unrefValue } from '@rasenjs/core'
import type { StringHost } from '../types'

/**
 * html 组件 - 用于插入原始 HTML 内容（字符串版本）
 *
 * SSR 场景下不需要响应式更新，直接取值渲染。
 * 直接将 HTML 字符串输出，不创建额外的包裹元素。
 *
 * 安全提示：请确保传入的 HTML 内容是可信的，因为它会直接插入到输出中
 *
 * @example
 * ```ts
 * // 静态 HTML - 直接插入
 * div({}, html({ content: '<p>paragraph</p><span>text</span>' }))
 * // 结果: <div><p>paragraph</p><span>text</span></div>
 * ```
 */
export const html = (props: {
  /** 原始 HTML 内容 */
  content: PropValue<string>
}): Mountable<StringHost> => {
  return (host: StringHost) => {
    const content = unrefValue(props.content) || ''
    // 直接输出 HTML 内容，不添加包裹元素
    host.append(content)

    // SSR 不需要 unmount
    return undefined
  }
}
