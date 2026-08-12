/**
 * 官方 react-native 测试用例消化(归一化维度)。
 *
 * 来源:react-native v0.86.0 官方测试 Libraries/Components/View/__tests__/View-test.js
 *       + Libraries/Text/__tests__/Text-test.js 的归一化断言。
 *
 * 与官方测试的区别:官方用 react-test-renderer 渲染真实 RN 组件做 snapshot 断言;
 * 这里把「输入 props → 归一化后 props」对直接落到 rn-dom 的 __RN_normalizeProps,
 * 不依赖 react-test-renderer / 独立 jest 配置 / 官方 preset mock —— 官方例子被
 * "消化"成我们自己的测试。
 *
 * 去重说明(这些官方断言已由 normalization.test.ts 覆盖,不重复落盘):
 *  - View:  applyAria 单测已覆盖 aria-* 全链 / tabIndex→focusable / id→nativeID;
 *           RNViewElement 继承基类 RNNode.__RN_normalizeProps(=applyAria)。
 *  - Text:  ellipsizeMode tail / allowFontScaling / overflow:hidden /
 *           link role / role 保留 / numberOfLines / userSelect→selectable /
 *           verticalAlign→textAlignVertical / id→nativeID 均已覆盖。
 *
 * 本文件只落盘「修复后发现的新缺口」:
 *  - Text: isPressable / isHighlighted 输出(RN Text.js PressableText)
 *  - Text: disabled → accessibilityState.disabled 同步 + disabled 输出
 *  - View: 官方 View-test 的聚合断言(作为独立 digest 对照,虽与 applyAria 单测
 *           重叠,但保证官方例子整体可消化)
 */

import { describe, it, expect } from 'vitest'
import { getElementClass } from '../elements/registry'
import type { RNNode } from '../node'

/** 测试内部成员访问:经内部接口读 protected 成员。 */
const internal = <T,>(node: T): any => node as any

function normalize(tagName: string, props: Record<string, unknown>): Record<string, unknown> {
  const Ctor = getElementClass(tagName)
  const node = new Ctor(null as never, 0, tagName, {}, null as never) as unknown as RNNode
  return internal(node).__RN_normalizeProps(props)
}

describe('official digest — Text pressability (Text.js PressableText)', () => {
  it('onPress → isPressable={true} + isHighlighted={false}', () => {
    const out = normalize('Text', { onPress: () => {} })
    expect(out.isPressable).toBe(true)
    expect(out.isHighlighted).toBe(false)
  })

  it('onLongPress → isPressable', () => {
    expect(normalize('Text', { onLongPress: () => {} }).isPressable).toBe(true)
  })

  it('onStartShouldSetResponder → isPressable', () => {
    expect(normalize('Text', { onStartShouldSetResponder: () => true }).isPressable).toBe(true)
  })

  it('无按压处理器 → 无 isPressable/isHighlighted', () => {
    const out = normalize('Text', {})
    expect(out.isPressable).toBeUndefined()
    expect(out.isHighlighted).toBeUndefined()
  })

  it('disabled={true} 阻止按压 → 无 isPressable', () => {
    const out = normalize('Text', { disabled: true, onPress: () => {} })
    expect(out.isPressable).toBeUndefined()
    expect(out.isHighlighted).toBeUndefined()
  })

  it('disabled={false} + onPress → isPressable(disabled 非 true 不阻止)', () => {
    const out = normalize('Text', { disabled: false, onPress: () => {} })
    expect(out.isPressable).toBe(true)
  })
})

describe('official digest — Text disabled (Text.js _disabled 同步)', () => {
  it('disabled={true} → disabled + accessibilityState.disabled', () => {
    const out = normalize('Text', { disabled: true })
    expect(out.disabled).toBe(true)
    expect(out.accessibilityState).toEqual({ disabled: true })
  })

  it('disabled={false} → disabled 保留,不注入 accessibilityState', () => {
    const out = normalize('Text', { disabled: false })
    expect(out.disabled).toBe(false)
    expect(out.accessibilityState).toBeUndefined()
  })

  it('aria-disabled → accessibilityState.disabled', () => {
    const out = normalize('Text', { 'aria-disabled': true })
    expect(out.accessibilityState).toEqual({ disabled: true })
  })

  it('disabled 覆盖 accessibilityState.disabled(不同步时用 disabled prop)', () => {
    const out = normalize('Text', { disabled: true, accessibilityState: { disabled: false } })
    expect(out.disabled).toBe(true)
    expect(out.accessibilityState).toEqual({ disabled: true })
  })

  it('accessibilityState.disabled 回退为 disabled(未显式 disabled prop)', () => {
    const out = normalize('Text', { accessibilityState: { disabled: true }, onPress: () => {} })
    expect(out.disabled).toBe(true)
    // disabled=true 阻止按压
    expect(out.isPressable).toBeUndefined()
  })
})

describe('official digest — View (View.js 归一化,基类 applyAria)', () => {
  it('core props: id→nativeID + tabIndex→focusable + testID 透传', () => {
    const out = normalize('View', { id: 'id', tabIndex: 0 as const, testID: 'testID' } as never)
    expect(out.nativeID).toBe('id')
    expect(out.focusable).toBe(true)
    expect(out.testID).toBe('testID')
  })

  it('aria-* 全链 → accessibility 派生(官方 View-test aria 聚合)', () => {
    const props = {
      'aria-busy': true,
      'aria-checked': true,
      'aria-disabled': true,
      'aria-expanded': true,
      'aria-hidden': true,
      'aria-label': 'label',
      'aria-labelledby': 'labelledby',
      'aria-live': 'polite' as const,
      'aria-selected': true,
      'aria-valuemax': 5,
      'aria-valuemin': 0,
      'aria-valuenow': 3,
      'aria-valuetext': '3',
      role: 'main' as const,
    }
    const out = normalize('View', props as never)
    expect(out.accessibilityElementsHidden).toBe(true)
    expect(out.accessibilityLabel).toBe('label')
    expect(out.accessibilityLabelledBy).toEqual(['labelledby'])
    expect(out.accessibilityLiveRegion).toBe('polite')
    expect(out.accessibilityState).toEqual({
      busy: true, checked: true, disabled: true, expanded: true, selected: true,
    })
    expect(out.accessibilityValue).toEqual({ max: 5, min: 0, now: 3, text: '3' })
    expect(out.importantForAccessibility).toBe('no-hide-descendants')
    expect(out.role).toBe('main')
  })
})
