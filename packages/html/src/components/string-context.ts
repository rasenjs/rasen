/**
 * htmlContext 组件 - 提供 HTML 渲染上下文
 */
import type { Mountable } from '@rasenjs/core'
import type { StringHost } from '../types'
import { createStringHost } from '../types'

/**
 * 创建字符串渲染上下文
 */
export function stringContext(props: {
  children: Array<Mountable<StringHost>>
}): Mountable<StringHost> {
  return (host: StringHost) => {
    const { children } = props

    // 挂载所有子组件
    for (const child of children) {
      child(host)
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
export function renderToString(component: Mountable<StringHost>): string {
  const host = createStringHost()
  component(host)
  return host.toString()
}

/**
 * 将多个组件渲染为 HTML 字符串
 */
export function renderToStringMultiple(components: Mountable<StringHost>[]): string {
  const host = createStringHost()
  for (const component of components) {
    component(host)
  }
  return host.toString()
}
