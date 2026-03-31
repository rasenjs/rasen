/**
 * React Native Components
 */

// 核心组件函数
export {
  component,
  type RNMountable,
  type Child,
  type ComponentProps
} from './component'

// 便捷组件（已迁移到新架构）
export { view, type ViewProps } from './view'
export { text, type TextProps } from './text'
export { touchable, type TouchableProps } from './touchable'
export { touchableOpacity, type TouchableOpacityProps } from './touchable-opacity'
export { scrollView, type ScrollViewProps } from './scroll-view'
export { each } from './each'

// 未迁移完成的组件（依赖旧 render-context，暂时不导出）
// export { textInput, type TextInputProps } from './text-input'
// export { image, type ImageProps } from './image'
// export { flatList, type FlatListProps } from './flat-list'
