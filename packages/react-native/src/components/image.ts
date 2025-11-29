/**
 * Image 组件
 *
 * React Native 图片显示组件
 * 使用 component() 工厂函数创建，支持响应式更新
 */

import { component, type ImageProps, type RNMountFunction } from './component'

/**
 * Image 组件 - 图片显示
 *
 * @param props - Image 属性
 * @returns RNMountFunction
 *
 * @example
 * ```ts
 * image({
 *   source: { uri: 'https://example.com/image.png' },
 *   style: { width: 100, height: 100 },
 *   resizeMode: 'cover'
 * })
 * ```
 */
export function image(props: ImageProps): RNMountFunction {
  return component('Image', props)
}

export type { ImageProps }
export default image
