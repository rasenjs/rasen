/**
 * Native DOM (vanilla JS) implementation for js-framework-benchmark.
 * https://github.com/krausest/js-framework-benchmark
 *
 * Aligned 1:1 with the OFFICIAL keyed/vanillajs implementation
 * (frameworks/keyed/vanillajs/src/Main.js): cloned <tr> template rows,
 * parallel rows[] array with a cached selectedRow, the detached-tbody append
 * loop, and event delegation. The baseline must be exactly as fast as the
 * official one — every difference here shifts ALL framework multipliers.
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

// Official keyed/vanillajs builds every row by cloning this template — much
// faster than assembling each row from individual createElement calls.
const rowTemplate = document.createElement('tr')
rowTemplate.innerHTML =
  "<td class='col-md-1'> </td>" +
  "<td class='col-md-4'><a> </a></td>" +
  "<td class='col-md-1'><a><span class='glyphicon glyphicon-remove' aria-hidden='true'></span></a></td>" +
  "<td class='col-md-6'></td>"

const tbody = document.getElementById('tbody')
const table = document.getElementsByTagName('table')[0]
let data = []
let rows = []
let selectedRow = undefined
let selectedId = null

function getParentId(elem) {
  while (elem) {
    if (elem.tagName === 'TR') return elem.data_id
    elem = elem.parentNode
  }
  return undefined
}

function findIdx(id) {
  for (let i = 0; i < data.length; i++) {
    if (data[i].id === id) return i
  }
  return undefined
}

function unselect() {
  if (selectedRow !== undefined) {
    selectedRow.className = ''
    selectedRow = undefined
  }
}

function select(idx) {
  unselect()
  selectedId = data[idx].id
  selectedRow = rows[idx]
  selectedRow.className = 'danger'
}

// Official behavior: unselect, remove, then re-select the previously selected
// id at its new position (the highlight follows the row).
function deleteIdx(idx) {
  data.splice(idx, 1)
  rows[idx].remove()
  rows.splice(idx, 1)
  unselect()
  const selIdx = data.findIndex(d => d.id === selectedId)
  if (selIdx >= 0) {
    selectedRow = rows[selIdx]
    selectedRow.className = 'danger'
  } else {
    selectedId = null
  }
}

function createRow(item) {
  const tr = rowTemplate.cloneNode(true)
  tr.data_id = item.id
  tr.firstChild.firstChild.nodeValue = item.id
  tr.childNodes[1].childNodes[0].firstChild.nodeValue = item.label
  return tr
}

function removeAllRows() {
  tbody.textContent = ''
}

// Official appendRows idiom: when tbody is empty, detach it first so the
// append loop works on a detached node, then re-insert. The official
// implementation measured this as faster than a document fragment.
function appendRows() {
  const empty = !tbody.firstChild
  if (empty) tbody.remove()
  for (let i = rows.length; i < data.length; i++) {
    const tr = createRow(data[i])
    rows[i] = tr
    tbody.appendChild(tr)
  }
  if (empty) table.insertBefore(tbody, null)
}

function run() {
  removeAllRows()
  rows = []
  data = buildData(1000)
  selectedId = null
  appendRows()
  unselect()
}

function runLots() {
  removeAllRows()
  rows = []
  data = buildData(10000)
  selectedId = null
  appendRows()
  unselect()
}

function add() {
  data = data.concat(buildData(1000))
  appendRows()
}

function update() {
  for (let i = 0; i < data.length; i += 10) {
    data[i].label += ' !!!'
  }
  for (let i = 0; i < data.length; i += 10) {
    rows[i].childNodes[1].childNodes[0].firstChild.nodeValue = data[i].label
  }
}

function clear() {
  data = []
  rows = []
  selectedId = null
  removeAllRows()
  unselect()
}

function swapRows() {
  if (data.length > 998) {
    const tmp = data[1]
    data[1] = data[998]
    data[998] = tmp
    tbody.insertBefore(rows[998], rows[2])
    tbody.insertBefore(rows[1], rows[999])
    const rtmp = rows[998]
    rows[998] = rows[1]
    rows[1] = rtmp
  }
}

document.getElementById('main').addEventListener('click', (e) => {
  switch (e.target.id) {
    case 'run': run(); break
    case 'runlots': runLots(); break
    case 'add': add(); break
    case 'update': update(); break
    case 'clear': clear(); break
    case 'swaprows': swapRows(); break
  }
})

tbody.addEventListener('click', (e) => {
  let p = e.target
  while (p && p.tagName !== 'TD') p = p.parentNode
  if (!p) return
  const idx = findIdx(getParentId(e.target))
  if (idx === undefined) return
  if (p.parentNode.childNodes[1] === p) select(idx)
  else if (p.parentNode.childNodes[2] === p) deleteIdx(idx)
})
