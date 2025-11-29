/**
 * htmlContext 组件 - 提供 HTML 渲染上下文
 */
import type { StringHost, StringMountFunction } from '../types'
import { createStringHost } from '../types'

/**
 * 创建字符串渲染上下文
 */
export function stringContext(props: {
  children: Array<StringMountFunction>
}): StringMountFunction {
  return (host: StringHost) => {
    const { children } = props

    // 挂载所有子组件
    for (const mountFn of children) {
      mountFn(host)
    }

    // SSR 不需要 unmount
    return undefined
  }
}

/**
 * 将组件渲染为 HTML 字符串
 *
 * 这是 SSR 的主要入口
 */
export function renderToString(component: StringMountFunction): string {
  const host = createStringHost()
  component(host)
  return host.toString()
}

/**
 * 将多个组件渲染为 HTML 字符串
 */
export function renderToStringMultiple(components: StringMountFunction[]): string {
  const host = createStringHost()
  for (const component of components) {
    component(host)
  }
  return host.toString()
}
