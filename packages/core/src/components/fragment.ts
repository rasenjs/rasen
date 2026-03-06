import { type Mountable } from '../types'
import { getReactiveRuntime } from '../reactive'

/**
 * Fragment host hooks for text node creation and updates
 * 
 * Required hooks:
 * - createTextNode: Create text nodes for string/number children
 * - appendNode: Append nodes to host
 * - updateTextNode: Update text content (for reactive refs)
 * - removeNode: Remove nodes on unmount
 * 
 * Optional hooks (for SSR/hydration boundary markers):
 * - createMarker: Create boundary markers (unified with when/each/switch)
 * - appendMarker: Append markers to host
 * - removeMarker: Remove markers on unmount
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
  
  /** Create a marker node with specific content (e.g., 'f', '/f', 'w', '/w') */
  createMarker?: (host: Host, content: string) => N
  /** Append a marker to the host (unified with when/each/switch) */
  appendMarker?: (host: Host, marker: N) => void
  /** Remove a marker node (unified with when/each/switch) */
  removeMarker?: (marker: N) => void
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
      const textNode = hooks.createTextNode(text)
      hooks.appendNode(host, textNode)
      return () => hooks.removeNode(textNode)
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
 * - Optional boundary markers for SSR/hydration
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
