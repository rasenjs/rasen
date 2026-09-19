/**
 * Agreement between the two render targets.
 *
 * `@rasenjs/web` promises the same components either way: markup on the server,
 * live elements in the browser. That promise only holds if the two renderers
 * agree on every prop — and they are separate implementations of the same rules
 * (attribute naming, presence, booleans, style), which is exactly how they drift.
 *
 * So this file renders the same props twice and compares the resulting element.
 * A rule that diverges fails here instead of showing up as markup that changes
 * the moment it hydrates.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, div, span, button, img } from '@rasenjs/dom'
import {
  renderToString,
  div as htmlDiv,
  span as htmlSpan,
  button as htmlButton,
  img as htmlImg
} from '@rasenjs/html'
import { useReactiveRuntime } from '@rasenjs/reactive-vue'

interface Shape {
  attrs: Record<string, string>
  style: Record<string, string>
}

/**
 * Describe an element in terms both renderers can be compared through.
 *
 * Style is read through the CSSOM: the DOM renderer writes single declarations
 * while the string renderer emits one `style` attribute, so comparing the raw
 * attribute text would compare serialization instead of behavior.
 */
function shapeOf(el: Element): Shape {
  const attrs: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === 'style') continue
    attrs[attr.name] = attr.value
  }
  const style: Record<string, string> = {}
  const inline = (el as HTMLElement).style
  for (const prop of Array.from(inline)) {
    style[prop] = inline.getPropertyValue(prop)
  }
  return { attrs, style }
}

function parseFirst(html: string): Element {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const el = doc.body.firstElementChild
  if (!el) throw new Error(`no element in: ${html}`)
  return el
}

type TagName = 'div' | 'span' | 'button' | 'img'

const domFactory: Record<TagName, (props: never) => never> = {
  div: div as never,
  span: span as never,
  button: button as never,
  img: img as never
}

const htmlFactory: Record<TagName, (props: never) => never> = {
  div: htmlDiv as never,
  span: htmlSpan as never,
  button: htmlButton as never,
  img: htmlImg as never
}

let container: HTMLElement

beforeEach(() => {
  useReactiveRuntime()
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  container.remove()
})

/**
 * Render `props` with both renderers and assert the elements match.
 */
function expectSameElement(tag: TagName, props: Record<string, unknown>): void {
  const unmount = mount(domFactory[tag](props as never) as never, container)
  const domEl = container.firstElementChild
  expect(domEl).toBeTruthy()

  const htmlEl = parseFirst(renderToString(htmlFactory[tag](props as never) as never))

  expect(shapeOf(htmlEl)).toEqual(shapeOf(domEl as Element))
  if (typeof unmount === 'function') unmount()
}

describe('@rasenjs/web - the two renderers agree', () => {
  it('should agree on data-* booleans', () => {
    expectSameElement('div', { dataState: true })
    expectSameElement('div', { dataState: false })
  })

  it('should agree on kebab-casing aria* keys', () => {
    expectSameElement('button', { ariaChecked: true })
    expectSameElement('button', { ariaExpanded: 'false' })
    expectSameElement('button', { 'aria-controls': 'x' })
  })

  it('should agree on flag attributes', () => {
    expectSameElement('button', { hidden: true })
    expectSameElement('button', { hidden: false })
    expectSameElement('button', { disabled: true })
    expectSameElement('button', { disabled: false })
  })

  it('should agree on absent attributes', () => {
    expectSameElement('div', { title: null })
    expectSameElement('div', { title: undefined })
  })

  it('should agree on numeric values', () => {
    expectSameElement('button', { tabIndex: -1 })
  })

  it('should agree on class', () => {
    expectSameElement('div', { class: 'a b' })
  })

  it('should agree on a style object', () => {
    expectSameElement('span', { style: { color: 'red', fontSize: 16 } })
  })

  it('should agree on a reactive style declaration', () => {
    // One CSS property bound to a condition — the shape components use.
    expectSameElement('span', {
      style: { opacity: () => '0', position: 'absolute' }
    })
  })

  it('should agree on skipping a nullish style declaration', () => {
    expectSameElement('span', { style: { color: 'red', backgroundColor: null } })
  })

  it('should agree on a void element', () => {
    expectSameElement('img', { src: 'a.png', alt: 'A' })
  })
})

/**
 * A sanity check on the harness itself: if `shapeOf` collapsed everything, the
 * cases above would pass without proving anything.
 */
describe('@rasenjs/web - the comparison can fail', () => {
  it('should notice a differently shaped element', () => {
    const withAttr = parseFirst('<div data-state="true"></div>')
    const withoutAttr = parseFirst('<div></div>')
    expect(shapeOf(withAttr)).not.toEqual(shapeOf(withoutAttr))
  })

  it('should notice a different attribute value', () => {
    expect(shapeOf(parseFirst('<div data-state="true"></div>'))).not.toEqual(
      shapeOf(parseFirst('<div data-state="false"></div>'))
    )
  })

  it('should notice a different style value', () => {
    expect(shapeOf(parseFirst('<span style="opacity: 0"></span>'))).not.toEqual(
      shapeOf(parseFirst('<span style="opacity: 1"></span>'))
    )
  })
})
