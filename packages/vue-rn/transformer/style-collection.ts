/**
 * @rasenjs/vue-rn — Runtime className → RN style lookup.
 *
 * At app startup, the Metro transformer injects a block that calls
 * StyleCollection.inject() with the compiled CSS stylesheet.
 * At render time, the runtime looks up styles here.
 */

type StyleEntry = [string, Record<string, unknown>]

class StyleCollection {
  static _map = new Map<string, Record<string, unknown>>()

  /** Inject a list of [className, style] pairs. */
  static inject(entries: StyleEntry[]): void {
    for (const [name, style] of entries) {
      StyleCollection._map.set(name, style)
    }
  }

  /**
   * Look up a className string and return merged styles.
   * Handles multiple classes: "flex-1 bg-blue-500"
   */
  static get(className: string): Record<string, unknown> | null {
    if (!className || typeof className !== 'string') return null

    const classes = className.trim().split(/\s+/)
    if (classes.length === 0) return null

    if (classes.length === 1) {
      return StyleCollection._map.get(classes[0]) ?? null
    }

    let result: Record<string, unknown> | null = null
    for (const name of classes) {
      const style = StyleCollection._map.get(name)
      if (style) {
        if (!result) result = {}
        Object.assign(result, style)
      }
    }
    return result
  }

  /** Clear all entries (for hot reload). */
  static reset(): void {
    StyleCollection._map.clear()
  }
}

export { StyleCollection }
