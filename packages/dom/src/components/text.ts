/**
 * Text node component for DOM
 * 
 * Creates a reactive text node that updates when content changes
 */

import type { Mountable } from '@rasenjs/core'
import { getReactiveRuntime } from '@rasenjs/core'
import { getHydrationContext } from '../hydration-context'

export interface TextProps {
  /** Text content - can be static string/number or reactive getter */
  content: string | number | (() => string | number)
}

/**
 * Create a reactive text node
 * 
 * @example
 * ```ts
 * // Static text
 * text({ content: 'Hello' })
 * 
 * // Reactive text
 * const count = ref(0)
 * text({ content: () => count.value })
 * ```
 */
export function text(props: TextProps): Mountable<HTMLElement> {
  const { content } = props

  return (host: HTMLElement) => {
    const runtime = getReactiveRuntime()
    const ctx = getHydrationContext()
    
    // Create or claim text node
    let textNode: Text
    if (ctx?.isHydrating) {
      const claimed = ctx.claim()
      if (claimed?.nodeType === Node.TEXT_NODE) {
        textNode = claimed as Text
      } else {
        // Mismatch: remove claimed node and create new one
        if (claimed) claimed.parentNode?.removeChild(claimed)
        textNode = document.createTextNode('')
        host.appendChild(textNode)
      }
    } else {
      textNode = document.createTextNode('')
      host.appendChild(textNode)
    }

    // Handle content
    if (typeof content === 'function') {
      // Reactive content
      const stop = runtime.watch(
        content,
        (newText) => {
          textNode.textContent = String(newText)
        },
        { immediate: !ctx?.isHydrating } // Skip immediate in hydration mode
      )

      return () => {
        stop()
        textNode.remove()
      }
    } else {
      // Static content
      if (!ctx?.isHydrating) {
        // Only set textContent if not hydrating (already set by SSR)
        textNode.textContent = String(content)
      }
      return () => {
        textNode.remove()
      }
    }
  }
}
