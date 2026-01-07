/**
 * Text node component for HTML (SSR)
 * 
 * Outputs escaped text content
 */

import type { Mountable } from '@rasenjs/core'
import type { StringHost } from '../types'
import { escapeHtml } from '../utils'

export interface TextProps {
  /** Text content - can be static string/number or reactive getter */
  content: string | number | (() => string | number)
}

/**
 * Create a text node for SSR
 * 
 * @example
 * ```ts
 * // Static text
 * text({ content: 'Hello' })
 * 
 * // Reactive text (evaluates immediately in SSR)
 * text({ content: () => count.value })
 * ```
 */
export function text(props: TextProps): Mountable<StringHost> {
  const { content } = props

  return (host: StringHost) => {
    // Resolve content
    const textContent = typeof content === 'function' 
      ? String(content())
      : String(content)
    
    // Append escaped text
    host.append(escapeHtml(textContent))
    
    return undefined
  }
}
