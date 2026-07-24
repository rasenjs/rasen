"use strict";
/**
 * Class Resolver — Convert CSS class names to RN style objects.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.use = use;
exports.detect = detect;
exports.resolve = resolve;
// Lazy-init built-in plugins (loaded on first detect/resolve).
let _plugins = null;
/** User-registered custom plugins (checked before built-ins). */
const _userPlugins = [];
function getPlugins() {
    if (!_plugins) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const tw4 = require('./plugins/tw-v4').default;
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const tw3 = require('./plugins/tw-v3').default;
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const uno = require('./plugins/unocss').default;
            _plugins = [tw4, tw3, uno];
        }
        catch {
            _plugins = [];
        }
    }
    return [..._userPlugins, ..._plugins];
}
/**
 * Register a custom class resolver plugin.
 * Registered plugins are checked before built-in ones.
 */
function use(resolver) {
    _userPlugins.push(resolver);
}
/**
 * Auto-detect the appropriate class resolver.
 */
function detect(options) {
    for (const r of getPlugins()) {
        if (r.detect(options))
            return r;
    }
    return null;
}
/**
 * Resolve class names to RN styles.
 */
async function resolve(options) {
    for (const r of getPlugins()) {
        if (r.detect(options)) {
            console.log(`[vue-rn] class resolver: ${r.name}`);
            return r.resolve(options);
        }
    }
    return { styleMap: new Map(), cssOutput: '' };
}
