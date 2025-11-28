/**
 * Rasen - 响应式渲染框架
 *
 * 特点：
 * 1. 响应式系统无关，可适配任何响应式库（Vue/Solid/Preact Signals等）
 * 2. 宿主环境无关，可适配任何渲染目标（Canvas/WebGL/SVG/DOM）
 * 3. 组件是纯函数，无虚拟 DOM，无实例
 * 4. 渲染逻辑由组件自己控制（通过 watch）
 *
 * 生命周期：
 * - setup: 组件函数调用，初始化响应式状态
 * - mount: 挂载函数调用，设置 watch 和事件监听
 * - update: watch 回调自动触发，执行重绘逻辑
 * - unmount: 清理函数调用，移除监听器
 */

// 核心组件
export { each, fragment } from './components'
export type {
  Component,
  SyncComponent,
  AsyncComponent,
  MountFunction
} from './types'

// 响应式系统
export {
  setReactiveRuntime,
  getReactiveRuntime,
  watch,
  effectScope,
  ref,
  computed,
  unrefValue
} from './reactive'
export type {
  ReactiveRuntime,
  ReactiveRef,
  ComputedRef,
  PropValue,
  WatchCallback,
  WatchOptions,
  WatchStopHandle,
  EffectScope
} from './reactive'

// Canvas 2D 适配器
export * from './canvas-2d'

// DOM 适配器
export * from './dom'

// Vue 适配器
export { createVueRuntime } from './adapters/vue'
