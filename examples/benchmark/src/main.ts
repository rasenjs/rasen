/**
 * Rasen implementation for js-framework-benchmark
 * https://github.com/krausest/js-framework-benchmark
 */

import { setReactiveRuntime, each } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'
import { ref, shallowRef, watch } from 'vue'
import { mount } from '@rasenjs/dom'

// Initialize reactive runtime
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

const data = shallowRef<RowData[]>([])
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
  data.value = [...data.value, ...buildData(1000)]
}

function update() {
  const d = data.value
  for (let i = 0; i < d.length; i += 10) {
    d[i].label += ' !!!'
  }
  // Trigger update by reassigning
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
    data.value = [...d]
  }
}

function select(id: number) {
  selected.value = id
}

function remove(id: number) {
  data.value = data.value.filter(d => d.id !== id)
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
// Row Component
// ============================================================================

function Row(item: RowData, _index: number) {
  // Setup phase
  const row = document.createElement('tr')
  
  // Mount phase
  return (host: HTMLElement) => {
    // Create static structure
    const td1 = document.createElement('td')
    td1.className = 'col-md-1'
    td1.textContent = String(item.id)
    
    const td2 = document.createElement('td')
    td2.className = 'col-md-4'
    const a = document.createElement('a')
    a.className = 'lbl'
    a.textContent = item.label
    a.onclick = () => select(item.id)
    td2.appendChild(a)
    
    const td3 = document.createElement('td')
    td3.className = 'col-md-1'
    const aDelete = document.createElement('a')
    aDelete.className = 'remove'
    const span = document.createElement('span')
    span.className = 'remove glyphicon glyphicon-remove'
    span.setAttribute('aria-hidden', 'true')
    aDelete.appendChild(span)
    aDelete.onclick = () => remove(item.id)
    td3.appendChild(aDelete)
    
    const td4 = document.createElement('td')
    td4.className = 'col-md-6'
    
    row.appendChild(td1)
    row.appendChild(td2)
    row.appendChild(td3)
    row.appendChild(td4)
    
    // Watch for selection changes
    const updateClass = () => {
      row.className = selected.value === item.id ? 'danger' : ''
    }
    updateClass()
    
    // Create a reactive effect for selection
    const stopWatch = watch(() => selected.value, updateClass)
    
    host.appendChild(row)
    
    // Unmount
    return () => {
      stopWatch()
      row.remove()
    }
  }
}

// ============================================================================
// Mount Table Body
// ============================================================================

const tbody = document.getElementById('tbody')!

mount(
  each(() => data.value, Row),
  tbody
)
