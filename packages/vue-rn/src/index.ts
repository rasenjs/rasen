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

import { createRenderer, getCurrentInstance } from '@vue/runtime-core'
import { RNDocument, parseCSS, normalizeEventName, isEvent } from '@rasenjs/rn-dom'
import type { RNNode, RNTextNode, RNCommentNode } from '@rasenjs/rn-dom'

let _doc: RNDocument | null = null

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
      // Synchronously flush the initial tree to Fabric.
      // Without this, Fabric would wait for the next microtask, leaving
      // the first frame blank.
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

// ---------------------------------------------------------------------------
// useCssModule — re-exported for convenience
// ---------------------------------------------------------------------------

/**
 * Returns the CSS module class name mapping for the current component.
 *
 * Use in `<script setup>`:
 *   import { useCssModule } from '@rasenjs/vue-rn'
 *   const style = useCssModule()       // <style module>
 *   const foo = useCssModule('foo')    // <style module="foo">
 *
 * Or in templates via `$style`:
 *   <View :style="$style.myClass" />
 *   <View :style="$style.foo.myClass" />
 */
export function useCssModule(name = '$style'): Record<string, unknown> {
  const instance = getCurrentInstance()
  if (!instance) {
    return {}
  }
  const modules = (instance.type as Record<string, unknown>).__cssModules as Record<string, unknown> | undefined
  if (!modules) {
    return {}
  }
  const mod = modules[name] as Record<string, unknown> | undefined
  return mod ?? {}
}
