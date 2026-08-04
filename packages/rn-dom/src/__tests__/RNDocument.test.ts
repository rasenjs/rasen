/**
 * @rasenjs/rn-dom — RNDocument tests
 *
 * Tests the document singleton, element/text/comment creation,
 * and native name resolution. Follows facebook/react's Fabric test patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter } from '../index'
import { resetFabricMocks } from './setup'
import { FABRIC_NODE, FABRIC_NODE_ID, type RNDomInternalNode } from '../node'

const internal = <T,>(node: T): RNDomInternalNode => node as unknown as RNDomInternalNode

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
      expect(internal(el).__RN_nativeName).toBe('RCTView')
    })

    it('allocates sequential fabric tags', () => {
      resetTagCounter()
      const doc = RNDocument.getOrCreate(1)
      const v1 = doc.createElement('View')
      const v2 = doc.createElement('Text')
      expect(internal(v1)[FABRIC_NODE_ID]).toBe(2)
      expect(internal(v2)[FABRIC_NODE_ID]).toBe(4)
    })

    it('initializes with empty props', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(internal(el).__RN_currentProps).toEqual({})
    })

    it('stores validAttributes from view config', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      expect(internal(el).__RN_lastValidAttrs).toBeTruthy()
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
      expect(internal(c)[FABRIC_NODE]).toBeNull()
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

  // ── __RN_resolveNativeName ──────────────────────────────────────────

  describe('___RN_resolveNativeName', () => {
    it('caches resolved names', () => {
      const doc = RNDocument.getOrCreate(1)
      // First call resolves, second uses cache
      const v1 = doc.createElement('View')
      const v2 = doc.createElement('View')
      expect(internal(v1).__RN_nativeName).toBe('RCTView')
      expect(internal(v2).__RN_nativeName).toBe('RCTView')
    })

    it('throws for unknown tag', () => {
      const doc = RNDocument.getOrCreate(1)
      expect(() => doc.createElement('NonExistent')).toThrow()
    })
  })

  // ── Extensible (Vue host compatibility) ────────────────────────

  describe('extensible nodes (Vue host compat)', () => {
    it('element / text / comment / fragment / body are extensible', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      const text = doc.createTextNode('x')
      const comment = doc.createComment()
      const frag = doc.createDocumentFragment()
      expect(Object.isExtensible(el)).toBe(true)
      expect(Object.isExtensible(text)).toBe(true)
      expect(Object.isExtensible(comment)).toBe(true)
      expect(Object.isExtensible(frag)).toBe(true)
      expect(Object.isExtensible(doc.body)).toBe(true)
    })

    it('host 可挂运行时字段(如 Vue __vnode),内部状态可改', () => {
      const doc = RNDocument.getOrCreate(1)
      const el = doc.createElement('View')
      doc.body.appendChild(el)
      // Vue 渲染器会把 __vnode 挂到宿主元素(defineProperty 新增属性)。
      ;(el as unknown as Record<string, unknown>).__vnode = { some: 'vnode' }
      expect((el as unknown as Record<string, unknown>).__vnode).toEqual({ some: 'vnode' })
      // 内部状态仍可改。
      internal(el).__RN_mounted = true
      expect(internal(el).__RN_mounted).toBe(true)
    })
  })
})
