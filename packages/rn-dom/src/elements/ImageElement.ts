/**
 * @rasenjs/rn-dom — elements/ImageNode
 *
 * Image 标签的 RN JS 层 prop 转换(对齐 RN Image.android.js / Image.ios.js):
 *  - source → 数组 [{ uri, ... }](Android ImageViewManager 要 ReadableArray)
 *  - resizeMode 默认 'cover'(objectFit ?? prop ?? style ?? cover)
 *  - tintColor = prop ?? style.tintColor(iOS)
 *  - style 注入 base(overflow: 'hidden')+ 单 source 的固有宽高
 *  - Android: shouldNotifyLoadEvents / defaultSource→uri /
 *    loadingIndicatorSource→loadingIndicatorSrc / source[0].headers
 */

import { Platform } from 'react-native'
import { RNNode } from '../node'
import type { RNTextNode, RNCommentNode } from '../node'
import type { FabricUIManager } from '../fabric-global'
import { flatStyle, appendStylePrefix, applyAria } from './shared'

/** style.objectFit → 原生 resizeMode 映射(对齐 RN ImageUtils.js)。 */
const OBJECT_FIT_TO_RESIZE_MODE: Record<string, string> = {
  contain: 'contain',
  cover: 'cover',
  fill: 'stretch',
  'scale-down': 'contain',
  none: 'none',
}

/** crossOrigin / referrerPolicy → source headers(RN ImageSourceUtils.js)。 */
function ImageHeaders(props: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {}
  if (props.crossOrigin === 'use-credentials') headers['Access-Control-Allow-Credentials'] = 'true'
  if (typeof props.referrerPolicy === 'string') headers['Referrer-Policy'] = props.referrerPolicy
  return headers
}

export class RNImageElement extends RNNode {
  /**
   * @internal - RN: <Image> 不允许 children(对齐 Image.android.js / ios.js,
   * render 时 throw)。有 children 时直接抛错,引导用 ImageBackground。
   */
  __RN_buildChildren(
    _childSet: unknown,
    _fabricUIManager: FabricUIManager,
    _rootTag: number,
    __RN_getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    throw new Error(
      'The <Image> component cannot contain children. ' +
      'If you want to render content on top of the image, consider using the ' +
      '<ImageBackground> component or absolute positioning.',
    )
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    // source 解析(对齐 RN ImageSourceUtils.getImageSourcesFromImageProps):
    // 优先级 srcSet > src > source(字符串/对象统一转数组);crossOrigin /
    // referrerPolicy 组装成 source 上的 headers。
    // srcSet scale 为数字(RN parseInt('2x') → 2),非字符串;srcSet 无 1x 档时
    // 用 src 兜底({uri:src, scale:1, headers})。
    let source = props.source
    const src = props.src
    const srcSet = props.srcSet
    if (typeof srcSet === 'string') {
      const headers = ImageHeaders(props)
      const srcList: Record<string, unknown>[] = []
      let shouldUseSrcForDefaultScale = true
      for (const entry of srcSet.split(', ')) {
        const [uri, xScale = '1x'] = entry.split(' ')
        if (!xScale.endsWith('x')) {
          // RN warn:scale 格式不支持
          // eslint-disable-next-line no-console
          console.warn('The provided format for scale is not supported yet. Please use scales like 1x, 2x, etc.')
        } else {
          const scale = parseInt(xScale.slice(0, -1), 10)
          if (scale === 1) shouldUseSrcForDefaultScale = false
          srcList.push({ uri, scale, headers })
        }
      }
      if (shouldUseSrcForDefaultScale && typeof src === 'string') {
        srcList.unshift({ uri: src, scale: 1, headers })
      }
      source = srcList
    } else if (typeof src === 'string') {
      source = [{ uri: src }]
    } else if (source != null && typeof source === 'string') {
      source = [{ uri: source }]
    } else if (source != null && typeof source === 'object' && !Array.isArray(source)) {
      source = [source]
    }
    // crossOrigin / referrerPolicy → source headers(RN ImageSourceUtils.js)。
    const headers = ImageHeaders(props)
    if (Object.keys(headers).length > 0 && Array.isArray(source)) {
      source = source.map((s) =>
        s && typeof s === 'object' ? { ...(s as Record<string, unknown>), headers } : s,
      )
    }

    const imageStyle = flatStyle(props.style)
    // resizeMode: objectFit(映射后,优先级最高) ?? prop ?? style.resizeMode ??
    // 'cover'(native Android ImageView 默认 fitCenter,显式默认很关键)。
    const objectFit = imageStyle && imageStyle.objectFit
    const objectFitResizeMode = typeof objectFit === 'string'
      ? OBJECT_FIT_TO_RESIZE_MODE[objectFit]
      : undefined
    const resizeMode = objectFitResizeMode || props.resizeMode || (imageStyle && imageStyle.resizeMode) || 'cover'
    // iOS tintColor: prop ?? style.tintColor (Image.ios.js).
    const tintColor = props.tintColor !== undefined ? props.tintColor : (imageStyle && imageStyle.tintColor)

    // styles.base (overflow: 'hidden') always applied first; single source →
    // intrinsic width/height from source[0] (RN).
    let baseStyle: Record<string, unknown> | null = null
    if (Array.isArray(source)) {
      const src0 = source[0]
      if (source.length === 1 && src0 && typeof src0 === 'object') {
        // 兜底 props.width/height(RN: source.width ?? props.width)。
        const w0 = (src0 as Record<string, unknown>).width ?? props.width
        const h0 = (src0 as Record<string, unknown>).height ?? props.height
        if (w0 != null || h0 != null) baseStyle = { width: w0, height: h0 }
      }
    } else if (source && typeof source === 'object') {
      // Number asset ids pass through; object already converted above.
      if ((source as Record<string, unknown>).width != null || (source as Record<string, unknown>).height != null) {
        baseStyle = {
          width: (source as Record<string, unknown>).width,
          height: (source as Record<string, unknown>).height,
        }
      }
    }
    baseStyle = Object.assign({ overflow: 'hidden' }, baseStyle)

    const next: Record<string, unknown> = {
      ...props,
      source: source === props.source ? props.source : source,
      resizeMode,
      style: appendStylePrefix(props.style, baseStyle),
    }
    if (tintColor !== undefined && tintColor !== props.tintColor) next.tintColor = tintColor
    else if (tintColor === undefined && props.tintColor !== undefined) delete next.tintColor

    if (Platform.OS === 'android') {
      // shouldNotifyLoadEvents gates load-event dispatch on Android.
      if (props.onLoadStart != null || props.onLoad != null || props.onLoadEnd != null || props.onError != null) {
        next.shouldNotifyLoadEvents = true
      }
      // defaultSource → uri string; loadingIndicatorSource → loadingIndicatorSrc.
      const defaultSource = props.defaultSource
      if (defaultSource != null && typeof defaultSource === 'object' && !Array.isArray(defaultSource) && (defaultSource as Record<string, unknown>).uri != null) {
        next.defaultSource = (defaultSource as Record<string, unknown>).uri
      }
      const loadingIndicatorSource = props.loadingIndicatorSource
      if (loadingIndicatorSource != null && typeof loadingIndicatorSource === 'object' && !Array.isArray(loadingIndicatorSource) && (loadingIndicatorSource as Record<string, unknown>).uri != null) {
        next.loadingIndicatorSrc = (loadingIndicatorSource as Record<string, unknown>).uri
      }
      // Android: source[0].headers → headers prop.
      if (Array.isArray(source) && source[0] && (source[0] as Record<string, unknown>).headers != null) {
        next.headers = (source[0] as Record<string, unknown>).headers
      }
    }
    // RN Image.android.js/ios.js L191-196:defaultSource 与 loadingIndicatorSource
    // 互斥,同时指定时 warn(不 throw)。
    if (props.defaultSource != null && props.loadingIndicatorSource != null) {
      console.warn(
        'The <Image> component cannot have both a loadingIndicatorSource and a defaultSource. ' +
        'Please use either one or the other.',
      )
    }
    // Image aria(对齐 RN Image.android.js / Image.ios.js):
    //   label = aria-label ?? accessibilityLabel(aria 优先,alt 兜底)
    //   Android:aria-hidden → importantForAccessibility='no-hide-descendants'
    //            (不清 label);iOS:aria-hidden → accessible=false(保留 label)
    // 通用 applyAria 之后应用,以本链覆盖。
    const result = applyAria(next)
    const label = props['aria-label'] ?? props.accessibilityLabel
    const alt = props.alt
    const ariaHidden = props['aria-hidden']
    result.accessibilityLabel =
      ariaHidden === true ? (Platform.OS === 'android' ? label : (label ?? alt)) : (label ?? alt)
    result.accessible = ariaHidden === true ? false : (result.accessibilityLabel != null ? true : props.accessible)
    if (Platform.OS === 'android' && ariaHidden === true) {
      result.importantForAccessibility = 'no-hide-descendants'
    }
    return result
  }
}
