/**
 * Image 组件
 *
 * React Native 图片显示组件
 * 直接调用 Fabric UIManager 创建原生 Image
 */

import { getReactiveRuntime } from '@rasenjs/core'
import type { RNSyncComponent, ImageProps } from '../types'
import { RNRenderContext } from '../render-context'
import { unref, resolveStyle, watchProp } from '../utils'

/**
 * Image 组件 - 图片显示
 */
export const image: RNSyncComponent<ImageProps> = (props) => {
  return (hostContext) => {
    const context = hostContext as unknown as RNRenderContext
    const stops: Array<() => void> = []

    // 解析图片源
    const resolveSource = () => {
      const source = unref(props.source)
      if (typeof source === 'number') {
        // 本地资源 (require('./image.png'))
        return { uri: source }
      }
      return source
    }

    // 收集初始属性
    const initialProps: Record<string, unknown> = {
      ...resolveStyle(props.style),
      source: resolveSource(),
      ...(props.resizeMode !== undefined && {
        resizeMode: unref(props.resizeMode)
      }),
      ...(props.blurRadius !== undefined && {
        blurRadius: unref(props.blurRadius)
      }),
      ...(props.testID !== undefined && { testID: unref(props.testID) }),
      ...(props.accessible !== undefined && { accessible: unref(props.accessible) }),
      ...(props.accessibilityLabel !== undefined && {
        accessibilityLabel: unref(props.accessibilityLabel)
      })
    }

    // 添加事件处理器
    if (props.onLoad) {
      initialProps.onLoad = props.onLoad
    }
    if (props.onError) {
      initialProps.onError = props.onError
    }
    if (props.onLoadStart) {
      initialProps.onLoadStart = props.onLoadStart
    }
    if (props.onLoadEnd) {
      initialProps.onLoadEnd = props.onLoadEnd
    }

    // 创建原生 Image
    const handle = context.createView('RCTImageView', initialProps)

    // 追加到父节点
    context.appendChild(handle)

    // 监听图片源变化
    if (getReactiveRuntime().isRef(props.source)) {
      stops.push(
        watchProp(
          () => resolveSource(),
          (newSource) => {
            context.updateProps(handle, { source: newSource })
          }
        )
      )
    }

    // 监听样式变化
    if (props.style) {
      stops.push(
        watchProp(
          () => resolveStyle(props.style),
          (newStyle) => {
            context.updateProps(handle, newStyle)
          }
        )
      )
    }

    // 监听其他属性变化
    const watchableProps = [
      'resizeMode',
      'blurRadius',
      'testID',
      'accessible',
      'accessibilityLabel'
    ] as const

    for (const propName of watchableProps) {
      const propValue = props[propName]
      if (propValue !== undefined && getReactiveRuntime().isRef(propValue)) {
        stops.push(
          watchProp(
            () => unref(propValue),
            (value) => {
              context.updateProps(handle, { [propName]: value })
            }
          )
        )
      }
    }

    // 返回 unmount 函数
    return () => {
      stops.forEach((stop) => stop())
      context.removeChild(handle)
    }
  }
}

export default image
