/**
 * Component Factory using DOM-like API
 * 
 * This module uses DOM-like abstraction (createElement, appendChild, etc.)
 * instead of direct React Native APIs.
 */

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime, watchObjectProps, unrefValue } from '@rasenjs/core'
import type { RNNode, Props } from '../node'

// Host is a function that creates element with parent
// Similar to DOM: parent.createElement(type) returns the created element
export type Host = RNNode

// RNMountable is a Mountable that uses our Host type
export type RNMountable = Mountable<Host>

// ============================================================================
// Types
// ============================================================================

export interface ComponentProps {
  style?: Props
  children?: Child | Child[]
  [key: string]: unknown
}

export type Child = 
  | string 
  | number
  | Mountable<Host>
  | Child[]
  | null
  | undefined

// ============================================================================
// Core Component Function
// ============================================================================

/**
 * Create a component using DOM-like API
 *
 * @param type - Component type ('View', 'Text', etc.)
 * @param props - Component props
 * @returns Mountable function
 */
export function component(
  type: string,
  props: ComponentProps = {}
): Mountable<Host> {
  const { children, ...restProps } = props
  const runtime = getReactiveRuntime()

  // Return mount function
  return (host: Host) => {
    // Create element using ownerDocument from parent node
    // Note: createElement will auto-prepend 'RCT' prefix internally
    const element = host.ownerDocument.createElement(type, restProps)
    
    // Append to parent node (host is the parent node)
    host.appendChild(element)
    
    // Render children
    if (children !== undefined && children !== null) {
      renderChildren(element, children)
    }
    
    // Track reactive props for updates
    const reactiveProps: Array<() => void> = []

    // Watch all reactive props for changes
    for (const [key, value] of Object.entries(restProps)) {
      if (key === 'style') {
        // Check if style itself is reactive (computed/ref)
        const isReactiveStyle = typeof value === 'function' ||
          (value && typeof value === 'object' && 'value' in value)

        if (isReactiveStyle) {
          // Style is a computed/ref - watch the entire style object
          const stop = runtime.watch(
            () => unrefValue(value as Parameters<typeof unrefValue>[0]),
            (styleValue: unknown) => {
              if (styleValue && typeof styleValue === 'object') {
                // Apply all style properties using setProperty
                for (const [styleKey, styleVal] of Object.entries(styleValue as Record<string, unknown>)) {
                  element.style.setProperty(styleKey, styleVal)
                }
              }
            }
          )
          reactiveProps.push(stop)
        } else if (typeof value === 'object' && value !== null) {
          // Plain object style - watch each property with watchObjectProps
          // Also handle function values as lazy getters
          const stop = watchObjectProps(
            value as Record<string, unknown>,
            (styleKey, newValue) => {
              if (typeof newValue === 'function') {
                // Function value - watch it for changes
                const stopFunc = runtime.watch(newValue as () => unknown, (result) => {
                  element.style.setProperty(styleKey, result)
                })
                reactiveProps.push(stopFunc)
              } else if (newValue === null || newValue === undefined) {
                element.style.removeProperty(styleKey)
              } else {
                element.style.setProperty(styleKey, newValue)
              }
            }
          )
          reactiveProps.push(stop)
        }
      } else if (runtime.isRef(value)) {
        // Reactive value - watch for changes
        const unwatch = runtime.watch(
          () => runtime.unref(value),
          (newValue) => {
            // Update the element attribute
            element.setAttribute(key, newValue)
          }
        )
        reactiveProps.push(unwatch)
      }
    }
    
    // Return cleanup function with node reference (for eachImpl)
    const cleanup = () => {
      // Cleanup all watchers
      reactiveProps.forEach(unwatch => unwatch())
      
      // Cleanup all child unmounts
      const parentAny = element as any
      if (parentAny._unmounts) {
        parentAny._unmounts.forEach((unmount: () => void) => unmount())
        parentAny._unmounts = []
      }
      
      // Remove from parent
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
    }
    
    // 返回带有 node 引用的对象，让 eachImpl 可以获取节点引用
    return Object.assign(cleanup, { node: element }) as (() => void) & { node: RNNode }
  }
}

/**
 * Render children to parent element
 */
function renderChildren(
  parent: RNNode,
  children: Child | Child[]
): void {
  const childList = Array.isArray(children) ? children : [children]
  
  for (const child of childList) {
    renderChild(parent, child)
  }
}

/**
 * Render single child
 */
function renderChild(
  parent: RNNode,
  child: Child
): void {
  if (child === null || child === undefined) {
    return
  }
  
  const runtime = getReactiveRuntime()
  
  if (typeof child === 'string' || typeof child === 'number') {
    // Only Text component can contain text strings directly
    if (parent.tagName === 'Text' || parent.tagName === 'RCTText') {
      const textNode = parent.ownerDocument.createTextNode(String(child))
      parent.appendChild(textNode)
    }
  } else if (runtime.isRef(child)) {
    // Reactive text - only in Text component
    if (parent.tagName === 'Text' || parent.tagName === 'RCTText') {
      const initialText = String(runtime.unref(child))
      const textNode = parent.ownerDocument.createTextNode(initialText)
      parent.appendChild(textNode)

      runtime.watch(
        () => String(runtime.unref(child)),
        (newText) => {
          textNode.textContent = newText
        }
      )
    }
  } else if (typeof child === 'function') {
    // Mountable component - pass parent directly as host
    const unmount = child(parent)
    if (unmount) {
      // Store unmount for cleanup - component.ts needs to track these
      const parentAny = parent as any
      if (!parentAny._unmounts) parentAny._unmounts = []
      parentAny._unmounts.push(unmount)
    }
  }
}

// ============================================================================
// Specific Component Types
// ============================================================================

export interface ViewProps extends ComponentProps {
  testID?: string
  accessible?: boolean
  accessibilityLabel?: string
  accessibilityRole?: string
  onTouchStart?: (event: unknown) => void
  onTouchEnd?: (event: unknown) => void
}

export interface TextProps extends ComponentProps {
  numberOfLines?: number
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
  selectable?: boolean
}

export interface TouchableProps extends ViewProps {
  onPress?: () => void
  disabled?: boolean
}

export interface TouchableOpacityProps extends ViewProps {
  onPress?: () => void
  onLongPress?: () => void
  disabled?: boolean
  activeOpacity?: number
  delayLongPress?: number
  delayPressIn?: number
  delayPressOut?: number
}

export interface ScrollViewProps extends ComponentProps {
  horizontal?: boolean
  showsHorizontalScrollIndicator?: boolean
  showsVerticalScrollIndicator?: boolean
  pagingEnabled?: boolean
  scrollEnabled?: boolean
  bounces?: boolean
  contentContainerStyle?: Props
  onScroll?: (event: unknown) => void
  onMomentumScrollEnd?: (event: unknown) => void
}

export interface TextInputProps extends ComponentProps {
  value?: unknown
  text?: unknown
  placeholder?: string
  placeholderTextColor?: string
  autoFocus?: boolean
  editable?: boolean
  multiline?: boolean
  numberOfLines?: number
  secureTextEntry?: boolean
  keyboardType?: string
  returnKeyType?: string
  onChangeText?: (text: string) => void
  onFocus?: (event: unknown) => void
  onBlur?: (event: unknown) => void
  onSubmitEditing?: (event: unknown) => void
  onKeyPress?: (event: unknown) => void
}

export interface ImageProps extends ComponentProps {
  source?: { uri?: string } | number
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'repeat'
  defaultSource?: { uri?: string } | number
  loadingIndicatorSource?: { uri?: string }
  onLoad?: (event: unknown) => void
  onError?: (event: unknown) => void
  onLoadStart?: (event: unknown) => void
  onLoadEnd?: (event: unknown) => void
}

export default component
