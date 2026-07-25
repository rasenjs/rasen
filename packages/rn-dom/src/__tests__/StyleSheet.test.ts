/**
 * @rasenjs/rn-dom — CSSStyleSheet / StyleSheetList / StyleSheet.create tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RNDocument, resetTagCounter, CSSStyleSheet, StyleSheet, _resolveClassStyles } from '../index'
import { resetFabricMocks, nativeFabricUIManager } from './setup'

function createDoc(): RNDocument {
  RNDocument.reset()
  resetTagCounter()
  resetFabricMocks()
  return RNDocument.getOrCreate(1)
}

describe('CSSStyleSheet', () => {
  it('stores name and frozen style', () => {
    const sheet = new CSSStyleSheet('.card', { flex: 1, backgroundColor: 'red' })
    expect(sheet.name).toBe('.card')
    expect(sheet.style).toEqual({ flex: 1, backgroundColor: 'red' })
    expect(Object.isFrozen(sheet.style)).toBe(true)
  })

  it('has empty cssRules array', () => {
    const sheet = new CSSStyleSheet('card', { flex: 1 })
    expect(sheet.cssRules).toEqual([])
  })
})

describe('StyleSheetList', () => {
  it('starts empty', () => {
    const doc = createDoc()
    expect(doc.styleSheets.length).toBe(0)
  })

  it('item() returns sheet by index', () => {
    const doc = createDoc()
    const s1 = new CSSStyleSheet('.card', { flex: 1 })
    const s2 = new CSSStyleSheet('.text', { color: 'red' })
    doc.styleSheets._sheets.push(s1, s2)
    expect(doc.styleSheets.item(0)).toBe(s1)
    expect(doc.styleSheets.item(1)).toBe(s2)
  })

  it('_getStyle returns style by class name', () => {
    const doc = createDoc()
    doc.styleSheets._sheets.push(new CSSStyleSheet('.card', { flex: 1 }))
    expect(doc.styleSheets._getStyle('card')).toEqual({ flex: 1 })
    expect(doc.styleSheets._getStyle('unknown')).toBeUndefined()
  })

  it('is iterable', () => {
    const doc = createDoc()
    doc.styleSheets._sheets.push(new CSSStyleSheet('.a', { flex: 1 }))
    doc.styleSheets._sheets.push(new CSSStyleSheet('.b', { color: 'red' }))
    const names: string[] = []
    for (const sheet of doc.styleSheets) names.push(sheet.name)
    expect(names).toEqual(['.a', '.b'])
  })
})

describe('StyleSheet.create', () => {
  it('registers sheets and returns class name strings', () => {
    const doc = createDoc()
    const s = StyleSheet.create({
      '.card': { flex: 1, backgroundColor: 'red' },
      '.text': { color: 'blue' },
    }, doc)
    expect(s['.card']).toBe('card')
    expect(s['.text']).toBe('text')
    expect(doc.styleSheets.length).toBe(2)
    expect(doc.styleSheets.item(0)!.name).toBe('.card')
  })

  it('auto-converts bare keys to .selector format', () => {
    const doc = createDoc()
    const s = StyleSheet.create({ card: { flex: 1 } }, doc)
    expect(s.card).toBe('card')
    expect(doc.styleSheets.item(0)!.name).toBe('.card')
  })

  it('returns frozen style objects via _getStyle', () => {
    const doc = createDoc()
    StyleSheet.create({ '.card': { flex: 1 } }, doc)
    const style = doc.styleSheets._getStyle('card')
    expect(style).toEqual({ flex: 1 })
    expect(Object.isFrozen(style)).toBe(true)
  })
})

describe('_resolveClassStyles', () => {
  it('returns empty object when no classList', () => {
    const doc = createDoc()
    const el = doc.createElement('View')
    expect(_resolveClassStyles(el)).toEqual({})
  })

  it('resolves single class from stylesheet (with . selector)', () => {
    const doc = createDoc()
    StyleSheet.create({ '.card': { flex: 1 } }, doc)
    const el = doc.createElement('View')
    el.classList.add('card')
    expect(_resolveClassStyles(el)).toEqual({ flex: 1 })
  })

  it('merges multiple classes in order', () => {
    const doc = createDoc()
    StyleSheet.create({
      '.base': { flex: 1, color: 'red' },
      '.theme': { color: 'blue', opacity: 0.5 },
    }, doc)
    const el = doc.createElement('View')
    el.classList.add('base', 'theme')
    expect(_resolveClassStyles(el)).toEqual({ flex: 1, color: 'blue', opacity: 0.5 })
  })

  it('returns empty for unknown classes', () => {
    const doc = createDoc()
    const el = doc.createElement('View')
    el.classList.add('unknown')
    expect(_resolveClassStyles(el)).toEqual({})
  })

  it('returns empty when no stylesheets registered', () => {
    const doc = createDoc()
    const el = doc.createElement('View')
    el.classList.add('card')
    expect(_resolveClassStyles(el)).toEqual({})
  })
})

describe('classList + style merge via _getFabricNode', () => {
  it('class style appears in createNode payload', () => {
    const doc = createDoc()
    StyleSheet.create({ '.card': { flex: 1 } }, doc)
    const el = doc.createElement('View')
    el.classList.add('card')
    doc.body.appendChild(el)
    doc.body._submitToRoot()

    const call = nativeFabricUIManager.createNode.mock.calls[0]
    // The merged style should include flex:1 from class
    expect(call[3]).toHaveProperty('style')
    expect(call[3].style).toHaveProperty('flex', 1)
  })

  it('inline style overrides class style', () => {
    const doc = createDoc()
    StyleSheet.create({ '.card': { flex: 1, color: 'red' } }, doc)
    const el = doc.createElement('View')
    el.classList.add('card')
    el.style.setProperty('color', 'blue')
    doc.body.appendChild(el)
    doc.body._submitToRoot()

    const call = nativeFabricUIManager.createNode.mock.calls[0]
    expect(call[3].style).toHaveProperty('flex', 1)
    expect(call[3].style).toHaveProperty('color', 'blue')
  })

  it('classList changes propagate on flush', () => {
    const doc = createDoc()
    StyleSheet.create({ '.card': { flex: 1 } }, doc)
    const el = doc.createElement('View')
    doc.body.appendChild(el)
    doc.body._submitToRoot()
    jestClearMocks()

    // Add class after mount
    el.classList.add('card')
    doc.body._submitToRoot()

    // createNode should NOT be called again (node already mounted)
    expect(nativeFabricUIManager.createNode).not.toHaveBeenCalled()
  })
})

function jestClearMocks() {
  for (const key of Object.keys(nativeFabricUIManager)) {
    const v = (nativeFabricUIManager as any)[key]
    if (typeof v === 'function' && 'mockClear' in v) v.mockClear()
  }
}
