/**
 * htmlContext 组件 - 提供 HTML 渲染上下文
 */
import type { Mountable, HostHooks } from '@rasenjs/core'
import { createStringHost } from '../types'
import { htmlHostHooks, type SSRNode } from '../host-hooks'

/**
 * 创建字符串渲染上下文
 */
export function stringContext(props: {
  children: Mountable<SSRNode>[]
}): Mountable<SSRNode> {
  return (node: SSRNode, hooks?: HostHooks<SSRNode>) => {
    const { children } = props

    // 挂载所有子组件（hooks 显式传递——hooks 即上下文）
    for (const child of children) {
      child(node, hooks)
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
export function renderToString(component: Mountable<SSRNode>): string {
  const host = createStringHost()
  component(host, htmlHostHooks)
  return host.toString()
}

/**
 * 将多个组件渲染为 HTML 字符串
 */
export function renderToStringMultiple(components: Mountable<SSRNode>[]): string {
  const host = createStringHost()
  for (const component of components) {
    component(host, htmlHostHooks)
  }
  return host.toString()
}
