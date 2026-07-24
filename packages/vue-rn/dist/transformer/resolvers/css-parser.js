/**
 * Shared CSS → RN style parser.
 * Parses expanded Tailwind/UnoCSS output CSS into className → style Record map.
 */
const RN_PROP_MAP = {
    'display': true,
    'flex': true,
    'flex-direction': 'flexDirection',
    'flex-wrap': 'flexWrap',
    'flex-grow': 'flexGrow',
    'flex-shrink': 'flexShrink',
    'flex-basis': 'flexBasis',
    'justify-content': 'justifyContent',
    'align-items': 'alignItems',
    'align-self': 'alignSelf',
    'align-content': 'alignContent',
    'gap': true,
    'row-gap': 'rowGap',
    'column-gap': 'columnGap',
    'order': true,
    'width': true,
    'height': true,
    'min-width': 'minWidth',
    'min-height': 'minHeight',
    'max-width': 'maxWidth',
    'max-height': 'maxHeight',
    'margin': true,
    'margin-top': 'marginTop',
    'margin-right': 'marginRight',
    'margin-bottom': 'marginBottom',
    'margin-left': 'marginLeft',
    'margin-inline': 'marginHorizontal',
    'margin-block': 'marginVertical',
    'padding': true,
    'padding-top': 'paddingTop',
    'padding-right': 'paddingRight',
    'padding-bottom': 'paddingBottom',
    'padding-left': 'paddingLeft',
    'padding-inline': 'paddingHorizontal',
    'padding-block': 'paddingVertical',
    'color': true,
    'font-size': 'fontSize',
    'font-weight': 'fontWeight',
    'font-family': 'fontFamily',
    'font-style': 'fontStyle',
    'line-height': 'lineHeight',
    'letter-spacing': 'letterSpacing',
    'text-align': 'textAlign',
    'text-decoration-line': 'textDecorationLine',
    'text-decoration-color': 'textDecorationColor',
    'text-decoration-style': 'textDecorationStyle',
    'text-transform': 'textTransform',
    'background-color': 'backgroundColor',
    'opacity': true,
    'border-width': 'borderWidth',
    'border-style': 'borderStyle',
    'border-color': 'borderColor',
    'border-radius': 'borderRadius',
    'border-top-width': 'borderTopWidth',
    'border-right-width': 'borderRightWidth',
    'border-bottom-width': 'borderBottomWidth',
    'border-left-width': 'borderLeftWidth',
    'border-top-color': 'borderTopColor',
    'border-right-color': 'borderRightColor',
    'border-bottom-color': 'borderBottomColor',
    'border-left-color': 'borderLeftColor',
    'border-top-left-radius': 'borderTopLeftRadius',
    'border-top-right-radius': 'borderTopRightRadius',
    'border-bottom-left-radius': 'borderBottomLeftRadius',
    'border-bottom-right-radius': 'borderBottomRightRadius',
    'shadow-color': 'shadowColor',
    'shadow-offset': 'shadowOffset',
    'shadow-opacity': 'shadowOpacity',
    'shadow-radius': 'shadowRadius',
    'elevation': true,
    'position': true,
    'top': true,
    'right': true,
    'bottom': true,
    'left': true,
    'z-index': 'zIndex',
    'overflow': true,
    'overflow-x': 'overflowX',
    'overflow-y': 'overflowY',
    'transform': true,
    'rotate': true,
    'scale': true,
    'translate-x': 'translateX',
    'translate-y': 'translateY',
    'resize-mode': 'resizeMode',
    'tint-color': 'tintColor',
    'pointer-events': 'pointerEvents',
};
function toRNProp(cssProp) {
    const mapped = RN_PROP_MAP[cssProp];
    if (mapped === true)
        return cssProp;
    return mapped || cssProp.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
/**
 * @param {string} value
 * @param {string} [prop] - CSS property name, for context-aware conversion
 */
function toRNValue(value, prop) {
    value = value.replace(/\s*!important\s*$/, '');
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
    }
    // rem → px (1rem = 16px) — must run before calc()
    value = value.replace(/([\d.]+)rem\b/g, (_, num) => `${parseFloat(num) * 16}px`);
    // Resolve calc() expressions
    value = value.replace(/calc\(([^)]+)\)/g, (_, expr) => {
        try {
            // eslint-disable-next-line no-eval
            const result = eval(expr.replace(/[\d.]+[a-z]+/g, m => parseFloat(m)));
            return String(result) + 'px';
        }
        catch (_) {
            return expr;
        }
    });
    // 3-char hex → 6-char
    value = value.replace(/#([0-9a-fA-F]{3})\b/g, (_, hex) => {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    });
    const num = parseFloat(value);
    const rawValue = value.replace(/px$/, '');
    const rawNum = parseFloat(rawValue);
    // CSS line-height multiplier: unitless or small px values from calc() such as
    // 1.2 or 1.2px are font-size multipliers. RN lineHeight is absolute dp, so
    // drop these to avoid clipping text (RN would interpret 1.2 as 1.2dp).
    if (prop === 'line-height' && !isNaN(rawNum) && rawNum < 5) {
        return undefined;
    }
    if (value === '0')
        return 0;
    if (/^\d+$/.test(value))
        return parseInt(value, 10);
    if (/^[\d.]+(px)?$/.test(value))
        return parseFloat(value);
    return value;
}
/**
 * Parse expanded CSS text into a Map of className → RN style object.
 * Also resolves CSS variables (var(--name)) from :root definitions.
 *
 * @param {string} cssText
 * @returns {Map<string, object>}
 */
function parseCSS(cssText) {
    // First, extract CSS variable definitions from :root and other scope blocks
    const cssVars = {};
    const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let varMatch;
    while ((varMatch = varRegex.exec(cssText)) !== null) {
        cssVars[varMatch[1]] = varMatch[2].trim();
    }
    function resolveVar(value) {
        // Resolve var() references, supporting nested resolution
        let prev;
        let current = value;
        let maxDepth = 10;
        do {
            prev = current;
            current = current.replace(/var\(--([\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, name, fallback) => {
                return cssVars[name] !== undefined ? cssVars[name] : (fallback || `var(--${name})`);
            });
        } while (current !== prev && maxDepth-- > 0);
        return current;
    }
    const map = new Map();
    const ruleRegex = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)\s*\{([^}]+)\}/g;
    let match;
    while ((match = ruleRegex.exec(cssText)) !== null) {
        const className = match[1];
        const body = match[2];
        const style = {};
        const declRegex = /([\w-]+)\s*:\s*([^;]+);/g;
        let decl;
        while ((decl = declRegex.exec(body)) !== null) {
            const cssProp = decl[1].trim();
            // Skip Tailwind internal properties (prefixed with -)
            if (cssProp.startsWith('-'))
                continue;
            let cssValue = decl[2].trim();
            const rnProp = toRNProp(cssProp);
            if (rnProp) {
                cssValue = resolveVar(cssValue);
                const rnVal = toRNValue(cssValue, cssProp);
                if (rnVal !== undefined)
                    style[rnProp] = rnVal;
            }
        }
        if (Object.keys(style).length > 0)
            map.set(className, style);
    }
    return map;
}
module.exports = { parseCSS };
