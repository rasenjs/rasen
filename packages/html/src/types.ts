/**
 * 字符串渲染器类型定义
 */

import type { Mountable } from '@rasenjs/core'

/**
 * 字符串渲染宿主
 * 用于收集渲染结果
 */
export interface StringHost {
  /**
   * 收集的 HTML 片段
   */
  fragments: string[]

  /**
   * 添加 HTML 片段
   */
  append(html: string): void

  /**
   * 获取完整的 HTML 字符串
   */
  toString(): string
}

/**
 * 创建字符串宿主
 */
export function createStringHost(): StringHost {
  const fragments: string[] = []
  return {
    fragments,
    append(html: string) {
      fragments.push(html)
    },
    toString() {
      return fragments.join('')
    }
  }
}

/**
 * 字符串渲染的 Mountable 类型
 * @deprecated 使用 Mountable<StringHost> 替代
 */
export type StringMountFunction = Mountable<StringHost>
