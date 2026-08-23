/**
 * Rasen implementation for js-framework-benchmark
 * https://github.com/krausest/js-framework-benchmark
 */

import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref } from '@rasenjs/reactive-vue'
import { mount, each } from '@rasenjs/dom'

// Initialize reactive runtime with Vue reactivity
const runtime = createReactiveRuntime()
setReactiveRuntime(runtime)

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
const selected = ref<number>(0)

// ============================================================================
// Actions
// ============================================================================

function run() {
  data.value = buildData(1000)
  selected.value = 0
}

function runLots() {
  data.value = buildData(10000)
  selected.value = 0
}

function add() {
  // Reassign to a new array so the single-subscription `each` re-runs.
  // Mutating in place (data.value.push) would not notify the watcher.
  data.value = [...data.value, ...buildData(1000)]
}

function update() {
  const d = data.value
  for (let i = 0; i < d.length; i += 10) {
    // Create a new object so the keyed `each` patches only this row.
    d[i] = { ...d[i], label: d[i].label + ' !!!' }
  }
  // Reassign to a new array reference to trigger the watcher.
  data.value = [...d]
}

function clear() {
  data.value = []
  selected.value = 0
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
  selected.value = id
}

function remove(id: number) {
  data.value = data.value.filter((d: RowData) => d.id !== id)
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
    <tr class={selected.value === item.id ? 'danger' : ''}>
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
