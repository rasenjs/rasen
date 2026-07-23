/**
 * StyleCollection — Runtime className → RN style lookup.
 *
 * At app startup, the Metro transformer injects a block that calls
 * StyleCollection.inject(JSON) with the compiled CSS stylesheet.
 * At render time, patchProp('className') looks up styles here.
 *
 * Usage (injected code):
 *   StyleCollection.inject([['flex-1',{flex:1}], ['bg-red-500',{backgroundColor:'#f00'}]])
 *
 * Usage (in component):
 *   StyleCollection.get('flex-1 bg-red-500') → {flex:1, backgroundColor:'#f00'}
 */

class StyleCollection {
  /** @type {Map<string, object>} */
  static _map = new Map()

  /**
   * Inject a list of [className, style] pairs into the collection.
   * @param {Array<[string, object]>} entries
   */
  static inject(entries) {
    for (const [name, style] of entries) {
      StyleCollection._map.set(name, style)
    }
  }

  /**
   * Look up a className string and return merged styles.
   * Handles multiple classes: "flex-1 bg-blue-500"
   * @param {string} className
   * @returns {object|null}
   */
  static get(className) {
    if (!className || typeof className !== 'string') return null

    const classes = className.trim().split(/\s+/)
    if (classes.length === 0) return null

    if (classes.length === 1) {
      return StyleCollection._map.get(classes[0]) || null
    }

    // Merge multiple classes
    let result = null
    for (const name of classes) {
      const style = StyleCollection._map.get(name)
      if (style) {
        if (!result) result = {}
        Object.assign(result, style)
      }
    }
    return result
  }

  /** Clear all entries (for hot reload) */
  static reset() {
    StyleCollection._map.clear()
  }
}

module.exports = { StyleCollection }
