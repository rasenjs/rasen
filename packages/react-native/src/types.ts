/**
 * React Native Types
 *
 * 主要类型定义在 components/component.ts 中
 * 这里重新导出以保持向后兼容
 */

export type { RNMountable, Child, ComponentProps } from './components/component'

// 向后兼容的类型别名
export type RNMountFunction = RNMountable
import type { RNMountable } from './components/component'
