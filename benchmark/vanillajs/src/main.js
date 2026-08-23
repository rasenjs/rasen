/**
 * Native DOM (vanilla JS) implementation for js-framework-benchmark.
 * https://github.com/krausest/js-framework-benchmark
 *
 * Keyed manual DOM updates — the baseline "no framework" approach. The harness
 * drives it through the static button ids and inspects the rendered <tbody>.
 */

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

function random(max) {
  return Math.round(Math.random() * 1000) % max
}

let nextId = 1

function buildData(count) {
  const data = new Array(count)
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colours[random(colours.length)]} ${nouns[random(nouns.length)]}`
    }
  }
  return data
}

const tbody = document.getElementById('tbody')
let data = []
let selected = 0

function createRow(item) {
  const tr = document.createElement('tr')
  tr.setAttribute('data-id', String(item.id))
  if (selected === item.id) tr.className = 'danger'

  const tdId = document.createElement('td')
  tdId.className = 'col-md-1'
  tdId.textContent = String(item.id)

  const tdLabel = document.createElement('td')
  tdLabel.className = 'col-md-4'
  const aLabel = document.createElement('a')
  aLabel.className = 'lbl'
  aLabel.textContent = item.label
  aLabel.onclick = () => select(item.id)
  tdLabel.appendChild(aLabel)

  const tdRemove = document.createElement('td')
  tdRemove.className = 'col-md-1'
  const aRemove = document.createElement('a')
  aRemove.className = 'remove'
  const span = document.createElement('span')
  span.className = 'remove glyphicon glyphicon-remove'
  span.setAttribute('aria-hidden', 'true')
  aRemove.appendChild(span)
  aRemove.onclick = () => remove(item.id)
  tdRemove.appendChild(aRemove)

  const tdEmpty = document.createElement('td')
  tdEmpty.className = 'col-md-6'

  tr.appendChild(tdId)
  tr.appendChild(tdLabel)
  tr.appendChild(tdRemove)
  tr.appendChild(tdEmpty)
  return tr
}

function renderAll() {
  tbody.textContent = ''
  const frag = document.createDocumentFragment()
  for (let i = 0; i < data.length; i++) {
    frag.appendChild(createRow(data[i]))
  }
  tbody.appendChild(frag)
}

function run() {
  data = buildData(1000)
  selected = 0
  renderAll()
}

function runLots() {
  data = buildData(10000)
  selected = 0
  renderAll()
}

function add() {
  data = data.concat(buildData(1000))
  renderAll()
}

function update() {
  for (let i = 0; i < data.length; i += 10) {
    data[i] = { id: data[i].id, label: data[i].label + ' !!!' }
  }
  const rows = tbody.children
  for (let i = 0; i < rows.length; i += 10) {
    rows[i].children[1].firstChild.textContent = data[i].label
  }
}

function clear() {
  data = []
  selected = 0
  tbody.textContent = ''
}

function select(id) {
  const prev = tbody.querySelector('tr.danger')
  if (prev) prev.className = ''
  selected = id
  const row = tbody.querySelector(`tr[data-id="${id}"]`)
  if (row) row.className = 'danger'
}

function remove(id) {
  const idx = data.findIndex(d => d.id === id)
  if (idx === -1) return
  data.splice(idx, 1)
  tbody.removeChild(tbody.children[idx])
  if (selected === id) selected = 0
}

function swapRows() {
  if (data.length > 998) {
    const tmp = data[1]
    data[1] = data[998]
    data[998] = tmp
    const ci = tbody.children[1]
    const cj = tbody.children[998]
    const ciNext = ci.nextSibling
    const cjNext = cj.nextSibling
    if (ciNext === cj) {
      tbody.insertBefore(cj, ci)
    } else {
      tbody.insertBefore(cj, ci)
      tbody.insertBefore(ci, cjNext)
    }
  }
}

document.getElementById('run').onclick = run
document.getElementById('runlots').onclick = runLots
document.getElementById('add').onclick = add
document.getElementById('update').onclick = update
document.getElementById('clear').onclick = clear
document.getElementById('swaprows').onclick = swapRows
