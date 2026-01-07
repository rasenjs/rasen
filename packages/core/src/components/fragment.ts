import { type Mountable } from '../types'
import { getReactiveRuntime } from '../reactive'

/**
 * Fragment host hooks for text node creation and updates
 * All hooks are required for fragment to work properly
 */
export interface FragmentHostHooks<Host = unknown, N = unknown> {
  /** Create a text node with the given content */
  createTextNode: (text: string) => N
  /** Append a node to the host */
  appendNode: (host: Host, node: N) => void
  /** Update a text node's content */
  updateTextNode: (node: N, text: string) => void
  /** Remove a text node */
  removeNode: (node: N) => void
}

/**
 * 子元素类型
 */
export type FragmentChild<Host> = 
  | string 
  | number 
  | Mountable<Host>
  | { value: unknown }  // Ref

/**
 * Fragment config
 */
export interface FragmentConfig<Host, N> {
  children: Array<FragmentChild<Host>>
  hooks: FragmentHostHooks<Host, N>
}

/**
 * Process a single child element
 */
function processChild<Host, N>(
  child: FragmentChild<Host>,
  hooks: FragmentHostHooks<Host, N>
): Mountable<Host> {
  const runtime = getReactiveRuntime()
  
  if (typeof child === 'string' || typeof child === 'number') {
    // Static text
    const text = String(child)
    return (host: Host) => {
      const textNode = hooks.createTextNode(text)
      hooks.appendNode(host, textNode)
      return () => hooks.removeNode(textNode)
    }
  }
  
  if (runtime.isRef(child)) {
    // Reactive ref
    const refChild = child as { value: unknown }
    return (host: Host) => {
      const textNode = hooks.createTextNode(String(refChild.value))
      hooks.appendNode(host, textNode)
      
      const stop = runtime.watch(
        () => refChild.value,
        (newVal) => {
          hooks.updateTextNode(textNode, String(newVal))
        }
      )
      
      return () => {
        stop()
        hooks.removeNode(textNode)
      }
    }
  }
  
  // Already a Mountable
  return child as Mountable<Host>
}

/**
 * Core fragment implementation - requires host hooks
 * 
 * This is the platform-agnostic core that handles:
 * - Static text children (string/number)
 * - Reactive ref children (with watch)
 * - Mountable children (components)
 * 
 * Platform-specific implementations (DOM/HTML) should wrap this
 * and provide their own hooks.
 */
export function fragment<Host = unknown, N = unknown>(
  config: FragmentConfig<Host, N>
): Mountable<Host> {
  const { children, hooks } = config
  const mounts = children.map(child => processChild(child, hooks))
  
  return (host: Host) => {
    const unmounts = mounts.map(m => m(host))
    return () => unmounts.forEach(unmount => unmount?.())
  }
}
