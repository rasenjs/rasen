/**
 * domContext 组件 - 提供 DOM 渲染上下文
 */
import type { Mountable, HostHooks } from '@rasenjs/core'

export function domContext(props: {
  container: HTMLElement
  children: Array<Mountable<HTMLElement>>
}): Mountable<HTMLElement> {
  return (_node: HTMLElement, hooks: HostHooks<HTMLElement> | undefined) => {
    const { container, children } = props

    // 挂载所有子组件到指定容器（忽略 node——容器由 props 决定）
    const unmounts = children.map((child) => child(container, hooks as HostHooks<HTMLElement> | undefined))

    // 返回 unmount 函数
    return () => {
      unmounts.forEach((unmount) => unmount?.())
    }
  }
}
