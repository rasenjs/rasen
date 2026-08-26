import { type Mountable, type HostHooks } from '../types'
import { getReactiveRuntime, unref, type Ref } from '../reactive'
import { MARKERS } from '../marker-constants'

/**
 * Fragment host hooks — alias of HostHooks (unified interface).
 * Required hooks for fragment: text.
 * Optional: createMarker/insert/detach (SSR/hydration boundaries).
 */
export type FragmentHostHooks<N = unknown> = HostHooks<N>

/**
 * 子元素类型
 */
export type FragmentChild<N = unknown> = 
  | string 
  | number 
  | Mountable<N>
  | Ref<unknown>

/**
 * Fragment config
 */
export interface FragmentConfig<N> {
  children: Array<FragmentChild>
  hooks?: FragmentHostHooks<N>
}

/**
 * Process a single child element
 */
function processChild<N>(
  child: FragmentChild,
  hooks?: FragmentHostHooks<N>
): Mountable<N> {
  const runtime = getReactiveRuntime()
  
  if (typeof child === 'string' || typeof child === 'number') {
    // Static text - requires hooks
    if (!hooks?.createText) {
      console.warn('[Rasen] Text children require hooks to be provided')
      return () => undefined
    }
    const text = String(child)
    return (host: N) => {
      const handle = hooks.createText!(host, text)
      hooks.insert!(host, handle.node, null)
      return () => hooks.detach!(handle.node)
    }
  }
  
  if (runtime.isRef(child)) {
    // Reactive ref child - requires hooks
    if (!hooks?.createText) {
      console.warn('[Rasen] Reactive ref children require hooks to be provided')
      return () => undefined
    }
    const refChild = child as Ref<unknown>
    return (host: N) => {
      const handle = hooks.createText!(host, String(unref(refChild)))
      hooks.insert!(host, handle.node, null)

      const stop = runtime.subscribe(
        () => unref(refChild),
        (newVal) => {
          handle.update(String(newVal))
        }
      )
      
      return () => {
        stop()
        hooks.detach!(handle.node)
      }
    }
  }
  
  // Already a Mountable
  return child as Mountable<N>
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
export function fragment<N = unknown>(
  config: FragmentConfig<N>
): Mountable<N> {
  const { children } = config
  return (node: N, mountHooks?: HostHooks<N>) => {
      const hooks = mountHooks ?? config.hooks
    const mounts = children.map(child => processChild(child, hooks))

    const markers: N[] = []

    // Add start marker if available
    if (hooks?.createMarker && hooks.insert) {
      const startAnchor = hooks.createMarker(node, MARKERS.FRAGMENT_START)
      hooks.insert(node, startAnchor, null)
      markers.push(startAnchor)
    }

    // Mount all children
    const unmounts = mounts.map(m => m(node, hooks))

    // Add end marker if available
    if (hooks?.createMarker && hooks.insert) {
      const endAnchor = hooks.createMarker(node, MARKERS.FRAGMENT_END)
      hooks.insert(node, endAnchor, null)
      markers.push(endAnchor)
    }

    return () => {
      // Unmount children first
      unmounts.forEach(unmount => unmount?.())
      // Remove markers
      if (hooks?.detach) {
        markers.forEach(marker => hooks.detach!(marker))
      }
    }
  }
}

/** @deprecated Use `fragment` instead */
export const f = fragment
