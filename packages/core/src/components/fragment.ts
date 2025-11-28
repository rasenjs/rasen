import type { MountFunction } from '../types'

/**
 * fragment - 组合多个子组件
 * 类似 React.Fragment，用于返回多个子元素
 */

export const fragment = <Host = unknown>(config: {
  children: Array<MountFunction<Host>>
}): MountFunction<Host> => {
  return (host: Host) => {
    const unmounts = config.children.map((child) => child(host))

    return () => {
      unmounts.forEach((unmount) => unmount?.())
    }
  }
}
