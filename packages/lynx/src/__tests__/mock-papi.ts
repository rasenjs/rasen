/**
 * In-memory mock of the Lynx Element PAPIs
 *
 * Implements the subset of PAPIs used by the renderer against a plain JS
 * tree, enabling full renderer tests in Node without a Lynx runtime.
 */

import { setLynxPapi } from '../papi'

export interface MockElement {
  tag: string
  /** raw-text content */
  text?: string
  attrs: Record<string, string | number | boolean>
  classes: string
  id: string
  styles: Record<string, string>
  datasets: Record<string, string>
  children: MockElement[]
  parent: MockElement | null
  listeners: Map<string, Set<unknown>>
}

export interface MockPapi {
  elements: MockElement[]
  pages: MockElement[]
  flushCount: number
}

function makeElement(tag: string, text?: string): MockElement {
  return {
    tag,
    text,
    attrs: {},
    classes: '',
    id: '',
    styles: {},
    datasets: {},
    children: [],
    parent: null,
    listeners: new Map(),
  }
}

function attach(parent: MockElement, child: MockElement): void {
  child.parent = parent
  parent.children.push(child)
}

function insertBefore(
  parent: MockElement,
  child: MockElement,
  ref: MockElement | null
): void {
  // DOM move semantics: a node already in any tree leaves it first
  if (child.parent !== null) {
    const siblings = child.parent.children
    const oldIdx = siblings.indexOf(child)
    if (oldIdx !== -1) siblings.splice(oldIdx, 1)
  }
  child.parent = parent
  if (ref === null || ref === undefined) {
    parent.children.push(child)
    return
  }
  const idx = parent.children.indexOf(ref)
  if (idx === -1) parent.children.push(child)
  else parent.children.splice(idx, 0, child)
}

function remove(parent: MockElement, child: MockElement): void {
  const idx = parent.children.indexOf(child)
  if (idx !== -1) parent.children.splice(idx, 1)
  child.parent = null
}

/** Create a fresh mock implementation and install it as the active PAPI */
export function installMockPapi(): { mock: MockPapi; papi: Record<string, unknown> } {
  const mock: MockPapi = { elements: [], pages: [], flushCount: 0 }

  const track = (e: MockElement): MockElement => {
    mock.elements.push(e)
    return e
  }

  const impl: Record<string, unknown> = {
    __CreatePage: (tag: string, _componentId: number): MockElement => {
      const p = track(makeElement(tag))
      mock.pages.push(p)
      return p
    },
    __CreateView: (_id: number): MockElement => track(makeElement('view')),
    __CreateText: (_id: number): MockElement => track(makeElement('text')),
    __CreateImage: (_id: number): MockElement => track(makeElement('image')),
    __CreateScrollView: (_id: number): MockElement =>
      track(makeElement('scroll-view')),
    __CreateElement: (tag: string, _id: number): MockElement =>
      track(makeElement(tag)),
    __CreateRawText: (content: string): MockElement =>
      track(makeElement('raw-text', content)),
    __AppendElement: attach,
    __InsertElementBefore: insertBefore,
    __RemoveElement: remove,
    __SetAttribute: (
      e: MockElement,
      key: string,
      value: string | number | boolean | null
    ): void => {
      if (key === 'text' && e.tag === 'raw-text') {
        e.text = value === null ? '' : String(value)
        return
      }
      if (value === null) delete e.attrs[key]
      else e.attrs[key] = value
    },
    __SetClasses: (e: MockElement, cls: string | null): void => {
      e.classes = cls ?? ''
    },
    __SetID: (e: MockElement, id: string): void => {
      e.id = id
    },
    __AddDataset: (e: MockElement, key: string, value: string): void => {
      e.datasets[key] = value
    },
    __AddInlineStyle: (
      e: MockElement,
      key: string,
      value: string | number | null
    ): void => {
      if (value === null) delete e.styles[key]
      else e.styles[key] = String(value)
    },
    __SetInlineStyles: (
      e: MockElement,
      styles: string | Record<string, string> | undefined
    ): void => {
      if (styles === undefined) {
        e.styles = {}
        return
      }
      if (typeof styles === 'string') {
        for (const decl of styles.split(';')) {
          const [k, v] = decl.split(':')
          if (k && v) e.styles[k.trim()] = v.trim()
        }
        return
      }
      Object.assign(e.styles, styles)
    },
    __AddEventListener: (
      e: MockElement,
      eventName: string,
      handler: unknown
    ): void => {
      let set = e.listeners.get(eventName)
      if (!set) {
        set = new Set()
        e.listeners.set(eventName, set)
      }
      set.add(handler)
    },
    __RemoveEventListener: (
      e: MockElement,
      eventName: string,
      handler: unknown
    ): void => {
      e.listeners.get(eventName)?.delete(handler)
    },
    __FlushElementTree: (): void => {
      mock.flushCount++
    },
  }

  setLynxPapi(impl)
  return { mock, papi: impl }
}

/** Restore engine-global PAPI resolution */
export function uninstallMockPapi(): void {
  setLynxPapi(null)
}

/** Indented debug rendering of a mock subtree */
export function renderTree(e: MockElement, indent = 0): string {
  const pad = '  '.repeat(indent)
  const head =
    e.tag === 'raw-text' ? `${pad}"${e.text ?? ''}"` : `${pad}<${e.tag}>`
  const lines = [head]
  for (const c of e.children) lines.push(renderTree(c, indent + 1))
  return lines.join('\n')
}
