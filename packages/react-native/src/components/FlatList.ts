/**
 * FlatList — RN FlatList equivalent for Rasen.
 *
 * A scrollable, reactive list built on rn-dom's ScrollView. Supports the core
 * RN FlatList API surface:
 *
 *  - `data` (array | ref | getter) + `renderItem`
 *  - `keyExtractor`, `numColumns`, `ItemSeparatorComponent`
 *  - `ListHeaderComponent` / `ListFooterComponent` / `ListEmptyComponent`
 *  - `contentContainerStyle`, `style`
 *  - `onEndReached` / `onEndReachedThreshold` (via ScrollView onScroll)
 *  - `refreshing` / `onRefresh` (RefreshControl)
 *
 * Rendering strategy:
 *  - Plain lists (single column, no separators) render items via rasen's
 *    `each` — incremental mount/unmount on data changes.
 *  - Lists with separators / numColumns build the content reactively and
 *    re-render on data changes (items remount; a future optimization could
 *    reuse `each` for these cases too).
 */

import { getReactiveRuntime, toValue, type Mountable, type Ref, each } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { element, renderChildren, type Child } from '../element'

export interface ListRenderItemInfo<T> {
  item: T
  index: number
}

/** RN-style renderItem: receives `{ item, index }`. */
export type ListRenderItem<T> = (info: ListRenderItemInfo<T>) => Mountable<RNNode>

export type ComponentOrMountable =
  | (() => Mountable<RNNode>)
  | Mountable<RNNode>

export interface FlatListProps<T extends object> {
  data: T[] | Ref<T[]> | (() => T[])
  renderItem: ListRenderItem<T>
  keyExtractor?: (item: T, index: number) => string
  numColumns?: number
  ItemSeparatorComponent?: () => Mountable<RNNode>
  ListHeaderComponent?: ComponentOrMountable
  ListFooterComponent?: ComponentOrMountable
  ListEmptyComponent?: ComponentOrMountable
  contentContainerStyle?: Record<string, unknown> | Array<Record<string, unknown>> | (() => Record<string, unknown>)
  style?: Record<string, unknown> | Array<Record<string, unknown>> | (() => Record<string, unknown>)
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  refreshing?: boolean
  onRefresh?: () => void
  onScroll?: (e: unknown) => void
  testID?: string
  [key: string]: unknown
}

/** Normalize a renderItem callback to `(item, index) => Mountable`. */
function normalizeRenderItem<T>(renderItem: ListRenderItem<T>) {
  return (item: T, index: number): Mountable<RNNode> =>
    renderItem({ item, index })
}

/** Resolve a component-or-mountable into a Mountable. */
function resolveComponentOrMountable(
  comp: ComponentOrMountable | undefined,
): Mountable<RNNode> | null {
  if (comp == null) return null
  return typeof comp === 'function' ? (comp as () => Mountable<RNNode>)() : comp
}

/**
 * Render a reactive list of Mountables into a parent, re-rendering whenever
 * the getter's reactive deps change.
 */
function renderList(
  parent: RNNode,
  getContent: () => Mountable<RNNode>[],
): () => void {
  const runtime = getReactiveRuntime()
  let unmounts: (() => void)[] = []

  const render = (): void => {
    for (const u of unmounts) u()
    unmounts = []
    for (const m of getContent()) {
      const u = m(parent)
      if (u) unmounts.push(u)
    }
  }

  render()
  const stop = runtime.watch(getContent, render)
  return () => {
    stop()
    for (const u of unmounts) u()
    unmounts = []
  }
}

export function FlatList<T extends object>(props: FlatListProps<T>): Mountable<RNNode> {
  const {
    data,
    renderItem,
    keyExtractor,
    numColumns,
    ItemSeparatorComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    contentContainerStyle,
    style,
    onEndReached,
    onEndReachedThreshold,
    refreshing,
    onRefresh,
    onScroll,
    testID,
    ...rest
  } = props

  const render = normalizeRenderItem(renderItem)
  const columns = numColumns ?? 1
  const plainList = columns === 1 && !ItemSeparatorComponent

  // ── Build the list content (header + items + footer) ────────────
  const buildContent = (): Mountable<RNNode>[] => {
    const content: Mountable<RNNode>[] = []

    const header = resolveComponentOrMountable(ListHeaderComponent)
    if (header) content.push(header)

    const list = toValue(data)
    if (list.length === 0) {
      const empty = resolveComponentOrMountable(ListEmptyComponent)
      if (empty) content.push(empty)
    } else if (columns === 1) {
      for (let i = 0; i < list.length; i++) {
        content.push(render(list[i], i))
        if (ItemSeparatorComponent && i < list.length - 1) {
          content.push(ItemSeparatorComponent())
        }
      }
    } else {
      // numColumns > 1: group items into row Views.
      for (let r = 0; r < Math.ceil(list.length / columns); r++) {
        const start = r * columns
        const rowItems = list.slice(start, start + columns)
        content.push(
          element('View', {
            style: { flexDirection: 'row' },
            children: rowItems.map((item, c) => render(item, start + c)),
          }),
        )
      }
    }

    const footer = resolveComponentOrMountable(ListFooterComponent)
    if (footer) content.push(footer)

    return content
  }

  return (host: RNNode) => {
    const el = host.ownerDocument.createElement('ScrollView')
    host.appendChild(el)
    const cleanups: (() => void)[] = []

    if (contentContainerStyle !== undefined) {
      el.setAttribute('contentContainerStyle', contentContainerStyle)
    }
    if (style !== undefined) el.setAttribute('style', style)
    if (testID !== undefined) el.setAttribute('testID', testID)
    if (refreshing !== undefined) el.setAttribute('refreshing', refreshing)
    if (onRefresh !== undefined) el.setAttribute('onRefresh', onRefresh)
    // Pass through any remaining props as ScrollView attributes.
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) el.setAttribute(k, v)
    }

    // onEndReached: forward scroll events, fire when near the end.
    const threshold = onEndReachedThreshold ?? 2
    const handleScroll = (e: unknown) => {
      onScroll?.(e)
      if (!onEndReached) return
      const native = (e as { nativeEvent?: { contentOffset?: { y: number }; contentSize?: { height: number }; layoutMeasurement?: { height: number } } })?.nativeEvent
      if (!native) return
      const offsetY = native.contentOffset?.y ?? 0
      const contentHeight = native.contentSize?.height ?? 0
      const viewportHeight = native.layoutMeasurement?.height ?? 0
      const distanceFromEnd = contentHeight - (offsetY + viewportHeight)
      if (distanceFromEnd < threshold * viewportHeight) {
        onEndReached({ distanceFromEnd })
      }
    }
    el.setAttribute('onScroll', handleScroll)

    // ── Content: header + items + footer ──────────────────────────
    if (plainList) {
      // Fast path: incremental updates via `each`.
      const header = resolveComponentOrMountable(ListHeaderComponent)
      const footer = resolveComponentOrMountable(ListFooterComponent)
      const children: Child[] = []
      if (header) children.push(header)
      if (toValue(data).length === 0) {
        const empty = resolveComponentOrMountable(ListEmptyComponent)
        if (empty) children.push(empty)
      } else {
        children.push(each(data, render))
      }
      if (footer) children.push(footer)
      cleanups.push(...renderChildren(el, children))
    } else {
      cleanups.push(renderList(el, buildContent))
    }

    // ── Cleanup ────────────────────────────────────────────────────
    const unmount = () => {
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]()
      if (el.parentNode) el.parentNode.removeChild(el)
    }
    ;(unmount as { node?: RNNode }).node = el
    return unmount
  }
}