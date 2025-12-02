import { mount, mountable, type Mountable } from '../types'
import { getReactiveRuntime } from '../reactive'

/**
 * 子元素类型
 */
type FragmentChild<Host> = 
  | string 
  | number 
  | Mountable<Host>
  | { value: unknown }  // Ref

/**
 * 处理单个子元素，返回 Mountable
 */
function processChild<Host>(child: FragmentChild<Host>): Mountable<Host> {
  const runtime = getReactiveRuntime()
  
  if (typeof child === 'string' || typeof child === 'number') {
    // 静态文本 - 返回通用 Mountable，具体实现由 host 决定
    const text = String(child)
    return mountable((host: Host) => {
      if (host instanceof HTMLElement) {
        const textNode = document.createTextNode(text)
        host.appendChild(textNode)
        return () => textNode.remove()
      }
      // 其他 host 类型可以扩展
      return undefined
    })
  }
  
  if (runtime.isRef(child)) {
    // 响应式 ref
    const refChild = child as { value: unknown }
    return mountable((host: Host) => {
      if (host instanceof HTMLElement) {
        const textNode = document.createTextNode(String(refChild.value))
        host.appendChild(textNode)
        
        const stop = runtime.watch(
          () => refChild.value,
          (newVal) => {
            textNode.textContent = String(newVal)
          }
        )
        
        return () => {
          stop()
          textNode.remove()
        }
      }
      return undefined
    })
  }
  
  // 已经是 Mountable
  return child as Mountable<Host>
}

/**
 * Fragment 接口 - 支持两种用法
 */
interface FragmentFunction {
  // 对象参数用法: fragment({ children: [...] })
  <Host = unknown>(config: { children: Array<Mountable<Host>> }): Mountable<Host>
  // Tagged template 用法: fragment`hello ${count} world`
  <Host = unknown>(strings: TemplateStringsArray, ...values: FragmentChild<Host>[]): Mountable<Host>
}

/**
 * fragment - 组合多个子组件
 * 
 * @example
 * // 对象参数用法
 * fragment({ children: [child1, child2] })
 * 
 * // Tagged template 用法
 * fragment`Count: ${count} items`
 * 
 * // 别名
 * f`Count: ${count} items`
 */
export const fragment: FragmentFunction = <Host = unknown>(
  configOrStrings: { children: Array<Mountable<Host>> } | TemplateStringsArray,
  ...values: FragmentChild<Host>[]
): Mountable<Host> => {
  // 检测是否是 tagged template 调用
  if (Array.isArray(configOrStrings) && 'raw' in configOrStrings) {
    const strings = configOrStrings as TemplateStringsArray
    
    // 交织 strings 和 values
    const children: FragmentChild<Host>[] = []
    for (let i = 0; i < strings.length; i++) {
      if (strings[i]) {
        children.push(strings[i])
      }
      if (i < values.length) {
        children.push(values[i])
      }
    }
    
    const mounts = children.map(child => processChild<Host>(child))
    
    return mountable((host: Host) => {
      const unmounts = mounts.map(m => mount(m, host))
      return () => unmounts.forEach(unmount => unmount?.())
    })
  }
  
  // 对象参数用法
  const config = configOrStrings as { children: Array<Mountable<Host>> }
  return mountable((host: Host) => {
    const unmounts = config.children.map((child) => mount(child, host))
    return () => unmounts.forEach((unmount) => unmount?.())
  })
}

// 导出 f 作为别名
export { fragment as f }
