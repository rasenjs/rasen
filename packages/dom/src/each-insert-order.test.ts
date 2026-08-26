/**
 * Repro: keyed each diff — mid-list insertion followed by a moved row.
 *
 * When a new row is created in the incremental diff path, the backward scan's
 * `nextNode` cursor must advance to the created instance's physical left
 * boundary (node-pair `first`, or legacy `marker`). If it resolves to
 * `undefined` for node-pair instances, a later-processed (lower-index) moved
 * row loses its insert reference and is appended at the end instead.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ref } from '@vue/reactivity'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { mount, each, element } from './index'

// each() reads the reactive runtime at creation time — set it up front.
useReactiveRuntime()

interface RowData {
  id: number
}

describe('each mid-list insert + move ordering', () => {
  let container: HTMLElement
  let tbody: HTMLElement
  let data = ref<RowData[]>([])
  let nextId = 1

  const buildData = (n: number): RowData[] => {
    const out: RowData[] = []
    for (let i = 0; i < n; i++) out.push({ id: nextId++ })
    return out
  }

  const rowIds = (): string[] => {
    const rows = tbody.querySelectorAll('tr')
    return Array.from(rows).map((r) => (r.firstElementChild as HTMLElement).textContent!)
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const table = document.createElement('table')
    tbody = document.createElement('tbody')
    table.appendChild(tbody)
    container.appendChild(tbody)
    nextId = 1
    data = ref<RowData[]>([])

    const unmountEach = mount(
      each(
        () => data.value,
        (item: RowData) =>
          element({ tag: 'tr', children: [element({ tag: 'td', children: String(item.id) })] })
      ),
      tbody
    )
    void unmountEach
  })

  it('keeps order when an inserted row precedes a moved row', () => {
    // [1,2,3,4] -> [3,5,1,2]: remove 4, insert 5 mid-list, move 3 to front.
    // Diff shape: LIS keeps [1,2]; row 3 is moved; row 5 is created at a
    // HIGHER index than the moved row, so the moved row is processed after
    // the creation and must not lose its insert reference.
    data.value = buildData(4)
    expect(rowIds()).toEqual(['1', '2', '3', '4'])

    const d = data.value
    data.value = [d[2], { id: nextId++ }, d[0], d[1]]

    expect(rowIds()).toEqual(['3', '5', '1', '2'])
  })
})
