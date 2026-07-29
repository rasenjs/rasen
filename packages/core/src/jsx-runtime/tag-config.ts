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
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TagComponent = (props: any) => any

export interface TagConfig {
  [prefix: string]: Record<string, TagComponent>
}

const tagRegistry = new Map<string, TagComponent>()

export function registerTag(tagName: string, component: TagComponent): void {
  tagRegistry.set(tagName, component)
}

export function configureTags(config: TagConfig): void {
  for (const [prefix, tags] of Object.entries(config)) {
    for (const [componentName, component] of Object.entries(tags)) {
      const tagName = prefix === '' ? componentName : prefix + componentName
      tagRegistry.set(tagName, component)
    }
  }
}

export function findTag(tagName: string): TagComponent | undefined {
  return tagRegistry.get(tagName)
}

export function getRegisteredTags(): string[] {
  return Array.from(tagRegistry.keys())
}

export function clearTags(): void {
  tagRegistry.clear()
}
