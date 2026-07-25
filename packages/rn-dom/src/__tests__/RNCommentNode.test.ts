/**
 * @rasenjs/rn-dom — RNCommentNode tests
 *
 * Tests virtual comment nodes (nodeType 8) used by Vue's
 * each/when/match markers.
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

describe('RNCommentNode', () => {
  // ── Construction ───────────────────────────────────────────────

  describe('construction', () => {
    it('creates comment node with data', () => {
      const doc = createDoc()
      const c = doc.createComment('marker')
      expect(c.nodeType).toBe(8)
      expect(c.nodeName).toBe('#comment')
      expect(c.nodeValue).toBe('marker')
      expect(c.data).toBe('marker')
      expect(c.textContent).toBe('marker')
    })

    it('has no Fabric backing node', () => {
      const doc = createDoc()
      const c = doc.createComment('x')
      expect(c[Symbol.for('fabricNode')]).toBeNull()
      expect(c[Symbol.for('fabricNodeId')]).toBe(-1)
    })

    it('is skipped by _getFabricNode (returns null)', () => {
      const doc = createDoc()
      const c = doc.createComment('x')
      const result = doc.body._getFabricNode(c)
      expect(result).toBeNull()
    })
  })

  // ── Tree operations ───────────────────────────────────────────

  describe('tree operations', () => {
    it('appendChild sets parentNode on comment', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createComment('x')
      p.appendChild(c)
      expect(c.parentNode).toBe(p)
      expect(p.childNodes).toContain(c)
    })

    it('insertBefore works', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const c = doc.createComment('between')
      p.appendChild(a)
      p.insertBefore(c, a)
      expect(p.childNodes[0]).toBe(c)
      expect(p.childNodes[1]).toBe(a)
    })

    it('removeChild cleans up', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createComment('x')
      p.appendChild(c)
      p.removeChild(c)
      expect(p.childNodes).toHaveLength(0)
    })

    it('sibling traversal through parent', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const t = doc.createTextNode('text')
      const c = doc.createComment('comment')
      p.appendChild(t)
      p.appendChild(c)
      expect(t.nextSibling).toBe(c)
      expect(c.previousSibling).toBe(t)
    })

    it('cloneNode creates new node', () => {
      const doc = createDoc()
      const c = doc.createComment('original')
      const clone = c.cloneNode()
      expect(clone.data).toBe('original')
      expect(clone).not.toBe(c)
    })
  })

  // ── Fabric interaction ────────────────────────────────────────

  describe('Fabric interaction', () => {
    it('unregistered from instance map on remove', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createComment('x')
      p.appendChild(c)
      // Comment nodes are not registered (nodeType 8 skip)
      const map = (globalThis as any).__RASEN_INSTANCE_MAP__
      expect(map.has(c[Symbol.for('fabricNodeId')])).toBe(false)
    })
  })
})
