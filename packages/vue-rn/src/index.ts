/**
 * Vue 3 Custom Renderer for React Native Fabric
 *
 * Replaces @vue/runtime-dom's DOM backend with @rasenjs/rn-dom.
 * Vue template → VNode → rn-dom → Fabric.
 *
 * Usage:
 *   import { createApp } from '@rasenjs/vue-rn'
 *   import App from './App.vue'
 *   import { RNDocument } from '@rasenjs/rn-dom'
 *
 *   AppRegistry.registerRunnable('MyApp', ({ rootTag }) => {
 *     const doc = RNDocument.getOrCreate(rootTag)
 *     createApp(App).mount(doc.body)
 *   })
 */

import { createRenderer, h, ref, reactive, computed } from '@vue/runtime-core'
import { RNDocument } from '@rasenjs/rn-dom'
import type { RNNode, RNTextNode, RNCommentNode } from '@rasenjs/rn-dom'

let _doc: RNDocument | null = null

// ---------------------------------------------------------------------------
// CSS string → object parser
// ---------------------------------------------------------------------------

function parseCSS(css: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const decl of css.split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const key = decl.slice(0, colon).trim()
    const value = decl.slice(colon + 1).trim()
    if (!key || !value) continue
    const camelKey = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    const num = Number(value)
    result[camelKey] = Number.isNaN(num) ? value : num
  }
  return result
}

// ---------------------------------------------------------------------------
// patchStyle
// ---------------------------------------------------------------------------

function patchStyle(
  el: RNNode,
  prev: string | Record<string, unknown> | null,
  next: string | Record<string, unknown> | null,
): void {
  if (prev) {
    const prevObj = typeof prev === 'string' ? parseCSS(prev) : prev
    for (const key of Object.keys(prevObj)) {
      el.style.removeProperty(key)
    }
  }
  if (next) {
    const nextObj = typeof next === 'string' ? parseCSS(next) : next
    for (const [key, value] of Object.entries(nextObj)) {
      el.style.setProperty(key, value)
    }
  }
}

// ---------------------------------------------------------------------------
// Event name normalisation
// ---------------------------------------------------------------------------

const EVENT_ALIAS: Record<string, string> = {
  onclick: 'onTouchEnd',
  ontouchend: 'onTouchEnd',
  ontouchstart: 'onTouchStart',
  ontouchmove: 'onTouchMove',
  ontouchcancel: 'onTouchCancel',
  oninput: 'onChange',
}

function normalizeEventName(key: string): string {
  const lower = key.toLowerCase()
  if (EVENT_ALIAS[lower]) return EVENT_ALIAS[lower]
  if (key.startsWith('on:')) {
    const event = key.slice(3)
    return 'on' + event.charAt(0).toUpperCase() + event.slice(1)
  }
  if (key.charCodeAt(0) === 111 /* o */ && key.charCodeAt(1) === 110 /* n */) {
    return key.slice(0, 2) + key.charAt(2).toUpperCase() + key.slice(3)
  }
  return key
}

/** Check if a string looks like a Vue event binding (starts with "on") */
const isEvent = (key: string): boolean =>
  key.length > 2 &&
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */

// ---------------------------------------------------------------------------
// DOM operations for Vue renderer
// ---------------------------------------------------------------------------

type VNode = RNNode | RNTextNode | RNCommentNode

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createVueRenderer(): any {
  return createRenderer({
    insert(child: VNode, parent: RNNode, anchor: VNode | null): void {
      parent.insertBefore(child, anchor ?? undefined)
    },

    remove(child: VNode): void {
      child.parentNode?.removeChild(child)
    },

    createElement(tag: string): RNNode {
      return _doc!.createElement(tag)
    },

    createText(text: string): RNTextNode {
      return _doc!.createTextNode(text)
    },

    createComment(text: string): RNCommentNode {
      return _doc!.createComment(text)
    },

    setText(node: VNode, text: string): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(node as any).textContent = text
    },

    setElementText(el: RNNode, text: string): void {
      el.textContent = text
    },

    parentNode(node: VNode): RNNode | null {
      return node.parentNode
    },

    nextSibling(node: VNode): VNode | null {
      return (node.nextSibling as VNode | null) ?? null
    },

    patchProp(el: RNNode, key: string, prevValue: unknown, nextValue: unknown): void {
      if (key === 'class') return

      if (key === 'style') {
        patchStyle(
          el,
          prevValue as string | Record<string, unknown> | null,
          nextValue as string | Record<string, unknown> | null,
        )
        return
      }

      if (isEvent(key)) {
        const rnKey = normalizeEventName(key)
        if (prevValue != null) el.removeAttribute(rnKey)
        if (nextValue != null) el.setAttribute(rnKey, nextValue)
        return
      }

      if (nextValue == null) {
        el.removeAttribute(key)
      } else {
        el.setAttribute(key, nextValue)
      }
    },

    setScopeId(): void {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insertStaticContent(): any { return null },
  })
}

// ---------------------------------------------------------------------------
// patchProp
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// createApp
// ---------------------------------------------------------------------------

export interface VueRNMountable {
  mount(container: RNNode): void
  unmount(): void
  use(plugin: any, ...options: any[]): VueRNMountable
}

export function createApp(rootComponent: object): VueRNMountable {
  const renderer = createVueRenderer()
  const app = renderer.createApp(rootComponent)

  return {
    mount(container: RNNode) {
      _doc = container.ownerDocument
      app.mount(container)
      _doc.body.completeFabric()
    },

    unmount() {
      app.unmount()
    },

    use(plugin: any, ...options: any[]) {
      app.use(plugin, ...options)
      return this
    },
  }
}

export { RNDocument }
