/**
 * @rasenjs/rn-dom — elements/ModalElement
 *
 * Modal 标签的 RN JS 层行为(对齐 RN Modal.js):
 *  - props:animationType || 'none';presentationStyle 默认 'fullScreen'
 *    (transparent → 'overFullScreen');hardwareAccelerated 默认 false
 *  - visible 默认 true(始终挂载 + 原生 visible 控制显隐)
 *  - __DEV__ confirmProps 警告
 *  - children:直接挂 RCTModalHostView(容器语义交给用户内容自己设置背景)。
 *
 * 架构说明(为什么无容器):
 *  RN Modal.js 在 RCTModalHostView 内包一层容器 View(flex:1 + 背景),由容器
 *  提供白底/透明遮罩。但 rn-dom 直接映射 Fabric,ModalHostView 是
 *  RootNodeKind(子树独立布局,约束来自 C++ screenSize state),子树的内部
 *  createNode(如容器 View)的 style 在原生完全不被应用(实测 0 高,style
 *  width/height/position/backgroundColor 全忽略)。而 children 直接挂
 *  ModalHostView 则正常全屏(screenSize 约束生效)。
 *  因此 rn-dom 的 Modal 不包容器,由用户内容自行设置背景/布局
 *  (等同 RN 的 transparent Modal 语义)。
 */

import { Platform } from 'react-native'
import { RNNode } from '../node'
import type { RNTextNode, RNCommentNode } from '../node'
import type { FabricUIManager } from '../fabric-global'
import { registerModalNode, type EventNode } from '../event-system'

export class RNModalElement extends RNNode {
  /**
   * @internal Modal 的 native identifier(registerModalNode 分配)。
   * 预定义字段(非动态加属性)。
   */
  __RN_modalID: number | null = null

  /**
   * @internal - 挂载前注入 native `identifier`(onDismiss 路由,RN Modal.js
   * 的 uniqueModalIdentifier)。由 __RN_getFabricNode 在 buildFabricPayload 前调用。
   */
  __RN_preparePayload(fabricProps: Record<string, unknown>): void {
    const id = registerModalNode(this as unknown as EventNode, fabricProps)
    fabricProps.identifier = id
  }

  /**
   * @internal - Fabric createNode 需要 C++ registry 名 'ModalHostView'
   * (codegen 名),而 viewConfigRegistry 注册的是 'RCTModalHostView'(paper 名)。
   * 这里映射:viewConfig 查询用 RCTModalHostView(createElement 已解析),
   * createNode 用 ModalHostView —— 否则 C++ 走 fallback descriptor(普通 View),
   * 无 Dialog/无全屏。
   */
  __RN_resolveNativeName(): string | null {
    return 'ModalHostView'
  }

  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    let presentationStyle = props.presentationStyle
    if (!presentationStyle) {
      presentationStyle = props.transparent === true ? 'overFullScreen' : 'fullScreen'
    }
    // RN Modal.js confirmProps(__DEV__ 告警,不 throw)。
    if (__DEV__) {
      if (props.presentationStyle != null && props.transparent === true && props.presentationStyle !== 'overFullScreen') {
        console.warn('Cannot specify "transparent" prop with "presentationStyle" prop.')
      }
      if (props.navigationBarTranslucent != null && props.statusBarTranslucent == null) {
        console.warn('`navigationBarTranslucent` requires `statusBarTranslucent` to be set.')
      }
      if (Platform.OS === 'ios' && props.allowSwipeDismissal === true && props.onRequestClose == null) {
        console.warn('Cannot specify "allowSwipeDismissal" prop without "onRequestClose" prop.')
      }
    }
    return {
      ...props,
      // visible 默认 true(RN Modal defaultProps);始终挂载 + 原生 visible 控制
      // 显隐(支持 iOS 退场动画期间保持渲染,onDismiss 由 native 触发)。
      visible: props.visible !== false,
      animationType: props.animationType || 'none',
      presentationStyle,
      hardwareAccelerated: props.hardwareAccelerated === true,
    }
  }

  // ── children:直接挂 RCTModalHostView ──────────────────────────────

  __RN_buildChildren(
    childSet: unknown,
    fabricUIManager: FabricUIManager,
    _rootTag: number,
    getFabricNode: (node: RNNode | RNTextNode | RNCommentNode) => unknown,
  ): void {
    // children 直接挂 ModalHostView。ModalHostView 子树布局用 screenSize
    // (RootNodeKind),children 能全屏布局;不能包内部容器(容器 style 在
    // RootNodeKind 子树不生效,实测 0 高)。
    for (const subChild of this.__RN_children) {
      const subFabricNode = getFabricNode(subChild)
      if (subFabricNode) fabricUIManager.appendChildToSet(childSet, subFabricNode)
    }
  }
}
