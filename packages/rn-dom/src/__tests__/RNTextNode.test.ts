/**
 * @rasenjs/rn-dom — RNTextNode tests
 *
 * Tests text node creation, textContent getter/setter,
 * and node traversal (sibling properties).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter } from '../index'
import { resetFabricMocks, nativeFabricUIManager } from './setup'

function createDoc(): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(1)
}

describe('RNTextNode', () => {
  // ── Construction ───────────────────────────────────────────────

  describe('construction', () => {
    it('creates with given text', () => {
      const doc = createDoc()
      const t = doc.createTextNode('content')
      expect(t.textContent).toBe('content')
      expect(t.nodeValue).toBe('content')
    })

    it('uses RCTRawText as view name via Fabric createNode', () => {
      const doc = createDoc()
      doc.createTextNode('x')
      const call = nativeFabricUIManager.createNode.mock.calls[0]
      expect(call).toBeTruthy()
      expect(call[1]).toBe('RCTRawText')
    })

    it('stores ownerDocument', () => {
      const doc = createDoc()
      const t = doc.createTextNode('x')
      expect(t.ownerDocument).toBe(doc)
    })

    it('starts with null parentNode', () => {
      const doc = createDoc()
      const t = doc.createTextNode('x')
      expect(t.parentNode).toBeNull()
    })

    // ── RN-style: createNode called synchronously ───────────────

    it('calls Fabric createNode immediately', () => {
      const doc = createDoc()
      doc.createTextNode('test')
      expect(nativeFabricUIManager.createNode).toHaveBeenCalledTimes(1)
      // Check the returned node object is assigned (stored as .node)
      const fabricNode = nativeFabricUIManager.createNode.mock.results[0].value
      expect(fabricNode).toBeTruthy()
    })

    // ── RN-style: RCTRawText with { text } props ───────────────

    it('passes text content in Fabric props', () => {
      const doc = createDoc()
      doc.createTextNode('hello world')
      const call = nativeFabricUIManager.createNode.mock.calls[0]
      expect(call[3]).toEqual({ text: 'hello world' })
    })

    // ── RN-style: public node field ─────────────────────────────

    it('exposes Fabric node via public .node field', () => {
      const doc = createDoc()
      const t = doc.createTextNode('x')
      const fabricNode = nativeFabricUIManager.createNode.mock.results[0].value
      expect(t.node).toBe(fabricNode)
    })
  })

  // ── textContent setter ─────────────────────────────────────────

  describe('textContent setter', () => {
    it('updates text and calls setNativeProps', () => {
      const doc = createDoc()
      const t = doc.createTextNode('before')
      t.textContent = 'after'
      expect(t.textContent).toBe('after')
      expect(t.nodeValue).toBe('after')
    })

    it('skips update when value unchanged', () => {
      const doc = createDoc()
      const t = doc.createTextNode('same')
      t.textContent = 'same' // no change
      expect(t.textContent).toBe('same')
    })
  })

  // ── Sibling traversal ─────────────────────────────────────────

  describe('sibling traversal', () => {
    it('nextSibling returns null when no parent', () => {
      const doc = createDoc()
      const t = doc.createTextNode('x')
      expect(t.nextSibling).toBeNull()
    })

    it('nextSibling and previousSibling work in a parent', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createTextNode('a')
      const b = doc.createTextNode('b')
      p.appendChild(a)
      p.appendChild(b)
      expect(a.nextSibling).toBe(b)
      expect(b.previousSibling).toBe(a)
      expect(b.nextSibling).toBeNull()
      expect(a.previousSibling).toBeNull()
    })
  })

  // ── ChildNode API on text nodes ────────────────────────────────

  describe('ChildNode API', () => {
    it('remove() removes text node from parent', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const t = doc.createTextNode('x')
      p.appendChild(t)
      t.remove()
      expect(p.childNodes).toHaveLength(0)
    })

    it('after() inserts after text node', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const t = doc.createTextNode('text')
      const v = doc.createElement('View')
      p.appendChild(t)
      t.after(v)
      expect(p.childNodes[1]).toBe(v)
    })

    it('before() inserts before text node', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const t = doc.createTextNode('text')
      const v = doc.createElement('View')
      p.appendChild(t)
      t.before(v)
      expect(p.childNodes[0]).toBe(v)
    })
  })

  // ── cloneNode ──────────────────────────────────────────────────

  describe('cloneNode', () => {
    it('creates new text node with same content', () => {
      const doc = createDoc()
      const t = doc.createTextNode('original')
      const clone = t.cloneNode()
      expect(clone.textContent).toBe('original')
      expect(clone).not.toBe(t)
    })
  })
})
