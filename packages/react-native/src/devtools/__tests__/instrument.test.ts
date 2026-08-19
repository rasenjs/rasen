/**
 * @rasenjs/react-native — devtools instrumentation tests.
 *
 * Verifies node-tree serialization and render performance stats (pure logic,
 * no socket.io involved).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter } from '@rasenjs/rn-dom'
import {
  collectNodeTree,
  recordRender,
  collectPerf,
  resetPerf,
  countNodes,
  setDevtoolsHook,
  getDevtoolsHook,
} from '../instrument'
import { resetFabricMocks } from '../../__tests__/setup'

function createDoc(): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(1)
}

describe('node tree serialization', () => {
  it('serializes a simple element with props', () => {
    const doc = createDoc()
    const view = doc.createElement('View')
    view.setAttribute('testID', 'root')
    view.setAttribute('accessible', true)
    doc.body.appendChild(view)

    const tree = collectNodeTree(doc)
    expect(tree).toHaveLength(1)
    expect(tree[0].tag).toBe('View')
    expect(tree[0].testID).toBe('root')
    expect(tree[0].props.accessible).toBe(true)
  })

  it('serializes nested children', () => {
    const doc = createDoc()
    const view = doc.createElement('View')
    const text = doc.createElement('Text')
    text.setAttribute('testID', 'label')
    view.appendChild(text)
    doc.body.appendChild(view)

    const tree = collectNodeTree(doc)
    expect(tree[0].children).toHaveLength(1)
    expect(tree[0].children[0].tag).toBe('Text')
    expect(tree[0].children[0].testID).toBe('label')
  })

  it('summarizes style as its keys', () => {
    const doc = createDoc()
    const view = doc.createElement('View')
    view.style.setProperty('flex', 1)
    view.style.setProperty('backgroundColor', '#fff')
    doc.body.appendChild(view)

    const tree = collectNodeTree(doc)
    expect(tree[0].props.style).toEqual(['flex', 'backgroundColor'])
  })

  it('serializes text nodes with their content', () => {
    const doc = createDoc()
    const text = doc.createElement('Text')
    const textNode = doc.createTextNode('Hello')
    text.appendChild(textNode)
    doc.body.appendChild(text)

    const tree = collectNodeTree(doc)
    expect(tree[0].children[0].tag).toBe('#text')
    expect(tree[0].children[0].props.text).toBe('Hello')
  })

  it('counts all nodes in the tree', () => {
    const doc = createDoc()
    const view = doc.createElement('View')
    const a = doc.createElement('Text')
    const b = doc.createElement('Text')
    view.appendChild(a)
    view.appendChild(b)
    doc.body.appendChild(view)

    const tree = collectNodeTree(doc)
    expect(countNodes(tree)).toBe(3)
  })
})

describe('render performance stats', () => {
  beforeEach(() => {
    resetPerf()
  })

  it('records render counts and durations', () => {
    recordRender('View', 1.5)
    recordRender('View', 2.5)
    recordRender('Text', 0.5)

    const perf = collectPerf()
    const view = perf.find(s => s.tagName === 'View')
    const text = perf.find(s => s.tagName === 'Text')
    expect(view?.count).toBe(2)
    expect(view?.totalMs).toBeCloseTo(4)
    expect(view?.maxMs).toBeCloseTo(2.5)
    expect(text?.count).toBe(1)
  })

  it('sorts by total time descending', () => {
    recordRender('Slow', 10)
    recordRender('Fast', 1)
    const perf = collectPerf()
    expect(perf[0].tagName).toBe('Slow')
  })

  it('resetPerf clears the stats', () => {
    recordRender('View', 1)
    resetPerf()
    expect(collectPerf()).toHaveLength(0)
  })
})

describe('global hook', () => {
  it('set/get round-trips the hook', () => {
    const hook = { renderStart: () => {}, renderEnd: () => {} }
    setDevtoolsHook(hook)
    expect(getDevtoolsHook()).toBe(hook)
    setDevtoolsHook(null)
    expect(getDevtoolsHook()).toBeNull()
  })
})
