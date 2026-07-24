/**
 * compose - 组合式组件
 *
 * 用于组合多个 primitive 或组件，
 * 创建更复杂的组件。
 */
import type { Mountable } from '@rasenjs/core'

export interface ComposeComponent {
  (host: unknown): (() => void) | undefined
}

/**
 * 组合多个组件
 */
export function compose(
  ...components: Array<() => Mountable<unknown>>
): () => Mountable<unknown> {
  return () => {
    return (host: unknown) => {
      const unmounts: Array<() => void> = []

      for (const comp of components) {
        const result = comp()(host)
        if (typeof result === 'function') {
          unmounts.push(result)
        }
      }

      return () => {
        for (const unmount of unmounts) {
          unmount()
        }
      }
    }
  }
}
