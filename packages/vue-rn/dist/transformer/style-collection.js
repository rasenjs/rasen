"use strict";
/**
 * @rasenjs/vue-rn — Runtime className → RN style lookup.
 *
 * At app startup, the Metro transformer injects a block that calls
 * StyleCollection.inject() with the compiled CSS stylesheet.
 * At render time, the runtime looks up styles here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StyleCollection = void 0;
class StyleCollection {
    /** Inject a list of [className, style] pairs. */
    static inject(entries) {
        for (const [name, style] of entries) {
            StyleCollection._map.set(name, style);
        }
    }
    /**
     * Look up a className string and return merged styles.
     * Handles multiple classes: "flex-1 bg-blue-500"
     */
    static get(className) {
        if (!className || typeof className !== 'string')
            return null;
        const classes = className.trim().split(/\s+/);
        if (classes.length === 0)
            return null;
        if (classes.length === 1) {
            return StyleCollection._map.get(classes[0]) ?? null;
        }
        let result = null;
        for (const name of classes) {
            const style = StyleCollection._map.get(name);
            if (style) {
                if (!result)
                    result = {};
                Object.assign(result, style);
            }
        }
        return result;
    }
    /** Clear all entries (for hot reload). */
    static reset() {
        StyleCollection._map.clear();
    }
}
exports.StyleCollection = StyleCollection;
StyleCollection._map = new Map();
