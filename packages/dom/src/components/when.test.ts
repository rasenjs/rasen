/**
 * Bug 测试：when() 在 div() 内部的条件渲染 - DOM 版本
 */

import { describe, it, expect } from 'vitest'
import { getReactiveRuntime } from '@rasenjs/core'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { div, span, when } from './index'
import { ref } from '@vue/reactivity'

describe('Bug: when() inside div() - DOM', () => {
  it('when() 直接 mount 应该工作', async () => {
    useReactiveRuntime()
    console.log('it1: runtime set, can get:', !!getReactiveRuntime())

    const condition = ref(false)
    let mounted = false

    const w = when({
      condition,
      then: () => () => {
        mounted = true
        return () => {}
      }
    })

    const host = document.createElement('div')
    w(host)

    expect(mounted).toBe(false)

    condition.value = true
    await new Promise(r => setTimeout(r, 10))

    expect(mounted).toBe(true)
  })

  it('div() 内部嵌套 when() 应该工作', async () => {
    useReactiveRuntime()
    console.log('it2: runtime set, can get:', !!getReactiveRuntime())

    const condition = ref(false)
    let mounted = false

    const thenFn = () => () => {
      mounted = true
      return () => {}
    }

    const w = when({
      condition,
      then: thenFn
    })

    const app = div(
      {},
      span({}, 'Label'),
      w
    )

    const host = document.createElement('div')
    app(host)

    expect(mounted).toBe(false)

    condition.value = true
    await new Promise(r => setTimeout(r, 10))

    expect(mounted).toBe(true)
  })

  it('each() 内部 div() 嵌套 when() 应该工作', async () => {
    useReactiveRuntime()

    const items = ref([{ id: 1, show: false }])
    const mounted: number[] = []

    const { each } = await import('./index')

    const app = each(
      () => items.value,
      (item) => div(
        {},
        span({}, 'Item ' + item.id),
        when({
          condition: () => item.show,
          then: () => () => {
            mounted.push(item.id)
            return () => {}
          }
        })
      )
    )

    const host = document.createElement('div')
    app(host)

    expect(mounted).toEqual([])

    items.value[0].show = true
    await new Promise(r => setTimeout(r, 10))

    expect(mounted).toEqual([1])
  })

  it('响应式条件变化应该触发重新渲染', async () => {
    useReactiveRuntime()

    const condition = ref(false)
    const mounted: number[] = []
    const unmounted: number[] = []

    const w = when({
      condition,
      then: () => () => {
        mounted.push(1)
        return () => {
          unmounted.push(1)
        }
      }
    })

    const host = document.createElement('div')
    w(host)

    expect(mounted).toEqual([])

    condition.value = true
    await new Promise(r => setTimeout(r, 10))

    expect(mounted).toEqual([1])
    expect(unmounted).toEqual([])

    condition.value = false
    await new Promise(r => setTimeout(r, 10))

    expect(unmounted).toEqual([1])
  })
})
