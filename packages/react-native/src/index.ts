/**
 * Rasen React Native 渲染器
 *
 * 直接绑定 React Native Fabric 架构的底层 API
 * 不依赖 React，直接操作原生视图树
 */

// 导出类型
export * from './types'

// 导出渲染上下文
export {
  RNRenderContext,
  createRootContext,
  getRootContext,
  removeRootContext,
  setFabricUIManager,
  getFabricUIManager,
  generateTag,
  resetTagCounter
} from './render-context'

// 导出组件
export * from './components'

// 导出工具函数
export {
  unref,
  watchProp,
  resolveStyle,
  resolveEventName,
  mergeProps,
  collectProps,
  isReactive,
  getReactiveProps,
  normalizeChildren
} from './utils'

import type { RNMountFunction, RNHostContext } from './types'
import {
  createRootContext,
  removeRootContext
} from './render-context'

/**
 * 挂载 Rasen 组件到 React Native 根视图
 *
 * @param component - Rasen 组件的 mount 函数
 * @param rootTag - React Native 根视图标签
 * @returns 卸载函数
 *
 * @example
 * ```typescript
 * import { mount, view, text } from '@rasenjs/react-native'
 * import { setReactiveRuntime } from '@rasenjs/core'
 * import { createSignalsRuntime, ref } from '@rasenjs/reactive-signals'
 *
 * // 设置响应式运行时
 * setReactiveRuntime(createSignalsRuntime())
 *
 * // 创建响应式状态
 * const count = ref(0)
 *
 * // 定义组件
 * const App = view({
 *   style: { flex: 1, justifyContent: 'center', alignItems: 'center' },
 *   children: [
 *     text({
 *       style: { fontSize: 24 },
 *       children: () => `Count: ${count.value}`
 *     })
 *   ]
 * })
 *
 * // 挂载到 RN 根视图 (rootTag 从 RN 原生模块获取)
 * const unmount = mount(App, rootTag)
 *
 * // 卸载
 * unmount()
 * ```
 */
export function mount(
  component: RNMountFunction,
  rootTag: number
): () => void {
  // 创建根渲染上下文
  const rootContext = createRootContext(rootTag)

  // 挂载组件
  const unmount = component(rootContext as unknown as RNHostContext)

  // 提交到根节点
  rootContext.commitToRoot()

  // 返回卸载函数
  return () => {
    unmount?.()
    removeRootContext(rootTag)
  }
}

/**
 * 注册原生模块
 * 用于在 React Native 应用中注册 Rasen 渲染器
 *
 * @param AppRegistry - React Native 的 AppRegistry
 * @param appName - 应用名称
 * @param getApp - 获取根组件的函数
 *
 * @example
 * ```typescript
 * import { AppRegistry } from 'react-native'
 * import { registerApp, view, text } from '@rasenjs/react-native'
 *
 * const App = view({
 *   children: [text({ children: 'Hello Rasen!' })]
 * })
 *
 * registerApp(AppRegistry, 'MyApp', () => App)
 * ```
 */
export function registerApp(
  AppRegistry: {
    registerComponent: (
      appKey: string,
      componentProvider: () => unknown
    ) => void
    runApplication: (appKey: string, appParams: unknown) => void
  },
  appName: string,
  getApp: () => RNMountFunction
): void {
  // 创建一个包装组件来桥接 RN 和 Rasen
  const RasenWrapper = () => {
    // 这个组件会在 RN 初始化时被调用
    // 我们需要获取 rootTag 并挂载 Rasen 组件
    return {
      // 标记为 Rasen 组件
      __rasen: true,
      mount: getApp()
    }
  }

  // 注册应用
  AppRegistry.registerComponent(appName, () => RasenWrapper)
}

/**
 * 创建 Rasen 应用入口
 * 用于替代 React.createElement 的入口函数
 *
 * @param rootTag - 根视图标签
 * @param component - 根组件
 *
 * @example
 * ```typescript
 * import { createRasenApp, view, text } from '@rasenjs/react-native'
 *
 * // 在原生模块初始化回调中
 * NativeModules.RasenBridge.getRootTag((rootTag) => {
 *   createRasenApp(rootTag, App)
 * })
 * ```
 */
export function createRasenApp(
  rootTag: number,
  component: RNMountFunction
): { unmount: () => void } {
  const unmount = mount(component, rootTag)
  return { unmount }
}
