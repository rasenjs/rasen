/**
 * @rasenjs/rn-dom — elements/ProgressBarAndroid
 *
 * ProgressBarAndroid 的 RN JS 层默认值(对齐 RN ProgressBarAndroid.android.js
 * L55-77:默认值在 JS 函数参数):
 *  - styleAttr 默认 'Normal'、indeterminate 默认 true、animating 默认 true
 * color 原样透传(color → progressTintColor/progressBackgroundColor 的转换在
 * 原生 ReactProgressBarManager,不在 JS 层)。原生 spec 是 interfaceOnly:
 * 无命令、无事件(除 ViewProps 基类)。
 */

import { RNNode } from '../node'

export class RNProgressBarAndroidElement extends RNNode {
  __RN_normalizeProps(props: Record<string, unknown>): Record<string, unknown> {
    return {
      ...props,
      styleAttr: props.styleAttr ?? 'Normal',
      indeterminate: props.indeterminate !== false,
      animating: props.animating !== false,
    }
  }
}
