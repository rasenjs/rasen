/**
 * @rasenjs/lvgl - LVGL bindings for Rasen
 *
 * Follows Rasen's three-phase function pattern:
 * Setup Phase -> Mount Phase -> Unmount Phase
 *
 * Use Tailwind-style class strings to build embedded UIs with LVGL.
 *
 * Note: This package is reactive-runtime agnostic.
 * Users choose their own reactivity (e.g., @rasenjs/reactive-signals).
 */

import type { SyncComponent, PropValue, Mountable, Ref } from '@rasenjs/core'
import { mount, mountable } from '@rasenjs/core'

// ============ LVGL Host Type ============

/**
 * LVGL Host - the native display/screen that elements mount to
 */
export interface LvglHost {
  /** Append a child element descriptor */
  appendChild(element: ElementDescriptor): void
  /** Request a re-render */
  requestRender(): void
  /** Register event handler */
  on(event: string, handler: () => void): () => void
}

/**
 * Element type mapping to LVGL objects
 */
export type ElementType =
  | 'obj' // lv_obj - base container
  | 'label' // lv_label - text label
  | 'btn' // lv_btn - button
  | 'img' // lv_img - image
  | 'slider' // lv_slider - slider
  | 'switch' // lv_switch - toggle switch
  | 'checkbox' // lv_checkbox - checkbox
  | 'textarea' // lv_textarea - text input
  | 'arc' // lv_arc - arc/gauge
  | 'bar' // lv_bar - progress bar
  | 'spinner' // lv_spinner - loading spinner
  | 'roller' // lv_roller - roller picker
  | 'dropdown' // lv_dropdown - dropdown
  | 'table' // lv_table - table
  | 'chart' // lv_chart - chart

/**
 * Element descriptor passed to the native runtime
 */
export interface ElementDescriptor {
  type: ElementType
  class: string
  text?: string
  src?: string // For images
  value?: number // For sliders, arcs, bars
  min?: number
  max?: number
  options?: string[] // For dropdowns, rollers
  children?: ElementDescriptor[]
  handlers?: Record<string, () => void>
}

// ============ Component Props ============

export interface DivProps {
  class?: PropValue<string>
  onClick?: () => void
  onLongPress?: () => void
  children?: Mountable<LvglHost>[]
}

export interface LabelProps {
  class?: PropValue<string>
  children: PropValue<string | number>
}

export interface TextProps {
  class?: PropValue<string>
  children: PropValue<string | number>
}

export interface ButtonProps {
  class?: PropValue<string>
  onClick?: () => void
  onLongPress?: () => void
  children?: Mountable<LvglHost>[]
}

export interface ImageProps {
  class?: PropValue<string>
  src: PropValue<string>
  onClick?: () => void
}

export interface SliderProps {
  class?: PropValue<string>
  value?: PropValue<number>
  min?: number
  max?: number
  onChange?: (value: number) => void
}

export interface SwitchProps {
  class?: PropValue<string>
  checked?: PropValue<boolean>
  onChange?: (checked: boolean) => void
}

export interface CheckboxProps {
  class?: PropValue<string>
  checked?: PropValue<boolean>
  label?: PropValue<string>
  onChange?: (checked: boolean) => void
}

export interface TextAreaProps {
  class?: PropValue<string>
  value?: PropValue<string>
  placeholder?: PropValue<string>
  onChange?: (value: string) => void
}

export interface ArcProps {
  class?: PropValue<string>
  value?: PropValue<number>
  min?: number
  max?: number
  startAngle?: number
  endAngle?: number
  onChange?: (value: number) => void
}

export interface BarProps {
  class?: PropValue<string>
  value?: PropValue<number>
  min?: number
  max?: number
}

export interface SpinnerProps {
  class?: PropValue<string>
  speed?: number
  arcLength?: number
}

export interface DropdownProps {
  class?: PropValue<string>
  options: PropValue<string[]>
  selected?: PropValue<number>
  onChange?: (index: number) => void
}

export interface RollerProps {
  class?: PropValue<string>
  options: PropValue<string[]>
  selected?: PropValue<number>
  onChange?: (index: number) => void
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
function createChildHost(parentDescriptor: ElementDescriptor): LvglHost {
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
    }
  }
}

/**
 * div - Container component (lv_obj) following Rasen three-phase pattern
 */
export const div: SyncComponent<LvglHost, DivProps> = (props) => {
  // === Setup Phase ===

  // === Return Mount Function ===
  return mountable((host: LvglHost) => {
    // === Mount Phase ===
    const childUnmounts: ((() => void) | undefined)[] = []

    const descriptor: ElementDescriptor = {
      type: 'obj',
      class: unrefValue(props.class) || '',
      children: [],
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onClick) {
      descriptor.handlers!.click = props.onClick
      cleanups.push(host.on('click', props.onClick))
    }
    if (props.onLongPress) {
      descriptor.handlers!.long_press = props.onLongPress
      cleanups.push(host.on('long_press', props.onLongPress))
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
      cleanups.forEach((cleanup) => cleanup())
      childUnmounts.forEach((unmount) => unmount?.())
    }
  })
}

/**
 * label - Label component (lv_label) following Rasen three-phase pattern
 */
export const label: SyncComponent<LvglHost, LabelProps> = (props) => {
  // === Setup Phase ===

  // === Return Mount Function ===
  return mountable((host: LvglHost) => {
    // === Mount Phase ===
    const descriptor: ElementDescriptor = {
      type: 'label',
      class: unrefValue(props.class) || '',
      text: String(unrefValue(props.children))
    }

    host.appendChild(descriptor)

    // === Return Unmount Function ===
    return () => {
      // cleanup
    }
  })
}

/**
 * text - Text component (alias for label)
 */
export const text: SyncComponent<LvglHost, TextProps> = (props) => {
  return label(props as LabelProps)
}

/**
 * button - Button component (lv_btn) following Rasen three-phase pattern
 */
export const button: SyncComponent<LvglHost, ButtonProps> = (props) => {
  return mountable((host: LvglHost) => {
    const childUnmounts: ((() => void) | undefined)[] = []

    const descriptor: ElementDescriptor = {
      type: 'btn',
      class: unrefValue(props.class) || '',
      children: [],
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onClick) {
      descriptor.handlers!.click = props.onClick
      cleanups.push(host.on('click', props.onClick))
    }
    if (props.onLongPress) {
      descriptor.handlers!.long_press = props.onLongPress
      cleanups.push(host.on('long_press', props.onLongPress))
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
      cleanups.forEach((cleanup) => cleanup())
      childUnmounts.forEach((unmount) => unmount?.())
    }
  })
}

/**
 * image - Image component (lv_img)
 */
export const image: SyncComponent<LvglHost, ImageProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'img',
      class: unrefValue(props.class) || '',
      src: unrefValue(props.src),
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onClick) {
      descriptor.handlers!.click = props.onClick
      cleanups.push(host.on('click', props.onClick))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * slider - Slider component (lv_slider)
 */
export const slider: SyncComponent<LvglHost, SliderProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'slider',
      class: unrefValue(props.class) || '',
      value: unrefValue(props.value) ?? 0,
      min: props.min ?? 0,
      max: props.max ?? 100,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(unrefValue(props.value) ?? 0)
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * switch - Toggle switch component (lv_switch)
 */
export const lvSwitch: SyncComponent<LvglHost, SwitchProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'switch',
      class: unrefValue(props.class) || '',
      value: unrefValue(props.checked) ? 1 : 0,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(!unrefValue(props.checked))
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * checkbox - Checkbox component (lv_checkbox)
 */
export const checkbox: SyncComponent<LvglHost, CheckboxProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'checkbox',
      class: unrefValue(props.class) || '',
      text: unrefValue(props.label) || '',
      value: unrefValue(props.checked) ? 1 : 0,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(!unrefValue(props.checked))
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * textarea - Text input component (lv_textarea)
 */
export const textarea: SyncComponent<LvglHost, TextAreaProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'textarea',
      class: unrefValue(props.class) || '',
      text: unrefValue(props.value) || '',
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(unrefValue(props.value) || '')
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * arc - Arc/gauge component (lv_arc)
 */
export const arc: SyncComponent<LvglHost, ArcProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'arc',
      class: unrefValue(props.class) || '',
      value: unrefValue(props.value) ?? 0,
      min: props.min ?? 0,
      max: props.max ?? 100,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(unrefValue(props.value) ?? 0)
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * bar - Progress bar component (lv_bar)
 */
export const bar: SyncComponent<LvglHost, BarProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'bar',
      class: unrefValue(props.class) || '',
      value: unrefValue(props.value) ?? 0,
      min: props.min ?? 0,
      max: props.max ?? 100
    }

    host.appendChild(descriptor)

    return () => {}
  })
}

/**
 * spinner - Loading spinner component (lv_spinner)
 */
export const spinner: SyncComponent<LvglHost, SpinnerProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'spinner',
      class: unrefValue(props.class) || ''
    }

    host.appendChild(descriptor)

    return () => {}
  })
}

/**
 * dropdown - Dropdown component (lv_dropdown)
 */
export const dropdown: SyncComponent<LvglHost, DropdownProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'dropdown',
      class: unrefValue(props.class) || '',
      options: unrefValue(props.options),
      value: unrefValue(props.selected) ?? 0,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(unrefValue(props.selected) ?? 0)
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

/**
 * roller - Roller picker component (lv_roller)
 */
export const roller: SyncComponent<LvglHost, RollerProps> = (props) => {
  return mountable((host: LvglHost) => {
    const descriptor: ElementDescriptor = {
      type: 'roller',
      class: unrefValue(props.class) || '',
      options: unrefValue(props.options),
      value: unrefValue(props.selected) ?? 0,
      handlers: {}
    }

    const cleanups: (() => void)[] = []

    if (props.onChange) {
      descriptor.handlers!.change = () =>
        props.onChange!(unrefValue(props.selected) ?? 0)
      cleanups.push(host.on('change', descriptor.handlers!.change))
    }

    host.appendChild(descriptor)

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  })
}

// ============ App Runner ============

export type LvglApp = Mountable<LvglHost>

// Internal state for re-rendering
let __mountFn: LvglApp | null = null
let __unmountFn: (() => void) | null = null

/**
 * Create a minimal host for collecting element descriptors
 */
function createHost(): LvglHost & { getElements(): ElementDescriptor[] } {
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
    }
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
 * run - Start a LVGL application
 */
export function run(App: () => LvglApp): void {
  // Get the mount function from App
  __mountFn = App()

  // Initial render
  __rerender()
}
