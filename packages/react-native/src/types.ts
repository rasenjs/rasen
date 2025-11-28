/**
 * Rasen React Native 渲染器类型定义
 *
 * 直接绑定 React Native Fabric 架构的底层 API
 * 不依赖 React，直接操作原生视图树
 */

import type { PropValue } from '@rasenjs/core'

// Re-export for convenience
export type { Ref, ReadonlyRef, PropValue } from '@rasenjs/core'

// ============================================================================
// React Native Fabric 底层类型
// ============================================================================

/**
 * Fabric 原生组件句柄
 * 代表一个原生视图实例
 */
export interface NativeHandle {
  /**
   * 原生视图标签（唯一标识）
   */
  readonly _nativeTag: number

  /**
   * 组件类型名称
   */
  readonly _viewType: string
}

/**
 * UIManager 接口 - React Native 底层视图管理器
 * 这是 Fabric 架构的核心 API
 */
export interface FabricUIManager {
  /**
   * 创建原生视图
   */
  createNode(
    tag: number,
    viewType: string,
    rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: object
  ): NativeHandle

  /**
   * 克隆节点并更新属性
   */
  cloneNodeWithNewProps(
    node: NativeHandle,
    newProps: Record<string, unknown>
  ): NativeHandle

  /**
   * 克隆节点并追加子节点
   */
  cloneNodeWithNewChildren(node: NativeHandle): NativeHandle

  /**
   * 追加子节点
   */
  appendChild(parent: NativeHandle, child: NativeHandle): void

  /**
   * 创建子节点集合
   */
  createChildSet(rootTag: number): ChildSet

  /**
   * 追加子节点到集合
   */
  appendChildToSet(childSet: ChildSet, child: NativeHandle): void

  /**
   * 完成根节点的初始化
   */
  completeRoot(rootTag: number, childSet: ChildSet): void

  /**
   * 获取根视图标签
   */
  getRootHostContext(rootTag: number): HostContext
}

/**
 * 子节点集合类型
 */
export interface ChildSet {
  readonly _children: NativeHandle[]
}

/**
 * 宿主上下文
 */
export interface HostContext {
  readonly rootTag: number
}

// ============================================================================
// Rasen RN 组件类型
// ============================================================================

/**
 * React Native 视图基础属性
 */
export interface ViewStyleProps {
  // 布局
  flex?: PropValue<number>
  flexDirection?: PropValue<'row' | 'column' | 'row-reverse' | 'column-reverse'>
  justifyContent?: PropValue<
    'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  >
  alignItems?: PropValue<'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'>
  alignSelf?: PropValue<'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'>
  flexWrap?: PropValue<'wrap' | 'nowrap' | 'wrap-reverse'>
  flexGrow?: PropValue<number>
  flexShrink?: PropValue<number>
  flexBasis?: PropValue<number | string>

  // Gap (Flexbox gap)
  gap?: PropValue<number>
  rowGap?: PropValue<number>
  columnGap?: PropValue<number>

  // 尺寸
  width?: PropValue<number | string>
  height?: PropValue<number | string>
  minWidth?: PropValue<number | string>
  maxWidth?: PropValue<number | string>
  minHeight?: PropValue<number | string>
  maxHeight?: PropValue<number | string>

  // 边距
  margin?: PropValue<number | string>
  marginTop?: PropValue<number | string>
  marginRight?: PropValue<number | string>
  marginBottom?: PropValue<number | string>
  marginLeft?: PropValue<number | string>
  marginHorizontal?: PropValue<number | string>
  marginVertical?: PropValue<number | string>

  // 内边距
  padding?: PropValue<number | string>
  paddingTop?: PropValue<number | string>
  paddingRight?: PropValue<number | string>
  paddingBottom?: PropValue<number | string>
  paddingLeft?: PropValue<number | string>
  paddingHorizontal?: PropValue<number | string>
  paddingVertical?: PropValue<number | string>

  // 定位
  position?: PropValue<'absolute' | 'relative'>
  top?: PropValue<number | string>
  right?: PropValue<number | string>
  bottom?: PropValue<number | string>
  left?: PropValue<number | string>
  zIndex?: PropValue<number>

  // 背景
  backgroundColor?: PropValue<string>
  opacity?: PropValue<number>

  // 边框
  borderWidth?: PropValue<number>
  borderTopWidth?: PropValue<number>
  borderRightWidth?: PropValue<number>
  borderBottomWidth?: PropValue<number>
  borderLeftWidth?: PropValue<number>
  borderColor?: PropValue<string>
  borderTopColor?: PropValue<string>
  borderRightColor?: PropValue<string>
  borderBottomColor?: PropValue<string>
  borderLeftColor?: PropValue<string>
  borderRadius?: PropValue<number>
  borderTopLeftRadius?: PropValue<number>
  borderTopRightRadius?: PropValue<number>
  borderBottomLeftRadius?: PropValue<number>
  borderBottomRightRadius?: PropValue<number>

  // 阴影 (iOS)
  shadowColor?: PropValue<string>
  shadowOffset?: PropValue<{ width: number; height: number }>
  shadowOpacity?: PropValue<number>
  shadowRadius?: PropValue<number>

  // 阴影 (Android)
  elevation?: PropValue<number>

  // 变换
  transform?: PropValue<TransformValue[]>

  // 溢出
  overflow?: PropValue<'visible' | 'hidden' | 'scroll'>
}

/**
 * Transform 值类型
 */
export type TransformValue =
  | { translateX: number }
  | { translateY: number }
  | { scale: number }
  | { scaleX: number }
  | { scaleY: number }
  | { rotate: string }
  | { rotateX: string }
  | { rotateY: string }
  | { rotateZ: string }
  | { skewX: string }
  | { skewY: string }

/**
 * 文本样式属性
 */
export interface TextStyleProps extends ViewStyleProps {
  color?: PropValue<string>
  fontSize?: PropValue<number>
  fontWeight?: PropValue<
    | 'normal'
    | 'bold'
    | '100'
    | '200'
    | '300'
    | '400'
    | '500'
    | '600'
    | '700'
    | '800'
    | '900'
  >
  fontStyle?: PropValue<'normal' | 'italic'>
  fontFamily?: PropValue<string>
  textAlign?: PropValue<'auto' | 'left' | 'right' | 'center' | 'justify'>
  textDecorationLine?: PropValue<
    'none' | 'underline' | 'line-through' | 'underline line-through'
  >
  textTransform?: PropValue<'none' | 'uppercase' | 'lowercase' | 'capitalize'>
  lineHeight?: PropValue<number>
  letterSpacing?: PropValue<number>
}

/**
 * View 组件属性
 */
/**
 * 子节点类型 - 支持单个组件、数组、响应式函数
 */
export type RNChildren =
  | RNMountFunction
  | RNMountFunction[]
  | (() => RNMountFunction | RNMountFunction[])

/**
 * View 组件属性
 */
export interface ViewProps {
  key?: string | number
  style?: ViewStyleProps
  testID?: PropValue<string>
  accessible?: PropValue<boolean>
  accessibilityLabel?: PropValue<string>
  accessibilityHint?: PropValue<string>
  accessibilityRole?: PropValue<string>
  pointerEvents?: PropValue<'auto' | 'none' | 'box-none' | 'box-only'>
  hitSlop?: PropValue<{ top?: number; right?: number; bottom?: number; left?: number }>
  onLayout?: (event: LayoutEvent) => void
  children?: RNChildren
}

/**
 * Text 组件属性
 */
export interface TextProps {
  key?: string | number
  style?: TextStyleProps
  numberOfLines?: PropValue<number>
  ellipsizeMode?: PropValue<'head' | 'middle' | 'tail' | 'clip'>
  selectable?: PropValue<boolean>
  testID?: PropValue<string>
  accessible?: PropValue<boolean>
  accessibilityLabel?: PropValue<string>
  onPress?: () => void
  onLongPress?: () => void
  children?: PropValue<string> | (() => string) | RNChildren
}

/**
 * Image 组件属性
 */
export interface ImageProps {
  source: PropValue<ImageSource>
  style?: ViewStyleProps & {
    resizeMode?: PropValue<'cover' | 'contain' | 'stretch' | 'repeat' | 'center'>
    tintColor?: PropValue<string>
  }
  resizeMode?: PropValue<'cover' | 'contain' | 'stretch' | 'repeat' | 'center'>
  blurRadius?: PropValue<number>
  testID?: PropValue<string>
  accessible?: PropValue<boolean>
  accessibilityLabel?: PropValue<string>
  onLoad?: () => void
  onError?: (error: { nativeEvent: { error: string } }) => void
  onLoadStart?: () => void
  onLoadEnd?: () => void
}

/**
 * 图片源类型
 */
export type ImageSource =
  | { uri: string; width?: number; height?: number }
  | number // require('./image.png') 返回的资源 ID

/**
 * TextInput 组件属性
 */
export interface TextInputProps {
  key?: string | number
  value?: PropValue<string> | (() => string)
  defaultValue?: PropValue<string>
  placeholder?: PropValue<string>
  placeholderTextColor?: PropValue<string>
  style?: TextStyleProps
  multiline?: PropValue<boolean>
  numberOfLines?: PropValue<number>
  maxLength?: PropValue<number>
  editable?: PropValue<boolean>
  autoFocus?: PropValue<boolean>
  autoCapitalize?: PropValue<'none' | 'sentences' | 'words' | 'characters'>
  autoCorrect?: PropValue<boolean>
  secureTextEntry?: PropValue<boolean>
  keyboardType?: PropValue<
    | 'default'
    | 'number-pad'
    | 'decimal-pad'
    | 'numeric'
    | 'email-address'
    | 'phone-pad'
    | 'url'
  >
  returnKeyType?: PropValue<'done' | 'go' | 'next' | 'search' | 'send'>
  testID?: PropValue<string>
  onChangeText?: (text: string) => void
  onSubmitEditing?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

/**
 * ScrollView 组件属性
 */
export interface ScrollViewProps extends ViewProps {
  horizontal?: PropValue<boolean>
  showsHorizontalScrollIndicator?: PropValue<boolean>
  showsVerticalScrollIndicator?: PropValue<boolean>
  pagingEnabled?: PropValue<boolean>
  scrollEnabled?: PropValue<boolean>
  bounces?: PropValue<boolean>
  contentContainerStyle?: ViewStyleProps
  onScroll?: (event: ScrollEvent) => void
  onScrollBeginDrag?: () => void
  onScrollEndDrag?: () => void
  onMomentumScrollBegin?: () => void
  onMomentumScrollEnd?: () => void
}

/**
 * TouchableOpacity 组件属性
 */
export interface TouchableOpacityProps extends ViewProps {
  activeOpacity?: PropValue<number>
  disabled?: PropValue<boolean>
  onPress?: () => void
  onLongPress?: () => void
  onPressIn?: () => void
  onPressOut?: () => void
  delayLongPress?: PropValue<number>
  delayPressIn?: PropValue<number>
  delayPressOut?: PropValue<number>
}

/**
 * FlatList 组件属性
 */
export interface FlatListProps<T> {
  data: PropValue<T[]>
  renderItem: (info: { item: T; index: number }) => RNMountFunction
  keyExtractor?: (item: T, index: number) => string
  style?: ViewStyleProps
  contentContainerStyle?: ViewStyleProps
  horizontal?: PropValue<boolean>
  numColumns?: PropValue<number>
  showsHorizontalScrollIndicator?: PropValue<boolean>
  showsVerticalScrollIndicator?: PropValue<boolean>
  ItemSeparatorComponent?: () => RNMountFunction
  ListHeaderComponent?: () => RNMountFunction
  ListFooterComponent?: () => RNMountFunction
  ListEmptyComponent?: () => RNMountFunction
  onEndReached?: () => void
  onEndReachedThreshold?: PropValue<number>
  onRefresh?: () => void
  refreshing?: PropValue<boolean>
  testID?: PropValue<string>
}

// ============================================================================
// 事件类型
// ============================================================================

/**
 * 布局事件
 */
export interface LayoutEvent {
  nativeEvent: {
    layout: {
      x: number
      y: number
      width: number
      height: number
    }
  }
}

/**
 * 滚动事件
 */
export interface ScrollEvent {
  nativeEvent: {
    contentOffset: { x: number; y: number }
    contentSize: { width: number; height: number }
    layoutMeasurement: { width: number; height: number }
  }
}

/**
 * 触摸事件
 */
export interface TouchEvent {
  nativeEvent: {
    changedTouches: Touch[]
    identifier: number
    locationX: number
    locationY: number
    pageX: number
    pageY: number
    target: number
    timestamp: number
    touches: Touch[]
  }
}

/**
 * 触摸点
 */
export interface Touch {
  identifier: number
  locationX: number
  locationY: number
  pageX: number
  pageY: number
  target: number
  timestamp: number
}

// ============================================================================
// Rasen 组件类型
// ============================================================================

/**
 * RN Mount 函数类型
 */
export type RNMountFunction = (host: RNHostContext) => (() => void) | undefined

/**
 * RN 宿主上下文
 */
export interface RNHostContext {
  /**
   * 父节点的原生句柄
   */
  parentHandle: NativeHandle | null

  /**
   * 根视图标签
   */
  rootTag: number

  /**
   * UIManager 实例
   */
  uiManager: FabricUIManager

  /**
   * 追加子视图
   */
  appendChild(child: NativeHandle): void

  /**
   * 移除子视图
   */
  removeChild(child: NativeHandle): void

  /**
   * 更新视图属性
   */
  updateProps(handle: NativeHandle, props: Record<string, unknown>): void
}

/**
 * RN 同步组件
 */
export type RNSyncComponent<Props = Record<string, unknown>> = (
  props: Props
) => RNMountFunction

/**
 * RN 异步组件
 */
export type RNAsyncComponent<Props = Record<string, unknown>> = (
  props: Props
) => Promise<RNMountFunction>

/**
 * RN 组件
 */
export type RNComponent<Props = Record<string, unknown>> =
  | RNSyncComponent<Props>
  | RNAsyncComponent<Props>
