/**
 * Rasen (alien-signals) implementation for js-framework-benchmark
 * https://github.com/krausest/js-framework-benchmark
 *
 * Identical to benchmark/rasen except the reactive runtime:
 * @rasenjs/reactive-alien-signals backs refs with raw alien-signals
 * callables, so state is read with `data()` and written with `data(next)`
 * instead of `.value`.
 */

import { setReactiveRuntime } from '@rasenjs/core'
import { createReactiveRuntime, ref } from '@rasenjs/reactive-alien-signals'
import { signal } from 'alien-signals'
import { mount, each } from '@rasenjs/dom'

// Initialize reactive runtime with alien-signals
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

/** Per-row label cell: a raw alien-signals callable (read `label()`, write `label(v)`). */
type LabelSignal = { (): string; (value: string): void }

interface RowData {
  id: number
  label: LabelSignal
}

function buildData(count: number): RowData[] {
  const data: RowData[] = []
  for (let i = 0; i < count; i++) {
    data.push({
      id: nextId++,
      label: signal(
        `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`
      )
    })
  }
  return data
}

// ============================================================================
// State — refs are raw alien-signals callables (read `data()`, write `data(v)`)
// ============================================================================

const data = ref<RowData[]>([])
const selected = ref<number>(0)

// ============================================================================
// Actions
// ============================================================================

function run() {
  data(buildData(1000))
  selected(0)
}

function runLots() {
  data(buildData(10000))
  selected(0)
}

function add() {
  // Reassign to a new array so the single-subscription `each` re-runs.
  // Mutating in place would not notify the watcher.
  data([...data(), ...buildData(1000)])
}

function update() {
  const d = data()
  // In-place item mutation with per-row label signals — object references
  // stay identical (the list diff is a no-op) and each row's label signal
  // patches just its own text node.
  for (let i = 0; i < d.length; i += 10) {
    d[i].label(d[i].label() + ' !!!')
  }
}

function clear() {
  data([])
  selected(0)
}

function swapRows() {
  const d = data()
  if (d.length > 998) {
    const tmp = d[1]
    d[1] = d[998]
    d[998] = tmp
    // Reassign a fresh array so reactivity notifies subscribers.
    data([...d])
  }
}

function select(id: number) {
  selected(id)
}

function remove(id: number) {
  data(data().filter((d: RowData) => d.id !== id))
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
    <tr class={selected() === item.id ? 'danger' : ''}>
      <td class="col-md-1">{String(item.id)}</td>
      <td class="col-md-4">
        <a class="lbl" onClick={() => select(item.id)}>
          {item.label()}
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
  each(() => data(), Row),
  tbody
)
