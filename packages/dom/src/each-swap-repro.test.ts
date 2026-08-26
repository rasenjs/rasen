/**
 * Repro: keyed each diff on large-table swap (js-framework-benchmark 05_swap1k).
 * Verifies DOM order after swapping positions 2 and 999, repeatedly.
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

describe('each swap repro (1000 rows)', () => {
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

  it('swaps rows 2 and 999 correctly, repeatedly', () => {
    data.value = buildData(1000)

    const swap = () => {
      const d = data.value
      const tmp = d[1]
      d[1] = d[998]
      d[998] = tmp
      data.value = [...d]
    }

    // initial order sanity
    expect(rowIds()[0]).toBe('1')
    expect(rowIds()[1]).toBe('2')
    expect(rowIds()[998]).toBe('999')
    expect(rowIds()[999]).toBe('1000')

    swap()
    let ids = rowIds()
    expect(ids[1]).toBe('999')
    expect(ids[998]).toBe('2')
    expect(ids[999]).toBe('1000')

    swap()
    ids = rowIds()
    expect(ids[1]).toBe('2')
    expect(ids[998]).toBe('999')
    expect(ids[999]).toBe('1000')

    swap()
    ids = rowIds()
    expect(ids[1]).toBe('999')
    expect(ids[998]).toBe('2')
    expect(ids[999]).toBe('1000')
  })
})
