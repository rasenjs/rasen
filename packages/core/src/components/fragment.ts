import { type Mountable, type HostContext, type HostHooks } from '../types'
import { getReactiveRuntime, unref, type Ref } from '../reactive'
import { getHostContext } from '../com'
import { MARKERS } from '../marker-constants'

/**
 * Fragment host hooks — alias of HostHooks (unified interface).
 * Required hooks for fragment: text.
 * Optional: createMarker/insert/detach (SSR/hydration boundaries).
 */
export type FragmentHostHooks<Host = unknown, N = unknown> = HostHooks<Host, N>

/**
 * 子元素类型
 */
export type FragmentChild<Host> = 
  | string 
  | number 
  | Mountable<Host>
  | Ref<unknown>

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
    if (!hooks?.createText) {
      console.warn('[Rasen] Text children require hooks to be provided')
      return () => undefined
    }
    const text = String(child)
    return (host: Host) => {
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
    return (host: Host) => {
      const handle = hooks.createText!(host, String(unref(refChild)))
      hooks.insert!(host, handle.node, null)

      const stop = runtime.watch(
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
    if (hooks?.createMarker && hooks.insert) {
      const startAnchor = hooks.createMarker(host, MARKERS.FRAGMENT_START)
      hooks.insert(host, startAnchor, null)
      markers.push(startAnchor)
    }

    // Mount all children
    const unmounts = mounts.map(m => m(host))

    // Add end marker if available
    if (hooks?.createMarker && hooks.insert) {
      const endAnchor = hooks.createMarker(host, MARKERS.FRAGMENT_END)
      hooks.insert(host, endAnchor, null)
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
