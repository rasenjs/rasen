/**
 * @rasenjs/rn-dom — React Native Element Prop Types
 *
 * Framework-agnostic TypeScript interfaces for all React Native built-in
 * elements and their props. These are plain types — no framework imports,
 * no runtime code.
 *
 * Framework adapters (vue-rn, react-rn, etc.) use these to provide
 * IDE IntelliSense in their respective template systems.
 *
 * To regenerate from @rasenjs/rn-dom/tags:
 *   node scripts/generate-element-types.mjs
 */

// ============================================================================
// Platform-agnostic shared types
// ============================================================================

export interface RNEvent {
  nativeEvent: Record<string, unknown>
}

export interface RNStyle {
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flex?: number
  flexGrow?: number
  flexShrink?: number
  flexBasis?: number | string
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly'
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around'
  flexWrap?: 'wrap' | 'nowrap' | 'wrap-reverse'
  gap?: number
  rowGap?: number
  columnGap?: number
  padding?: number
  paddingTop?: number
  paddingBottom?: number
  paddingLeft?: number
  paddingRight?: number
  paddingHorizontal?: number
  paddingVertical?: number
  margin?: number
  marginTop?: number
  marginBottom?: number
  marginLeft?: number
  marginRight?: number
  marginHorizontal?: number
  marginVertical?: number
  width?: number | string
  height?: number | string
  minWidth?: number | string
  maxWidth?: number | string
  minHeight?: number | string
  maxHeight?: number | string
  position?: 'relative' | 'absolute'
  top?: number | string
  bottom?: number | string
  left?: number | string
  right?: number | string
  backgroundColor?: string
  borderWidth?: number
  borderTopWidth?: number
  borderBottomWidth?: number
  borderLeftWidth?: number
  borderRightWidth?: number
  borderColor?: string
  borderRadius?: number
  opacity?: number
  overflow?: 'visible' | 'hidden' | 'scroll'
  shadowColor?: string
  shadowOffset?: { width?: number; height?: number }
  shadowOpacity?: number
  shadowRadius?: number
  elevation?: number
  fontSize?: number
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
  color?: string
  textAlign?: 'auto' | 'left' | 'right' | 'center' | 'justify'
  lineHeight?: number
  fontFamily?: string
  fontStyle?: 'normal' | 'italic'
  letterSpacing?: number
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through'
  textTransform?: 'none' | 'capitalize' | 'uppercase' | 'lowercase'
  transform?: string
}

// ============================================================================
// Common prop types
// ============================================================================

export interface RNCommonProps {
  style?: RNStyle | (RNStyle | undefined)[]
  testID?: string
  key?: string | number
}

export interface RNTouchProps {
  onTouchEnd?: (event: RNEvent) => void
  onTouchStart?: (event: RNEvent) => void
  onTouchMove?: (event: RNEvent) => void
  onTouchCancel?: (event: RNEvent) => void
  onLayout?: (event: RNEvent) => void
}

// ============================================================================
// Element-specific prop types
// ============================================================================

export type RNViewProps = RNCommonProps & RNTouchProps

export type RNSafeAreaViewProps = RNCommonProps & Pick<RNTouchProps, 'onTouchEnd' | 'onLayout'>

export type RNTextProps = RNCommonProps & RNTouchProps & {
  onPress?: (event: RNEvent) => void
  onLongPress?: (event: RNEvent) => void
  numberOfLines?: number
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
  selectable?: boolean
}

export type RNImageProps = RNCommonProps & Pick<RNTouchProps, 'onTouchEnd' | 'onLayout'> & {
  source?: { uri?: string; width?: number; height?: number } | number
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center'
  onLoad?: () => void
  onError?: () => void
}

export type RNTextInputProps = RNCommonProps & {
  text?: string
  value?: string | number
  placeholder?: string
  placeholderTextColor?: string
  editable?: boolean
  onChange?: (event: RNEvent) => void
  onFocus?: () => void
  onBlur?: () => void
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' | 'decimal-pad'
  secureTextEntry?: boolean
  multiline?: boolean
  maxLength?: number
}

export type RNAndroidTextInputProps = RNCommonProps & {
  text?: string
  placeholder?: string
  placeholderTextColor?: string
  editable?: boolean
  showSoftInputOnFocus?: boolean
  onChange?: (event: RNEvent) => void
  onFocus?: () => void
  onBlur?: () => void
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad' | 'number-pad' | 'decimal-pad'
  secureTextEntry?: boolean
  multiline?: boolean
  maxLength?: number
}

export type RNScrollViewProps = RNCommonProps & {
  contentContainerStyle?: RNStyle | (RNStyle | undefined)[]
  horizontal?: boolean
  showsHorizontalScrollIndicator?: boolean
  showsVerticalScrollIndicator?: boolean
  pagingEnabled?: boolean
  onScroll?: (event: RNEvent) => void
  scrollEnabled?: boolean
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled'
}

export type RNAndroidHorizontalScrollViewProps = RNCommonProps

export type RNActivityIndicatorProps = {
  size?: 'small' | 'large' | number
  color?: string
  animating?: boolean
  hidesWhenStopped?: boolean
  testID?: string
  key?: string | number
}

export type RNProgressBarAndroidProps = {
  styleAttr?: 'Horizontal' | 'Normal' | 'Small' | 'Large' | 'Inverse' | 'SmallInverse' | 'LargeInverse'
  indeterminate?: boolean
  progress?: number
  color?: string
  animating?: boolean
  testID?: string
  key?: string | number
}

export type RNSwitchProps = {
  value?: boolean
  onValueChange?: (value: boolean) => void
  disabled?: boolean
  trackColor?: { false?: string; true?: string }
  thumbColor?: string
  testID?: string
  key?: string | number
}

export type RNAndroidSwitchProps = RNSwitchProps

export type RNRefreshControlProps = {
  refreshing?: boolean
  onRefresh?: () => void
  tintColor?: string
  title?: string
  colors?: string[]
  progressBackgroundColor?: string
  testID?: string
  key?: string | number
}

export type RNAndroidSwipeRefreshLayoutProps = {
  refreshing?: boolean
  onRefresh?: () => void
  colors?: string[]
  progressBackgroundColor?: string
  size?: 'default' | 'large'
  testID?: string
  key?: string | number
}

export type RNModalProps = {
  visible?: boolean
  animationType?: 'none' | 'slide' | 'fade'
  onRequestClose?: () => void
  onShow?: () => void
  transparent?: boolean
  presentationStyle?: 'fullScreen' | 'pageSheet' | 'formSheet' | 'overFullScreen'
  testID?: string
  key?: string | number
}

export type RNDrawerLayoutAndroidProps = RNTouchProps & {
  drawerWidth?: number
  drawerPosition?: 'left' | 'right'
  renderNavigationView?: () => unknown
  onDrawerOpen?: () => void
  onDrawerClose?: () => void
  onDrawerSlide?: (event: RNEvent) => void
  testID?: string
  key?: string | number
}

export type RNDebuggingOverlayProps = {
  testID?: string
  key?: string | number
}

// ============================================================================
// Element prop map — maps tag name to its prop type
// ============================================================================

export interface RNElementPropMap {
  View: RNViewProps
  SafeAreaView: RNSafeAreaViewProps
  Text: RNTextProps
  Image: RNImageProps
  TextInput: RNTextInputProps
  AndroidTextInput: RNAndroidTextInputProps
  ScrollView: RNScrollViewProps
  AndroidHorizontalScrollView: RNAndroidHorizontalScrollViewProps
  ActivityIndicator: RNActivityIndicatorProps
  ProgressBarAndroid: RNProgressBarAndroidProps
  Switch: RNSwitchProps
  AndroidSwitch: RNAndroidSwitchProps
  RefreshControl: RNRefreshControlProps
  AndroidSwipeRefreshLayout: RNAndroidSwipeRefreshLayoutProps
  Modal: RNModalProps
  DrawerLayoutAndroid: RNDrawerLayoutAndroidProps
  DebuggingOverlay: RNDebuggingOverlayProps
}

/** Lookup the prop type for a given element tag name. */
export type ElementProps<T extends keyof RNElementPropMap> = RNElementPropMap[T]

// ============================================================================
// Runtime tag list — used by Vue SFC transformer to distinguish RN primitives
// ============================================================================

/** All known React Native built-in element tag names. */
export const RN_BUILT_IN_TAGS: (keyof RNElementPropMap)[] = [
  'View', 'SafeAreaView',
  'Text',
  'Image',
  'TextInput', 'AndroidTextInput',
  'ScrollView', 'AndroidHorizontalScrollView',
  'ActivityIndicator', 'ProgressBarAndroid',
  'Switch', 'AndroidSwitch',
  'RefreshControl', 'AndroidSwipeRefreshLayout',
  'Modal',
  'DrawerLayoutAndroid',
  'DebuggingOverlay',
]

const TAG_SET = new Set<string>(RN_BUILT_IN_TAGS)

/** Check if a tag is a known RN built-in (transformer use). */
export function isRNBuiltIn(tag: string): boolean {
  return TAG_SET.has(tag)
}

/** Get all known RN tag names (transformer use). */
export function getAllTags(): string[] {
  return [...TAG_SET]
}

// ============================================================================
// All known prop keys — for strict setAttribute typing on RNNode
// ============================================================================

/** Union of all possible RN element prop names. */
type _UnionOf<T> = T extends Record<string, unknown> ? keyof T : never
export type RNElementPropName = _UnionOf<RNElementPropMap[keyof RNElementPropMap]> & string
