/**
 * domContext 组件 - 提供 DOM 渲染上下文
 */
import { mount, mountable, type Mountable } from '@rasenjs/core'

export function domContext(props: {
  container: HTMLElement
  children: Array<Mountable<HTMLElement>>
}): Mountable<HTMLElement> {
  return mountable((_host: HTMLElement) => {
    const { container, children } = props

    // 挂载所有子组件
    const unmounts = children.map((child) => mount(child, container))

    // 返回 unmount 函数
    return () => {
      unmounts.forEach((unmount) => unmount?.())
    }
  })
}
