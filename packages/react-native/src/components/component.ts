/**
 * 通用组件工厂
 *
 * 组件设计遵循 Rasen 核心模式：
 * - SyncComponent: (props) => MountFunction
 * - MountFunction: (host/ctx) => Unmount
 *
 * 对于 React Native:
 * - Host = RenderContext
 * - 使用 com 自动管理 effectScope
 */

import type { Mountable } from '@rasenjs/core'
import { com } from '@rasenjs/core'
import type { RenderContext, Instance, Props } from '../render-context'
import {
  createInstance,
  createTextInstance,
  appendChild,
  removeChild,
  getChildContext,
  commitUpdate,
  commitTextUpdate
} from '../render-context'
import { watchProp, unref, isRef } from '../utils'

// ============================================================================
// Types
// ============================================================================

/**
 * RN 组件的 Mountable 类型
 */
export type RNMountable = Mountable<RenderContext>

/**
 * 响应式值类型
 */
interface RefLike<T> {
  readonly value: T
}

/**
 * 子组件类型
 */
export type Child =
  | string
  | RefLike<string> // 支持响应式文本
  | RNMountable
  | Child[]

/**
 * 通用组件 Props
 */
export interface ComponentProps {
  style?: Props
  children?: Child | Child[]
  [key: string]: unknown
}

// ============================================================================
// Component Name Mapping
// ============================================================================

/**
 * 组件名到原生类型的映射
 * 用户使用 'View'，内部转换为 'RCTView'
 */
const NATIVE_TYPE_MAP: Record<string, string> = {
  View: 'RCTView',
  Text: 'RCTText',
  TextInput: 'AndroidTextInput', // TODO: iOS should use RCTSinglelineTextInputView
  Image: 'RCTImageView',
  ScrollView: 'RCTScrollView',
  TouchableOpacity: 'RCTView' // TouchableOpacity is implemented as a View with touch effects
}

function getNativeType(type: string): string {
  return NATIVE_TYPE_MAP[type] || type
}

// ============================================================================
// Core Component Function
// ============================================================================

/**
 * 深度解包响应式 props（包括 style 对象内部）
 */
function resolveProps(props: Record<string, unknown>): Props {
  const resolved: Props = {}
  for (const [key, value] of Object.entries(props)) {
    if (isRef(value)) {
      resolved[key] = unref(value)
    } else if (key === 'style' && value && typeof value === 'object') {
      // 深度解包 style 对象
      resolved[key] = resolveStyleProps(value as Record<string, unknown>)
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

/**
 * 深度解包 style 对象中的响应式值
 */
function resolveStyleProps(style: Record<string, unknown>): Props {
  const resolved: Props = {}
  for (const [key, value] of Object.entries(style)) {
    if (isRef(value)) {
      resolved[key] = unref(value)
    } else {
      resolved[key] = value
    }
  }
  return resolved
}

/**
 * 检查 props 中是否有响应式值（包括 style 内部）
 */
function hasReactiveProps(props: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(props)) {
    if (isRef(value)) return true
    if (key === 'style' && value && typeof value === 'object') {
      if (
        Object.values(value as Record<string, unknown>).some((v) => isRef(v))
      ) {
        return true
      }
    }
  }
  return false
}

/**
 * 创建组件的核心函数
 *
 * 支持响应式 props：当传入的 prop 是 Ref 时，会自动监听变化并更新原生视图
 *
 * @param type - 组件类型（如 'View', 'Text'）
 * @param props - 组件属性（支持响应式 Ref）
 * @returns Mountable<RenderContext> - 标准三阶段组件
 *
 * @example
 * ```ts
 * import { ref } from '@rasenjs/reactive-signals'
 *
 * const color = ref('#333')
 *
 * // 响应式样式
 * const myView = component('View', {
 *   style: { backgroundColor: color }
 * })
 *
 * // 当 color.value 改变时，视图自动更新
 * color.value = '#f00'
 * ```
 */
export const component = com(
  (type: string, props: ComponentProps = {}): RNMountable => {
    // setup 阶段：解构 props
    const { children, ...restProps } = props
    const nativeType = getNativeType(type)

    // mount 阶段
    return (ctx: RenderContext) => {
      // 解包初始 props
      const initialProps = resolveProps(restProps)

      // 创建实例
      const instance = createInstance(ctx, nativeType, initialProps)

      // 收集子组件的 unmount 函数
      const childUnmounts: Array<(() => void) | undefined> = []

      // 如果有响应式 props，设置监听（由 com 自动清理）
      if (hasReactiveProps(restProps)) {
        // 监听顶层响应式 prop
        for (const [key, value] of Object.entries(restProps)) {
          if (key === 'style' && value && typeof value === 'object') {
            // 监听 style 内部的响应式属性
            for (const [styleKey, styleValue] of Object.entries(
              value as Record<string, unknown>
            )) {
              if (isRef(styleValue)) {
                watchProp(
                  () => unref(styleValue),
                  (newValue) => {
                    // 更新 style
                    const currentStyle =
                      (instance.canonical.currentProps.style as Record<
                        string,
                        unknown
                      >) || {}
                    const newStyle = { ...currentStyle, [styleKey]: newValue }
                    const newProps = {
                      ...instance.canonical.currentProps,
                      style: newStyle
                    }
                    const updatePayload = ctx.hostConfig.diffAttributePayloads(
                      instance.canonical.currentProps,
                      newProps,
                      instance.canonical.viewConfig.validAttributes
                    )
                    if (updatePayload) {
                      commitUpdate(instance, updatePayload, newProps)
                    }
                  }
                )
              }
            }
          } else if (isRef(value)) {
            watchProp(
              () => unref(value),
              (newValue) => {
                // 更新 props
                const newProps = {
                  ...instance.canonical.currentProps,
                  [key]: newValue
                }
                const updatePayload = ctx.hostConfig.diffAttributePayloads(
                  instance.canonical.currentProps,
                  newProps,
                  instance.canonical.viewConfig.validAttributes
                )
                if (updatePayload) {
                  commitUpdate(instance, updatePayload, newProps)
                }
              }
            )
          }
        }
      }

      // 渲染子组件
      if (children !== undefined && children !== null) {
        const childCtx = getChildContext(ctx, nativeType)
        renderChildren(instance, childCtx, children, childUnmounts)
      }

      // unmount 阶段
      return () => {
        // 清理所有子组件
        childUnmounts.forEach((unmount) => unmount?.())
        // TODO: removeChild from parent if needed
      }
    }
  }
)

/**
 * 渲染子节点
 */
function renderChildren(
  parent: Instance,
  ctx: RenderContext,
  children: Child | Child[],
  unmounts: Array<(() => void) | undefined>
): void {
  const childList = Array.isArray(children) ? children : [children]

  for (const child of childList) {
    renderChild(parent, ctx, child, unmounts)
  }
}

/**
 * 渲染单个子节点
 */
function renderChild(
  parent: Instance,
  ctx: RenderContext,
  child: Child,
  unmounts: Array<(() => void) | undefined>
): void {
  if (child === null || child === undefined) {
    return
  }

  if (typeof child === 'string') {
    // 文本节点
    const textInstance = createTextInstance(ctx, child)
    appendChild(parent, textInstance)
    unmounts.push(() => removeChild(parent, textInstance))
  } else if (typeof child === 'number') {
    // 数字节点
    const textInstance = createTextInstance(ctx, String(child))
    appendChild(parent, textInstance)
    unmounts.push(() => removeChild(parent, textInstance))
  } else if (isRef(child)) {
    // 响应式文本节点
    const initialText = String(unref(child))
    const textInstance = createTextInstance(ctx, initialText)
    appendChild(parent, textInstance)

    // 监听响应式变化（由外层 com 自动清理）
    watchProp(
      () => String(unref(child)),
      (newText) => {
        commitTextUpdate(textInstance, newText)
      }
    )

    unmounts.push(() => removeChild(parent, textInstance))
  } else if (typeof child === 'function') {
    // Mountable 函数 - 调用 mount 获取 unmount
    const unmount = child(ctx)
    unmounts.push(unmount)
  } else if (Array.isArray(child)) {
    // 数组
    renderChildren(parent, ctx, child, unmounts)
  }
}

// ============================================================================
// Helper Types for Specific Components
// ============================================================================

/**
 * View 组件 Props
 */
export interface ViewProps extends ComponentProps {
  testID?: string
  accessible?: boolean
  accessibilityLabel?: string
  accessibilityRole?: string
  onTouchStart?: (event: unknown) => void
  onTouchEnd?: (event: unknown) => void
}

/**
 * Text 组件 Props
 */
export interface TextProps extends ComponentProps {
  numberOfLines?: number
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
  selectable?: boolean
}

/**
 * Touchable 组件 Props
 */
export interface TouchableProps extends ViewProps {
  onPress?: () => void
  disabled?: boolean
}

/**
 * TouchableOpacity 组件 Props
 */
export interface TouchableOpacityProps extends ViewProps {
  onPress?: () => void
  onLongPress?: () => void
  disabled?: boolean
  activeOpacity?: number
  delayLongPress?: number
  delayPressIn?: number
  delayPressOut?: number
}

/**
 * Image 组件 Props
 */
export interface ImageProps extends ComponentProps {
  source: { uri: string } | number
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'
  blurRadius?: number
  accessible?: boolean
  accessibilityLabel?: string
}

/**
 * TextInput 组件 Props
 */
export interface TextInputProps extends ComponentProps {
  value?: string
  defaultValue?: string
  placeholder?: string
  placeholderTextColor?: string
  multiline?: boolean
  numberOfLines?: number
  maxLength?: number
  editable?: boolean
  autoFocus?: boolean
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  autoCorrect?: boolean
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'url'
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send'
  onChangeText?: (text: string) => void
  onSubmitEditing?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

/**
 * ScrollView 组件 Props
 */
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

export default component
