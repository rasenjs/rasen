/**
 * FlatList component tests — reactive list rendering:
 *  - renders items via renderItem
 *  - updates reactively when data changes
 *  - header / footer / empty components
 *  - keyExtractor / numColumns
 *  - onEndReached via scroll events
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from '@vue/reactivity'
import { FlatList } from '../FlatList'
import { text } from '../../components'
import {
  mountComponent,
  nodeProps,
  textContentOf,
  tick,
} from '../../__tests__/render-helper'

interface Item { id: number; name: string }

const items: Item[] = [
  { id: 1, name: 'a' },
  { id: 2, name: 'b' },
  { id: 3, name: 'c' },
]

function mountList(props: Record<string, unknown> = {}) {
  return mountComponent(
    (p) => FlatList({
      data: items,
      renderItem: ({ item }: { item: Item }) => text({ children: item.name }),
      ...p,
    }),
    props,
  )
}

describe('<FlatList />', () => {
  it('renders a ScrollView with all items', () => {
    const { root } = mountList()
    expect(root.tagName).toBe('ScrollView')
    expect(textContentOf(root)).toBe('abc')
  })

  it('renders header and footer', () => {
    const { root } = mountList({
      ListHeaderComponent: () => text({ children: 'HEAD' }),
      ListFooterComponent: () => text({ children: 'FOOT' }),
    })
    expect(textContentOf(root)).toBe('HEADabcFOOT')
  })

  it('renders empty component when data is empty', () => {
    const { root } = mountComponent(
      (p) => FlatList({
        data: [],
        renderItem: () => text({ children: 'x' }),
        ListEmptyComponent: () => text({ children: 'EMPTY' }),
        ...p,
      }),
    )
    expect(textContentOf(root)).toBe('EMPTY')
  })

  it('renders item separators', () => {
    const { root } = mountList({
      ItemSeparatorComponent: () => text({ children: '|' }),
    })
    expect(textContentOf(root)).toBe('a|b|c')
  })

  it('updates reactively when data ref changes', async () => {
    const data = ref<Item[]>([{ id: 1, name: 'a' }])
    const { root } = mountComponent(
      (p) => FlatList({
        data,
        renderItem: ({ item }: { item: Item }) => text({ children: item.name }),
        ...p,
      }),
    )
    expect(textContentOf(root)).toBe('a')
    data.value = [...data.value, { id: 2, name: 'b' }]
    await tick()
    expect(textContentOf(root)).toBe('ab')
  })

  it('passes contentContainerStyle and style to the ScrollView', () => {
    const { root } = mountList({
      contentContainerStyle: { padding: 20 },
      style: { flex: 1 },
    })
    expect(JSON.stringify(nodeProps(root).contentContainerStyle)).toContain('"padding":20')
    expect(JSON.stringify(nodeProps(root).style)).toContain('"flex":1')
  })

  it('fires onEndReached when scrolled near the end', () => {
    const onEndReached = vi.fn()
    const { root } = mountList({ onEndReached })
    const handler = nodeProps(root).onScroll as (e: unknown) => void
    handler({
      nativeEvent: {
        contentOffset: { y: 800 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 200 },
      },
    })
    expect(onEndReached).toHaveBeenCalledTimes(1)
    expect(onEndReached).toHaveBeenCalledWith({ distanceFromEnd: 0 })
  })

  it('does not fire onEndReached when far from the end', () => {
    const onEndReached = vi.fn()
    const { root } = mountList({ onEndReached })
    const handler = nodeProps(root).onScroll as (e: unknown) => void
    handler({
      nativeEvent: {
        contentOffset: { y: 0 },
        contentSize: { height: 1000 },
        layoutMeasurement: { height: 200 },
      },
    })
    expect(onEndReached).not.toHaveBeenCalled()
  })

  it('passes refreshing and onRefresh to the ScrollView', () => {
    const onRefresh = vi.fn()
    const { root } = mountList({ refreshing: true, onRefresh })
    expect(nodeProps(root).refreshing).toBe(true)
    expect(nodeProps(root).onRefresh).toBe(onRefresh)
  })

  it('supports numColumns by wrapping items in rows', () => {
    const { root } = mountList({ numColumns: 2 })
    // 3 items in 2 columns → 2 row Views.
    const rows = root.children.filter(c => c.tagName === 'View')
    expect(rows).toHaveLength(2)
  })
})