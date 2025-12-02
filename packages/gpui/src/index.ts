/**
 * @rasenjs/gpui - GPUI bindings for Rasen
 *
 * Follows Rasen's three-phase function pattern:
 * Setup Phase -> Mount Phase -> Unmount Phase
 *
 * Use Tailwind-style class strings to build GPU-accelerated UIs.
 * 
 * Note: This package is reactive-runtime agnostic. 
 * Users choose their own reactivity (e.g., @rasenjs/reactive-signals).
 */

import type { SyncComponent, PropValue, Mountable, Ref } from '@rasenjs/core'
import { mount, mountable } from '@rasenjs/core'

// ============ GPUI Host Type ============

/**
 * GPUI Host - the native window/view that elements mount to
 */
export interface GpuiHost {
  /** Append a child element descriptor */
  appendChild(element: ElementDescriptor): void
  /** Request a re-render */
  requestRender(): void
  /** Register event handler */
  on(event: string, handler: () => void): () => void
}

/**
 * Element descriptor passed to the native runtime
 */
export interface ElementDescriptor {
  type: 'div' | 'text'
  class: string
  text?: string
  children?: ElementDescriptor[]
  handlers?: Record<string, () => void>
}

// ============ Component Props ============

export interface DivProps {
  class?: PropValue<string>
  onClick?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  children?: Mountable<GpuiHost>[]
}

export interface TextProps {
  class?: PropValue<string>
  children: PropValue<string | number>
}

// ============ Utility Functions ============

function unrefValue<T>(value: PropValue<T>): T {
  if (value && typeof value === 'object' && 'value' in value) {
    return (value as Ref<T>).value
  }
  return value as T
}

// ============ Components (Three-Phase Pattern) ============

/**
 * Create a child host that collects elements into parent's children array
 */
function createChildHost(parentDescriptor: ElementDescriptor): GpuiHost {
  return {
    appendChild(element: ElementDescriptor) {
      parentDescriptor.children!.push(element)
    },
    requestRender() {
      // Propagates to root
    },
    on(_event: string, _handler: () => void) {
      // Event binding handled by native
      return () => {}
    },
  }
}

/**
 * div - Container component following Rasen three-phase pattern
 */
export const div: SyncComponent<GpuiHost, DivProps> = (props) => {
  // === Setup Phase ===
  
  // === Return Mount Function ===
  return mountable((host: GpuiHost) => {
    // === Mount Phase ===
    const childUnmounts: ((() => void) | undefined)[] = []
    
    const descriptor: ElementDescriptor = {
      type: 'div',
      class: unrefValue(props.class) || '',
      children: [],
      handlers: {},
    }
    
    const cleanups: (() => void)[] = []
    
    if (props.onClick) {
      descriptor.handlers!.click = props.onClick
      cleanups.push(host.on('click', props.onClick))
    }
    if (props.onMouseEnter) {
      descriptor.handlers!.mouseenter = props.onMouseEnter
      cleanups.push(host.on('mouseenter', props.onMouseEnter))
    }
    if (props.onMouseLeave) {
      descriptor.handlers!.mouseleave = props.onMouseLeave
      cleanups.push(host.on('mouseleave', props.onMouseLeave))
    }
    
    // Mount children into this descriptor's children array
    if (props.children) {
      const childHost = createChildHost(descriptor)
      for (const childMountable of props.children) {
        childUnmounts.push(mount(childMountable, childHost))
      }
    }
    
    host.appendChild(descriptor)
    
    // === Return Unmount Function ===
    return () => {
      cleanups.forEach(cleanup => cleanup())
      childUnmounts.forEach(unmount => unmount?.())
    }
  })
}

/**
 * text - Text component following Rasen three-phase pattern
 * 
 * Usage: text({ children: "Hello" }) or text({ children: count })
 */
export const text: SyncComponent<GpuiHost, TextProps> = (props) => {
  // === Setup Phase ===
  
  // === Return Mount Function ===
  return mountable((host: GpuiHost) => {
    // === Mount Phase ===
    const descriptor: ElementDescriptor = {
      type: 'text',
      class: unrefValue(props.class) || '',
      text: String(unrefValue(props.children)),
    }
    
    host.appendChild(descriptor)
    
    // === Return Unmount Function ===
    return () => {
      // cleanup
    }
  })
}

/**
 * button - Interactive button component
 */
export const button: SyncComponent<GpuiHost, DivProps & { label?: PropValue<string> }> = (props) => {
  return mountable((host: GpuiHost) => {
    const childUnmounts: ((() => void) | undefined)[] = []
    
    const descriptor: ElementDescriptor = {
      type: 'div',
      class: 'cursor-pointer ' + (unrefValue(props.class) || ''),
      children: [],
      handlers: {},
    }
    
    const cleanups: (() => void)[] = []
    
    if (props.onClick) {
      descriptor.handlers!.click = props.onClick
      cleanups.push(host.on('click', props.onClick))
    }
    
    // Mount children into this descriptor's children array
    if (props.children) {
      const childHost = createChildHost(descriptor)
      for (const childMountable of props.children) {
        childUnmounts.push(mount(childMountable, childHost))
      }
    }
    
    host.appendChild(descriptor)
    
    return () => {
      cleanups.forEach(cleanup => cleanup())
      childUnmounts.forEach(unmount => unmount?.())
    }
  })
}

// ============ App Runner ============

export type GpuiApp = Mountable<GpuiHost>

// Internal state for re-rendering
let __mountFn: GpuiApp | null = null
let __unmountFn: (() => void) | null = null

/**
 * Create a minimal host for collecting element descriptors
 */
function createHost(): GpuiHost & { getElements(): ElementDescriptor[] } {
  const elements: ElementDescriptor[] = []
  return {
    appendChild(element: ElementDescriptor) {
      elements.push(element)
    },
    requestRender() {
      // Will be called by native runtime
    },
    on(_event: string, _handler: () => void) {
      // Event binding handled by native
      return () => {}
    },
    getElements() {
      return elements
    },
  }
}

/**
 * Re-render function - called by native runtime on state changes
 */
function __rerender(): ElementDescriptor | null {
  if (!__mountFn) return null
  
  // Call previous unmount if exists
  if (__unmountFn) {
    __unmountFn()
  }
  
  // Create fresh host and mount
  const rootHost = createHost()
  const result = mount(__mountFn, rootHost)
  __unmountFn = typeof result === 'function' ? result : null
  
  const elements = rootHost.getElements()
  const rootElement = elements[0] || null
  
  // Store globally for native runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as unknown as Record<string, unknown>
  g.__rootElement = rootElement
  
  return rootElement
}

// Make __rerender globally accessible
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as unknown as Record<string, unknown>).__rerender = __rerender

/**
 * run - Start a GPUI application
 */
export function run(App: () => GpuiApp): void {
  // Get the mount function from App
  __mountFn = App()
  
  // Initial render
  __rerender()
}
