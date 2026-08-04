/**
 * @rasenjs/rn-dom — elements/ViewNode
 *
 * View 及"渲染为 View"的标签(引用透传,基类 __RN_normalizeProps 即透传)。
 * 覆盖:View / SafeAreaView / Pressable / Touchable* / DrawerLayoutAndroid /
 * RefreshControl / AndroidSwipeRefreshLayout / ProgressBarAndroid 等。
 *
 * View 的 props 基本都被 RN 透传(accessibility、hitSlop、pointerEvents…),
 * 无 RN JS 层转换,故这里无需 override __RN_normalizeProps —— 继承 RNNode 默认
 * 透传即可。后续事件/children 阶段可在此加入按压/抽屉等交互 hook。
 */

import { RNNode } from '../node'

export class RNViewElement extends RNNode {
  // View props 均透传(无 RN JS 层 prop 转换),继承基类 __RN_normalizeProps。
}
