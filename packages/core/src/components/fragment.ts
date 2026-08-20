import { type Mountable, type HostContext, type HostHooks } from '../types'
import { getReactiveRuntime } from '../reactive'
import { getHostContext } from '../com'

/**
 * Fragment host hooks — alias of HostHooks (unified interface).
 * Required hooks for fragment: createTextNode, appendNode, updateTextNode, removeNode.
 * Optional: createMarker, appendMarker, removeMarker (SSR/hydration boundaries).
 */
export type FragmentHostHooks<Host = unknown, N = unknown> = HostHooks<Host, N>

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
  hooks?: FragmentHostHooks<Host, N>
}

/**
 * Process a single child element
 */
function processChild<Host, N>(
  child: FragmentChild<Host>,
  hooks?: FragmentHostHooks<Host, N>
): Mountable<Host> {
  const runtime = getReactiveRuntime()
  
  if (typeof child === 'string' || typeof child === 'number') {
    // Static text - requires hooks
    if (!hooks) {
      console.warn('[Rasen] Text children require hooks to be provided')
      return () => undefined
    }
    const text = String(child)
    return (host: Host) => {
      const textNode = hooks.createTextNode!(host, text)
      hooks.appendNode!(host, textNode)
      return () => hooks.removeNode?.(textNode)
    }
  }
  
  if (runtime.isRef(child)) {
    // Reactive ref - requires hooks
    if (!hooks) {
      console.warn('[Rasen] Reactive ref children require hooks to be provided')
      return () => undefined
    }
    const refChild = child as { value: unknown }
    return (host: Host) => {
      const textNode = hooks.createTextNode!(host, String(refChild.value))
      hooks.appendNode!(host, textNode)
      
      const stop = runtime.watch(
        () => refChild.value,
        (newVal) => {
          hooks.updateTextNode?.(textNode, String(newVal))
        }
      )
      
      return () => {
        stop()
        hooks.removeNode?.(textNode)
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
 * - Optional boundary markers for SSR/hydration
 * 
 * Platform-specific implementations (DOM/HTML) should wrap this
 * and provide their own hooks.
 */
export function fragment<Host = unknown, N = unknown>(
  config: FragmentConfig<Host, N>
): Mountable<Host> {
  const { children } = config
  return (host: Host) => {
    // 宿主上下文：com 挂载时已压栈。优先用 ctx.hooks，config.hooks 作为显式 fallback。
    const ctx = getHostContext() as HostContext<Host, N> | undefined
    const hooks = ctx?.hooks ?? config.hooks
    const mounts = children.map(child => processChild(child, hooks))

    const markers: N[] = []
    
    // Add start marker if available
    if (hooks?.createMarker && hooks.appendMarker) {
      const startMarker = hooks.createMarker(host, 'f')
      hooks.appendMarker(host, startMarker)
      markers.push(startMarker)
    }
    
    // Mount all children
    const unmounts = mounts.map(m => m(host))
    
    // Add end marker if available
    if (hooks?.createMarker && hooks.appendMarker) {
      const endMarker = hooks.createMarker(host, '/f')
      hooks.appendMarker(host, endMarker)
      markers.push(endMarker)
    }
    
    return () => {
      // Unmount children first
      unmounts.forEach(unmount => unmount?.())
      // Remove markers
      if (hooks?.removeMarker) {
        markers.forEach(marker => hooks.removeMarker?.(marker))
      }
    }
  }
}

/** @deprecated Use `fragment` instead */
export const f = fragment
