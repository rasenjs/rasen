/**
 * @rasenjs/rn-dom — RNNode tests
 *
 * Tests the DOM-like element API: attributes, children management,
 * tree traversal, textContent, cloneNode, and style operations.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Platform } from 'react-native'
import { RNDocument, resetTagCounter, type RNNode } from '../index'
import { resetFabricMocks } from './setup'

function createDoc(rootTag = 1): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(rootTag)
}

describe('RNNode', () => {
  // ── Attribute API ──────────────────────────────────────────────

  describe('setAttribute / getAttribute / removeAttribute', () => {
    it('sets and gets attributes', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.setAttribute('testID', 'my-view')
      expect(el.getAttribute('testID')).toBe('my-view')
    })

    it('checks attribute existence', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.setAttribute('foo', 'bar')
      expect(el.hasAttribute('foo')).toBe(true)
      expect(el.hasAttribute('none')).toBe(false)
    })

    it('removes attributes', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.setAttribute('foo', 'bar')
      el.removeAttribute('foo')
      expect(el.hasAttribute('foo')).toBe(false)
    })

    it('stores in currentProps', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.setAttribute('onTouchEnd', vi.fn())
      expect(typeof el.currentProps.onTouchEnd).toBe('function')
    })

    it('marks dirty only when mounted', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const spy = vi.spyOn(el as any, '_markDirty')
      el.setAttribute('foo', 'bar')
      expect(spy).not.toHaveBeenCalled() // not mounted yet
      spy.mockRestore()
    })
  })

  // ── appendChild / removeChild ──────────────────────────────────

  describe('appendChild / removeChild', () => {
    it('appends a child', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      expect(c.parentNode).toBe(p)
      expect(p.childNodes).toHaveLength(1)
      expect(p.childNodes[0]).toBe(c)
    })

    it('removes a child', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      p.removeChild(c)
      expect(c.parentNode).toBeNull()
      expect(p.childNodes).toHaveLength(0)
    })

    it('removes child only if present', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      // Should not throw
      p.removeChild(c)
    })

    it('supports multiple children', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createElement('Text'))
      p.appendChild(doc.createElement('Image'))
      p.appendChild(doc.createElement('ScrollView'))
      expect(p.childNodes).toHaveLength(3)
      expect(p.childElementCount).toBe(3)
    })
  })

  // ── insertBefore ───────────────────────────────────────────────

  describe('insertBefore', () => {
    it('inserts before a reference child', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      p.insertBefore(b, a)
      expect(p.childNodes[0]).toBe(b)
      expect(p.childNodes[1]).toBe(a)
    })

    it('appends when ref is null', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      p.insertBefore(b, null)
      expect(p.childNodes[p.childNodes.length - 1]).toBe(b)
    })

    it('appends when ref not found', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      const orphan = doc.createElement('View')
      p.insertBefore(b, orphan) // orphan not in children
      expect(p.childNodes).toHaveLength(2)
    })
  })

  // ── replaceChild ───────────────────────────────────────────────

  describe('replaceChild', () => {
    it('replaces old child with new', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const old = doc.createElement('Text')
      const nw = doc.createElement('Image')
      p.appendChild(old)
      p.replaceChild(nw, old)
      expect(p.childNodes[0]).toBe(nw)
      expect(old.parentNode).toBeNull()
    })

    it('does nothing if old child absent', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.replaceChild(doc.createElement('Text'), doc.createElement('Text'))
      expect(p.childNodes).toHaveLength(0)
    })
  })

  // ── children / childNodes / childElementCount ──────────────────

  describe('children accessors', () => {
    it('childNodes includes all node types', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createElement('Text'))
      p.appendChild(doc.createTextNode('hello'))
      p.appendChild(doc.createComment('x'))
      expect(p.childNodes).toHaveLength(3)
    })

    it('children filters to only elements', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createElement('Text'))
      p.appendChild(doc.createTextNode('hello'))
      p.appendChild(doc.createComment('x'))
      expect(p.children).toHaveLength(1)
      expect(p.children[0].tagName).toBe('Text')
    })
  })

  // ── firstChild / lastChild ─────────────────────────────────────

  describe('firstChild / lastChild', () => {
    it('returns null when empty', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      expect(p.firstChild).toBeNull()
      expect(p.lastChild).toBeNull()
    })

    it('returns first and last child', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      p.appendChild(b)
      expect(p.firstChild).toBe(a)
      expect(p.lastChild).toBe(b)
    })
  })

  // ── nextSibling / previousSibling ──────────────────────────────

  describe('nextSibling / previousSibling', () => {
    it('traverses siblings correctly', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      const c = doc.createElement('ScrollView')
      p.appendChild(a)
      p.appendChild(b)
      p.appendChild(c)
      expect(a.nextSibling).toBe(b)
      expect(b.nextSibling).toBe(c)
      expect(c.nextSibling).toBeNull()
      expect(b.previousSibling).toBe(a)
      expect(a.previousSibling).toBeNull()
    })
  })

  // ── textContent ────────────────────────────────────────────────

  describe('textContent', () => {
    it('returns concatenated text', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createTextNode('Hello'))
      p.appendChild(doc.createTextNode(' '))
      p.appendChild(doc.createTextNode('World'))
      expect(p.textContent).toBe('Hello World')
    })

    it('sets text by replacing children', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createElement('Text'))
      p.textContent = 'new text'
      expect(p.childNodes).toHaveLength(1)
      expect((p.childNodes[0] as any).textContent).toBe('new text')
    })

    it('clears children when set to empty string', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createTextNode('x'))
      p.textContent = ''
      expect(p.childNodes).toHaveLength(0)
    })
  })

  // ── isConnected / contains ─────────────────────────────────────

  describe('isConnected / contains', () => {
    it('isConnected false when not in tree', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(el.isConnected).toBe(false)
    })

    it('isConnected true when in body tree', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      doc.body.appendChild(el)
      expect(el.isConnected).toBe(true)
    })

    it('contains checks descendants', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      expect(p.contains(c)).toBe(true)
      expect(p.contains(p)).toBe(true)
      expect(p.contains(doc.createElement('View'))).toBe(false)
    })
  })

  // ── cloneNode ──────────────────────────────────────────────────

  describe('cloneNode', () => {
    it('clones shallow without children', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.setAttribute('foo', 'bar')
      const clone = el.cloneNode(false)
      expect(clone.tagName).toBe('View')
      expect(clone.getAttribute('foo')).toBe('bar')
      expect(clone.childNodes).toHaveLength(0)
    })

    it('deep clone copies children', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createElement('Text'))
      const clone = p.cloneNode(true)
      expect(clone.childNodes).toHaveLength(1)
    })
  })

  // ── Style API ──────────────────────────────────────────────────

  describe('style API', () => {
    it('setProperty adds style', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.style.setProperty('color', 'red')
      expect(el.currentProps.style).toEqual({ color: 'red' })
    })

    it('removeProperty deletes style', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.style.setProperty('color', 'red')
      el.style.removeProperty('color')
      expect(el.currentProps.style).toEqual({})
    })

    it('getPropertyValue returns style value', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.style.setProperty('color', 'red')
      expect(el.style.getPropertyValue('color')).toBe('red')
    })

    it('replaces style on setProperty', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.style.setProperty('color', 'red')
      el.style.setProperty('color', 'blue')
      expect(el.style.getPropertyValue('color')).toBe('blue')
    })

    it('removeProperty does nothing for absent key', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(() => el.style.removeProperty('nonexistent')).not.toThrow()
    })
  })

  // ── Event Listener API ─────────────────────────────────────────

  describe('addEventListener / dispatchEvent', () => {
    it('adds and invokes event listener', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).toHaveBeenCalled()
    })

    it('removes event listener', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn)
      el.removeEventListener('click', fn)
      el.dispatchEvent(new Event('click'))
      expect(fn).not.toHaveBeenCalled()
    })

    it('stores capture listeners separately', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const fn = vi.fn()
      el.addEventListener('click', fn, { capture: true })
      // capture listeners are stored under __capture_{type} key
      expect(el._listeners!.get('__capture_click')).toBeTruthy()
      expect(el._listeners!.get('__capture_click')!.has(fn)).toBe(true)
    })

    it('defaultPrevented works with cancelable event', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const ev = new Event('click', { cancelable: true })
      const fn = vi.fn((e: Event) => e.preventDefault())
      el.addEventListener('click', fn)
      el.dispatchEvent(ev)
      expect(ev.defaultPrevented).toBe(true)
    })
  })

  // ── Dirty flag propagation ─────────────────────────────────────

  describe('dirty flags', () => {
    it('starts clean', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(el._propsDirty).toBe(false)
      expect(el._childrenDirty).toBe(false)
      expect(el._hasPropsChanged()).toBe(false)
    })

    it('setAttribute on mounted node marks props dirty', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el._mounted = true
      el.setAttribute('foo', 'bar')
      expect(el._propsDirty).toBe(true)
      expect(el._dirtyPropsCount).toBeGreaterThan(0)
    })

    it('appendChild on mounted node marks children dirty', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el._mounted = true
      el.appendChild(doc.createElement('Text'))
      expect(el._childrenDirty).toBe(true)
    })

    it('removeChild on mounted node marks children dirty', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      const c = doc.createElement('Text')
      el.appendChild(c)
      el._mounted = true
      el._childrenDirty = false
      el.removeChild(c)
      expect(el._childrenDirty).toBe(true)
    })

    it('textContent setter adds single text node', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.textContent = 'hello'
      expect(el.childNodes).toHaveLength(1)
      expect(el.childNodes[0].nodeType).toBe(3)
    })
  })

  // ── DOM ChildNode API ─────────────────────────────────────────

  describe('ChildNode API', () => {
    it('remove() removes self from parent', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const c = doc.createElement('Text')
      p.appendChild(c)
      c.remove()
      expect(p.childNodes).toHaveLength(0)
      expect(c.parentNode).toBeNull()
    })

    it('after() inserts after self', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      a.after(b)
      expect(p.childNodes[0]).toBe(a)
      expect(p.childNodes[1]).toBe(b)
    })

    it('before() inserts before self', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      a.before(b)
      expect(p.childNodes[0]).toBe(b)
      expect(p.childNodes[1]).toBe(a)
    })

    it('replaceWith() replaces self', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      a.replaceWith(b)
      expect(p.childNodes[0]).toBe(b)
      expect(a.parentNode).toBeNull()
    })
  })

  // ── DOM ParentNode API ────────────────────────────────────────

  describe('ParentNode API', () => {
    it('append() adds multiple children', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.append(a, b)
      expect(p.childNodes).toHaveLength(2)
      expect(p.childNodes[0]).toBe(a)
      expect(p.childNodes[1]).toBe(b)
    })

    it('prepend() adds at the beginning', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      const a = doc.createElement('Text')
      const b = doc.createElement('Image')
      p.appendChild(a)
      p.prepend(b)
      expect(p.childNodes[0]).toBe(b)
      expect(p.childNodes[1]).toBe(a)
    })
  })

  // ── normalize ─────────────────────────────────────────────────

  describe('normalize', () => {
    it('merges adjacent text nodes', () => {
      const doc = createDoc()
      const p = doc.createElement('View')
      p.appendChild(doc.createTextNode('Hello '))
      p.appendChild(doc.createTextNode('World'))
      p.normalize()
      expect(p.childNodes).toHaveLength(1)
      expect((p.childNodes[0] as any).textContent).toBe('Hello World')
    })
  })

  // ── classList ──────────────────────────────────────────────────

  describe('classList', () => {
    it('starts empty', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(el.classList.length).toBe(0)
      expect(el.className).toBe('')
    })

    it('add() and contains() work', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('card')
      expect(el.classList.contains('card')).toBe(true)
      expect(el.classList.length).toBe(1)
    })

    it('remove() works', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('card', 'elevated')
      el.classList.remove('card')
      expect(el.classList.contains('card')).toBe(false)
      expect(el.classList.contains('elevated')).toBe(true)
    })

    it('toggle() works', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('card')
      el.classList.toggle('card')
      expect(el.classList.contains('card')).toBe(false)
      el.classList.toggle('card')
      expect(el.classList.contains('card')).toBe(true)
    })

    it('toggle(force) works', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.toggle('card', false)
      expect(el.classList.contains('card')).toBe(false)
      el.classList.toggle('card', true)
      expect(el.classList.contains('card')).toBe(true)
    })

    it('className getter returns space-separated string', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('card', 'elevated')
      expect(el.className).toBe('card elevated')
    })

    it('className setter parses space-separated string', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.className = 'card elevated'
      expect(el.classList.contains('card')).toBe(true)
      expect(el.classList.contains('elevated')).toBe(true)
      expect(el.classList.length).toBe(2)
    })

    it('item() returns token by index', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('card', 'elevated')
      expect(el.classList.item(0)).toBe('card')
      expect(el.classList.item(1)).toBe('elevated')
      expect(el.classList.item(2)).toBeNull()
    })

    it('forEach iterates tokens', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('a', 'b')
      const results: string[] = []
      el.classList.forEach(t => results.push(t))
      expect(results).toEqual(['a', 'b'])
    })

    it('replace() swaps tokens', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      el.classList.add('old')
      expect(el.classList.replace('old', 'new')).toBe(true)
      expect(el.classList.contains('old')).toBe(false)
      expect(el.classList.contains('new')).toBe(true)
    })

    it('replace() returns false if token not found', () => {
      const doc = createDoc()
      const el = doc.createElement('View')
      expect(el.classList.replace('nonexistent', 'x')).toBe(false)
    })
  })

  // ── Image source normalization ────────────────────────────────

  describe('Image source normalization (Fabric payload)', () => {
    it('converts string source to [{ uri }] array', async () => {
      const doc = createDoc()
      const img = doc.createElement('Image')
      img.setAttribute('source', 'https://example.com/a.png')
      doc.body.appendChild(img)
      await Promise.resolve()
      const call = nativeFabricUIManager.createNode.mock.calls.at(-1)
      expect(call[3].source).toEqual([{ uri: 'https://example.com/a.png' }])
    })

    it('leaves array source untouched', async () => {
      const doc = createDoc()
      const img = doc.createElement('Image')
      const arr = [{ uri: 'https://example.com/a.png' }]
      img.setAttribute('source', arr)
      doc.body.appendChild(img)
      await Promise.resolve()
      const call = nativeFabricUIManager.createNode.mock.calls.at(-1)
      expect(call[3].source).toBe(arr)
    })

    it('normalizes object source to [{ uri }]', async () => {
      const doc = createDoc()
      const img = doc.createElement('Image')
      img.setAttribute('source', { uri: 'https://example.com/b.png' })
      doc.body.appendChild(img)
      await Promise.resolve()
      const call = nativeFabricUIManager.createNode.mock.calls.at(-1)
      expect(call[3].source).toEqual([{ uri: 'https://example.com/b.png' }])
    })
  })

  // ── normalizeProps: RN JS-layer transforms ─────────────────────

  describe('normalizeProps (RN JS-layer transforms)', () => {
    it('injects Android ActivityIndicator styleAttr/indeterminate + size style', async () => {
      // Platform.OS is 'ios' by default in the react-native mock; flip it to
      // android so prepareFabricProps passes isAndroid to normalizeProps.
      const prev = Platform.OS
      Platform.OS = 'android'
      try {
        const doc = createDoc()
        const ai = doc.createElement('ActivityIndicator')
        ai.setAttribute('animating', true)
        ai.setAttribute('size', 'small')
        doc.body.appendChild(ai)
        await Promise.resolve()
        const call = nativeFabricUIManager.createNode.mock.calls.at(-1)
        expect(call[3].styleAttr).toBe('Normal')
        expect(call[3].indeterminate).toBe(true)
        // Explicit size avoids Yoga intrinsic measure → RN ProgressBar NPE.
        expect(call[3].style).toEqual([undefined, { width: 20, height: 20 }])
      } finally {
        Platform.OS = prev
      }
    })
  })
})
