/**
 * @rasenjs/rn-dom — elements/ActivityIndicatorNode
 *
 * ActivityIndicator 标签的 RN JS 层行为(对齐 RN ActivityIndicator.js)。
 *
 * RN 是**两节点**结构(ActivityIndicator.js render):
 *   <View onLayout={onLayout} style={[container, userStyle]}>
 *     {Platform.OS === 'android'
 *       ? <ProgressBarAndroid styleAttr='Normal' indeterminate style={sizeStyle} .../>
 *       : <ActivityIndicatorViewNativeComponent style={sizeStyle} .../>}
 *   </View>
 * container = { alignItems: 'center', justifyContent: 'center' }
 * sizeStyle  = small 20×20 / large 36×36 / number N×N
 *
 * 本元素自身 = 外层容器 View(用户 style/onLayout + 居中 base);内层 spinner
 * 由 __RN_buildChildren 创建/缓存(animating/color/hidesWhenStopped/size +
 * 固定尺寸)。__RN_alwaysBuildChildren=true:自闭合无 children 也构建内层。
 */

import { Platform } from 'react-native'
import { RNNode, allocateTag } from '../node'
import type { RNTextNode, RNCommentNode } from '../node'
import type { FabricNode, FabricUIManager } from '../fabric-global'

const NATIVE_SPINNER: Record<string, string> = {
  ios: 'RCTActivityIndicatorView',
  android: 'AndroidProgressBar',
}

export class RNActivityIndicatorElement extends RNNode {
  /** 内层 spinner(Fabric)缓存。 */
  __RN_spinnerFabric: FabricNode | null = null
  __RN_spinnerId: number | null = null
  __RN_spinnerPayload: Record<string, unknown> | null = null

  /** 自闭合但需内层结构节点 → 即使无 children 也构建。 */
  __RN_alwaysBuildChildren = true

  /** 元素自身是外层容器 View。 */
  __RN_resolveNativeName(): string | null {
    return 'RCTView'
  }

  /**
   * @internal - 外层容器 normalize:用户 style + 居中 base(styles.container)。
   * animating/color/hidesWhenStopped/size 仍留在 currentProps,由内层
   * spinner(__RN_buildSpinner)读取(容器 RCTView 忽略未知 props)。
   */
  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    return {
      ...props,
      style: [{ alignItems: 'center', justifyContent: 'center' }, props.style],
    }
  }

  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    rootTag: number,
    _getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    const spinner = this.__RN_buildSpinner(fabricUIManager, rootTag)
    if (spinner) fabricUIManager.appendChildToSet(childSet, spinner)
  }

  /**
   * Build (or rebuild) the inner spinner node. Mirrors RN ActivityIndicator.js:
   *   animating / color(iOS) / hidesWhenStopped / size + sizeStyle 固定尺寸。
   * payload 无变化时返回缓存节点(不 clone)。
   */
  __RN_buildSpinner(
    fabricUIManager: FabricUIManager,
    rootTag: number,
  ): FabricNode | null {
    const nativeName = NATIVE_SPINNER[Platform.OS] ?? 'RCTActivityIndicatorView'
    const { animating, color, hidesWhenStopped, size } = this.__RN_currentProps

    const resolvedSize = size ?? 'small'
    let sizeStyle: Record<string, number> | null = null
    if (resolvedSize === 'small') sizeStyle = { width: 20, height: 20 }
    else if (resolvedSize === 'large') sizeStyle = { width: 36, height: 36 }
    else if (typeof resolvedSize === 'number') sizeStyle = { width: resolvedSize, height: resolvedSize }

    const payload: Record<string, unknown> = {
      animating: animating !== false,
      hidesWhenStopped: hidesWhenStopped !== false,
      size: resolvedSize,
    }
    if (Platform.OS === 'ios' && color !== undefined) payload.color = color
    // RN ActivityIndicator.js:iOS 未设 color 时无条件注入 '#999999'。
    else if (Platform.OS === 'ios') payload.color = '#999999'
    if (Platform.OS === 'android') {
      payload.styleAttr = 'Normal'
      payload.indeterminate = true
    }
    if (sizeStyle) payload.style = [sizeStyle]

    let sp = this.__RN_spinnerFabric
    if (!sp) {
      const spId = this.__RN_spinnerId ?? (this.__RN_spinnerId = allocateTag())
      const handle = { tag: spId, stateNode: this }
      sp = fabricUIManager.createNode(spId, nativeName, rootTag, payload, handle)
      this.__RN_spinnerFabric = sp
    } else if (
      this.__RN_spinnerPayload == null ||
      JSON.stringify(this.__RN_spinnerPayload) !== JSON.stringify(payload)
    ) {
      sp = fabricUIManager.cloneNodeWithNewProps(sp, payload)
      this.__RN_spinnerFabric = sp
    }
    this.__RN_spinnerPayload = payload
    return sp
  }
}
