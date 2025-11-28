/**
 * domContext 组件 - 提供 DOM 渲染上下文
 */
type MountFunction = (host: HTMLElement) => (() => void) | undefined

export function domContext(props: {
  container: HTMLElement
  children: Array<MountFunction>
}): MountFunction {
  return (_host: HTMLElement) => {
    const { container, children } = props

    // 挂载所有子组件
    const unmounts = children.map((mountFn) => mountFn(container))

    // 返回 unmount 函数
    return () => {
      unmounts.forEach((unmount) => unmount?.())
    }
  }
}
