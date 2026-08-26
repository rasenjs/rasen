/**
 * Rasen implementation for js-framework-benchmark
 * https://github.com/krausest/js-framework-benchmark
 */

import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref } from '@rasenjs/reactive-vue'
import { mount, each, configureEventDelegation } from '@rasenjs/dom'

// Initialize reactive runtime with Vue reactivity
const runtime = createReactiveRuntime()
setReactiveRuntime(runtime)
// // configureEventDelegation(true)

// ============================================================================
// Data Generation
// ============================================================================

const adjectives = [
  'pretty', 'large', 'big', 'small', 'tall', 'short', 'long', 'handsome',
  'plain', 'quaint', 'clean', 'elegant', 'easy', 'angry', 'crazy', 'helpful',
  'mushy', 'odd', 'unsightly', 'adorable', 'important', 'inexpensive',
  'cheap', 'expensive', 'fancy'
]

const colours = [
  'red', 'yellow', 'blue', 'green', 'pink', 'brown', 'purple', 'brown',
  'white', 'black', 'orange'
]

const nouns = [
  'table', 'chair', 'house', 'bbq', 'desk', 'car', 'pony', 'cookie',
  'sandwich', 'burger', 'pizza', 'mouse', 'keyboard'
]

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max
}

let nextId = 1

interface RowData {
  id: number
  label: string
  selected?: boolean
}

function buildData(count: number): RowData[] {
  const data: RowData[] = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`
    })
  }
  return data
}

// ============================================================================
// State
// ============================================================================

const data = ref<RowData[]>([])
// id -> reactive row proxy. Rebuilt whenever the array is replaced; lets
// select() locate the two affected rows in O(1) instead of scanning the
// proxied array (proxy reads cost far more than the fanout they replace).
let rowById: Map<number, RowData> = new Map()
let lastSelectedId = 0

function rebuildIndex() {
  rowById = new Map()
  for (const r of data.value) rowById.set(r.id, r)
}

// ============================================================================
// Actions
// ============================================================================

function run() {
  data.value = buildData(1000)
  rebuildIndex()
  lastSelectedId = 0
}

function runLots() {
  data.value = buildData(10000)
  rebuildIndex()
  lastSelectedId = 0
}

function add() {
  // Reassign to a new array so the single-subscription `each` re-runs.
  // Mutating in place (data.value.push) would not notify the watcher.
  data.value = [...data.value, ...buildData(1000)]
  for (const r of data.value) if (!rowById.has(r.id)) rowById.set(r.id, r)
}

function update() {
  const d = data.value
  // In-place item mutation — the idiomatic pattern for our reference-keyed
  // `each`: object references stay identical, so the list diff is a no-op,
  // and each row's label binding (a tracked read of the deeply-reactive
  // `item.label`) patches just its own text node.
  for (let i = 0; i < d.length; i += 10) {
    d[i].label = d[i].label + ' !!!'
  }
}

function clear() {
  data.value = []
  rowById = new Map()
  lastSelectedId = 0
}

function swapRows() {
  const d = data.value
  if (d.length > 998) {
    const tmp = d[1]
    d[1] = d[998]
    d[998] = tmp
    // 修改后需要重新赋值以触发反应性
    data.value = [...d]
  }
}

function select(id: number) {
  // Per-row field write via the id index: exactly two proxy writes fire
  // exactly two row effects. The global-selected model would fan out to all
  // 1000 row subscriptions on every click.
  if (lastSelectedId === id) return
  const prev = rowById.get(lastSelectedId)
  if (prev?.selected) prev.selected = false
  const next = rowById.get(id)
  if (next) next.selected = true
  lastSelectedId = id
}

function remove(id: number) {
  data.value = data.value.filter((d: RowData) => d.id !== id)
  rowById.delete(id)
}

// ============================================================================
// Bind Button Events
// ============================================================================

document.getElementById('run')!.onclick = run
document.getElementById('runlots')!.onclick = runLots
document.getElementById('add')!.onclick = add
document.getElementById('update')!.onclick = update
document.getElementById('clear')!.onclick = clear
document.getElementById('swaprows')!.onclick = swapRows

// ============================================================================
// Row Component — JSX + @rasen-compile (static hoisting via compiler)
//
// Idiomatic declarative JSX; the vite plugin compiles this element tree into
// template-primitive calls (clone + baked navigation + exact-node wiring).
// ============================================================================

/** @rasen-compile */
function Row(item: RowData) {
  return (
    <tr class={item.selected ? 'danger' : ''}>
      <td class="col-md-1">{String(item.id)}</td>
      <td class="col-md-4">
        <a class="lbl" onClick={() => select(item.id)}>
          {item.label}
        </a>
      </td>
      <td class="col-md-1">
        <a class="remove" onClick={() => remove(item.id)}>
          <span class="remove glyphicon glyphicon-remove" aria-hidden="true" />
        </a>
      </td>
      <td class="col-md-6" />
    </tr>
  )
}

// ============================================================================
// Mount Table Body
// ============================================================================

const tbody = document.getElementById('tbody')!

mount(
  each(() => data.value, Row),
  tbody
)
