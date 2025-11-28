/**
 * 简化的标签配置系统
 * 
 * 支持:
 * 1. 单个标签注册 - registerTag(name, component)
 * 2. 批量标签注册 - configureTags({ prefix: tags })
 * 
 * 标签匹配规则:
 * - 空字符串前缀 '' 用于默认标签 (如 div, span, button)
 * - 其他前缀用于命名空间标签 (如 Canvas2D 前缀 -> Canvas2DRect)
 * 
 * @example
 * ```ts
 * import * as dom from '@rasenjs/dom'
 * import * as canvas2d from '@rasenjs/canvas-2d'
 * 
 * // 批量配置
 * configureTags({
 *   '': dom,              // div, span, button 等
 *   'Canvas2D': canvas2d, // Canvas2DRect, Canvas2DCircle 等
 * })
 * 
 * // 单个注册
 * registerTag('div', dom.div)
 * registerTag('Canvas2DRect', canvas2d.Rect)
 * ```
 */

/**
 * 标签组件类型
 * 接受任意 props，返回任意值（通常是 MountFunction）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TagComponent = (props: any) => any

/**
 * 标签配置
 * key 为前缀，value 为该前缀下的所有标签组件
 * 使用空字符串 '' 作为默认前缀（无前缀标签）
 */
export interface TagConfig {
  [prefix: string]: Record<string, TagComponent>
}

/**
 * 标签注册表
 * 存储所有已注册的标签
 */
const tagRegistry = new Map<string, TagComponent>()

/**
 * 注册单个标签组件
 * 后注册的会覆盖先注册的
 * 
 * @param tagName 完整的标签名 (如 'div', 'Canvas2DRect')
 * @param component 标签组件
 * 
 * @example
 * ```ts
 * import { div } from '@rasenjs/dom'
 * import { Rect } from '@rasenjs/canvas-2d'
 * 
 * registerTag('div', div)
 * registerTag('Canvas2DRect', Rect)
 * ```
 */
export function registerTag(tagName: string, component: TagComponent): void {
  tagRegistry.set(tagName, component)
}

/**
 * 批量配置标签映射
 * 后配置的会覆盖先配置的
 * 
 * @param config 标签配置对象
 * 
 * @example
 * ```ts
 * import * as dom from '@rasenjs/dom'
 * import * as canvas2d from '@rasenjs/canvas-2d'
 * 
 * configureTags({
 *   '': dom,              // div, span, button 等
 *   'Canvas2D': canvas2d, // Canvas2DRect -> canvas2d.Rect
 * })
 * ```
 * 
 * 标签注册规则:
 * - 空字符串前缀: 标签名直接使用 (div -> div)
 * - 其他前缀: 前缀 + 组件名 (Canvas2D + Rect -> Canvas2DRect)
 */
export function configureTags(config: TagConfig): void {
  for (const [prefix, tags] of Object.entries(config)) {
    for (const [componentName, component] of Object.entries(tags)) {
      // 空字符串前缀: 直接使用组件名
      // 其他前缀: 前缀 + 组件名
      const tagName = prefix === '' ? componentName : prefix + componentName
      tagRegistry.set(tagName, component)
    }
  }
}

/**
 * 根据标签名查找组件
 * 直接从注册表中查找
 */
export function findTag(tagName: string): TagComponent | undefined {
  return tagRegistry.get(tagName)
}

/**
 * 获取所有已注册的标签
 */
export function getRegisteredTags(): string[] {
  return Array.from(tagRegistry.keys())
}

/**
 * 清空所有已注册的标签
 */
export function clearTags(): void {
  tagRegistry.clear()
}
