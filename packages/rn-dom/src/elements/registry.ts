/**
 * @rasenjs/rn-dom — elements/registry: tag → 节点类 注册表
 *
 * createElement() 通过 getElementClass(tag) 解析每个标签对应的节点类。
 * 节点类承载该标签的 RN JS 层行为:props 转换(__RN_normalizeProps),后续
 * 事件/children 阶段的 hook。未知/第三方标签回退到基类 RNNode。
 *
 * 这份注册表是 per-tag 行为的"单一入口",替代旧的 elements.cjs
 * __RN_normalizeProps 大 switch。
 */

import { RNNode } from '../node'
import { RNViewElement } from './ViewElement'
import { RNTextElement } from './TextElement'
import { RNTextInputElement } from './TextInputElement'
import { RNSwitchElement } from './SwitchElement'
import { RNImageElement } from './ImageElement'
import { RNScrollViewElement } from './ScrollViewElement'
import { RNModalElement } from './ModalElement'
import { RNActivityIndicatorElement } from './ActivityIndicatorElement'
import { RNProgressBarAndroidElement } from './ProgressBarAndroidElement'
import { RNRefreshControlElement } from './RefreshControlElement'
import { RNDrawerLayoutAndroidElement } from './DrawerLayoutAndroidElement'
// RN_BUILT_IN_TAGS 是唯一权威的内置标签列表(transformer 也用它)。
// registry 从它派生默认映射,避免两份 tag 表重复登记。
import { RN_BUILT_IN_TAGS } from '@rasenjs/rn-dom/elements'

/** 元素类构造签名 —— 与 RNNode 构造函数一致(子类继承)。 */
type ElementCtor = new (...args: ConstructorParameters<typeof RNNode>) => RNNode

/** 有特殊 JS 层行为的标签 → 专属节点类。其余内置标签默认 RNViewElement(透传)。 */
const SPECIAL_CLASSES: Record<string, ElementCtor> = {
  Text: RNTextElement,
  TextInput: RNTextInputElement,
  AndroidTextInput: RNTextInputElement,
  Switch: RNSwitchElement,
  AndroidSwitch: RNSwitchElement,
  Image: RNImageElement,
  ScrollView: RNScrollViewElement,
  AndroidHorizontalScrollView: RNScrollViewElement,
  Modal: RNModalElement,
  ActivityIndicator: RNActivityIndicatorElement,
  ProgressBarAndroid: RNProgressBarAndroidElement,
  RefreshControl: RNRefreshControlElement,
  AndroidSwipeRefreshLayout: RNRefreshControlElement,
  DrawerLayoutAndroid: RNDrawerLayoutAndroidElement,
}

/** TAG → Class,从 RN_BUILT_IN_TAGS 派生 + 特殊类覆盖。 */
const TAG_TO_CLASS: Record<string, ElementCtor> = {}
for (const tag of RN_BUILT_IN_TAGS) {
  TAG_TO_CLASS[tag] = RNViewElement
}
Object.assign(TAG_TO_CLASS, SPECIAL_CLASSES)

/**
 * Resolve the node class for a tag (falls back to base RNNode for unknown /
 * third-party tags).
 */
export function getElementClass(tagName: string): ElementCtor {
  return TAG_TO_CLASS[tagName] ?? RNNode
}
