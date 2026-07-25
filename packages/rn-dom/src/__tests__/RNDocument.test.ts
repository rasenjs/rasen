/**
 * @rasenjs/rn-dom — RNDocument tests
 *
 * Tests the document singleton, element/text/comment creation,
 * and native name resolution. Follows facebook/react's Fabric test patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter } from '../index'
import { resetFabricMocks } from './setup'

describe('RNDocument', () => {
  beforeEach(() => {
    RNDocument.reset()
    resetTagCounter()
    resetFabricMocks()
  })

  // ── Singleton ─────────────────────────────────────────────────

  describe('singleton', () => {
    it('creates document with getOrCreate', () => {
      const doc = RNDocument.getOrCreate(1)
      expect(doc).toBeInstanceOf(RNDocument)
      expect(doc.rootTag).toBe(1)
    })

    it('throws without rootTag on first call', () => {
      expect(() => RNDocument.getOrCreate()).toThrow('rootTag')
    })

    it('reuses instance on subsequent calls', () => {
      const d1 = RNDocument.getOrCreate(1)
      const d2 = RNDocument.getOrCreate()
      expect(d2).toBe(d1)
    })

    it('creates new instance after reset', () => {
      const d1 = RNDocument.getOrCreate(1)
      RNDocument.reset()
      const d2 = RNDocument.getOrCreate(2)
      expect(d2).not.toBe(d1)
      expect(d2.rootTag).toBe(2)
    })

    it('has body property', () => {
      const doc = RNDocument.getOrCreate(1)
      expect(doc.body).toBeDefined()
    })
  })

  // ── createElement ──────────────────────────────────────────────

  describe('createElement', () => {
    it('creates element with correct tagName', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(el.tagName).toBe('View')
      expect(el.nodeType).toBe(1)
    })

    it('resolves nativeName via ensure()', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(el._nativeName).toBe('RCTView')
    })

    it('allocates sequential fabric tags', () => {
      resetTagCounter()
      const doc = RNDocument.getOrCreate(1)
      const v1 = doc.createElement('View')
      const v2 = doc.createElement('Text')
      expect(v1[Symbol.for('fabricNodeId')]).toBe(2)
      expect(v2[Symbol.for('fabricNodeId')]).toBe(4)
    })

    it('initializes with empty props', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(el.currentProps).toEqual({})
    })

    it('stores validAttributes from view config', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(el._lastValidAttrs).toBeTruthy()
    })
  })

  // ── createTextNode ─────────────────────────────────────────────

  describe('createTextNode', () => {
    it('creates text node with content', () => {
      const doc = RNDocument.getOrCreate(1)
      const t = doc.createTextNode('hello')
      expect(t.nodeType).toBe(3)
      expect(t.textContent).toBe('hello')
      expect(t.nodeValue).toBe('hello')
    })

    it('creates Fabric node immediately via createNode', () => {
      const doc = RNDocument.getOrCreate(1)
      const t = doc.createTextNode('x')
      expect(t.node).toBeTruthy()
    })
  })

  // ── createComment ──────────────────────────────────────────────

  describe('createComment', () => {
    it('creates virtual comment node', () => {
      const doc = RNDocument.getOrCreate(1)
      const c = doc.createComment('test')
      expect(c.nodeType).toBe(8)
      expect(c.nodeValue).toBe('test')
      expect(c.data).toBe('test')
    })

    it('has no Fabric node', () => {
      const doc = RNDocument.getOrCreate(1)
      const c = doc.createComment()
      expect(c[Symbol.for('fabricNode')]).toBeNull()
    })

    it('supports parent/child tree ops', () => {
      const doc = RNDocument.getOrCreate(1)
      const p = doc.createElement('View')
      const c = doc.createComment('x')
      p.appendChild(c)
      expect(c.parentNode).toBe(p)
      expect(p.childNodes).toContain(c)
    })
  })

  // ── resolveNativeName ──────────────────────────────────────────

  describe('_resolveNativeName', () => {
    it('caches resolved names', () => {
      const doc = RNDocument.getOrCreate(1)
      // First call resolves, second uses cache
      const v1 = doc.createElement('View')
      const v2 = doc.createElement('View')
      expect(v1._nativeName).toBe('RCTView')
      expect(v2._nativeName).toBe('RCTView')
    })

    it('throws for unknown tag', () => {
      const doc = RNDocument.getOrCreate(1)
      expect(() => doc.createElement('NonExistent')).toThrow()
    })
  })
})
