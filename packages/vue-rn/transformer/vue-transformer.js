/**
 * @rasenjs/vue-rn Metro transformer for Vue SFC (.vue) files.
 *
 * Features:
 *   - Vue SFC compilation (script + template)
 *   - TypeScript stripping
 *   - Tailwind / UnoCSS class→style at compile time
 *
 * Usage in metro.config.js:
 *
 *   babelTransformerPath: require.resolve('@rasenjs/vue-rn/transformer/vue-transformer'),
 *   resolver.sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'vue']
 */

const crypto = require('crypto')
const vueCompiler = require('@vue/compiler-sfc')
const { createSimpleExpression } = require('@vue/compiler-core')
const babel = require('@babel/core')
const { resolve: resolveCSS } = require('./resolver')

const RN_BUILT_IN_TAGS = new Set([
  'View', 'Text', 'AndroidTextInput', 'Image', 'ScrollView',
  'RCTView', 'RCTText', 'RCTScrollView', 'RCTImage',
  'ActivityIndicator', 'Switch', 'ProgressBar',
  'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'Modal', 'RefreshControl', 'SafeAreaView', 'KeyboardAvoidingView',
])

let _resolverInit = false
let _styleMap = new Map()

function classToStyleNT(node, _context) {
  if (node.type !== 1 || !node.props) return
  const idx = node.props.findIndex(p => p.type === 6 && p.name === 'class')
  if (idx === -1) return

  const str = node.props[idx].value?.content || ''
  const classes = str.trim().split(/\s+/)
  let r = null
  for (const n of classes) {
    const s = _styleMap.get(n)
    if (s) { if (!r) r = {}; Object.assign(r, s) }
  }
  if (!r) return

  node.props.splice(idx, 1)
  const expr = `({ ${Object.entries(r).map(([k, v]) => {
    const key = /^[a-z]\w*$/i.test(k) ? k : `'${k}'`
    const val = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v)
    return `${key}: ${val}`
  }).join(', ')} })`

  const si = node.props.findIndex(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'style')
  if (si >= 0) {
    const existing = node.props[si].exp
    if (existing.type === 8) {
      // CompoundExpression — children already has _ctx. prefixes applied by
      // transformExpression. Just prepend our style into the first child string.
      // children[0] looks like: "[{ backgroundColor: '#1a1a2e',"
      // Replace it with:      "[({flexDirection: 'row'}), { backgroundColor: '#1a1a2e',"
      existing.children[0] = `[${expr}, ${existing.children[0].slice(1)}`
    } else {
      // SimpleExpression — no dynamic bindings, safe to create new expression
      const existingSrc = existing.content
      if (existingSrc.trimStart().startsWith('[')) {
        const inner = existingSrc.trim().slice(1, -1).trim()
        node.props[si].exp = createSimpleExpression(`[${expr}, ${inner}]`, false)
      } else {
        node.props[si].exp = createSimpleExpression(`[${expr}, ${existingSrc}]`, false)
      }
    }
  } else {
    node.props.push({
      type: 7, name: 'bind',
      arg: createSimpleExpression('style', true),
      exp: createSimpleExpression(expr, false),
      modifiers: [],
    })
  }
}

async function transform(params) {
  const { filename, src } = params

  if (!filename.endsWith('.vue')) {
    return require('@react-native/metro-babel-transformer').transform(params)
  }

  if (!_resolverInit) {
    _resolverInit = true
    try { _styleMap = (await resolveCSS({ projectRoot: process.cwd() })).styleMap }
    catch (_) {}
  }

  const id = crypto.createHash('md5').update(filename).digest('hex').slice(0, 8)
  const { descriptor, errors } = vueCompiler.parse(src, { filename })
  if (errors.length > 0) throw new Error(`[vue-transformer] ${filename}: ${errors[0].message || errors[0]}`)

  // Script
  let scriptCode, scriptBindings, isScriptSetup = false
  if (descriptor.scriptSetup) {
    isScriptSetup = true
    const c = vueCompiler.compileScript(descriptor, { id, isProd: false, babelParserPlugins: ['typescript', 'jsx'] })
    scriptCode = c.content; scriptBindings = c.bindings
  } else if (descriptor.script) {
    const raw = descriptor.script.content
    scriptCode = raw.includes('export default') ? raw.replace(/export\s+default\s*/m, 'const __sfc__ = ') : raw + '\nconst __sfc__ = {}'
  } else {
    scriptCode = 'const __sfc__ = {}'
  }

  // Template
  let renderCode = ''
  if (descriptor.template) {
    const c = vueCompiler.compileTemplate({
      source: descriptor.template.content, filename, id,
      compilerOptions: {
        mode: 'module', bindingMetadata: scriptBindings,
        isCustomElement: (tag) => RN_BUILT_IN_TAGS.has(tag) && !(scriptBindings && tag in scriptBindings),
        expressionPlugins: ['typescript'],
        nodeTransforms: _styleMap.size > 0 ? [classToStyleNT] : [],
      },
    })
    if (c.errors.length > 0) throw new Error(`[vue-transformer] ${filename}: ${c.errors[0].message || c.errors[0]}`)
    renderCode = c.code
  }

  // Merge
  let combined
  if (isScriptSetup) {
    // For <script setup>, rewrite the export default into a const so __sfc__
    // is available for HMR injection below.
    combined = renderCode.replace(/^export\s+/, '') + '\n' +
      scriptCode.replace(
        /export\s+default\s+\/\*@__PURE__\*\/_defineComponent\(\{/,
        'const __sfc__ = /*@__PURE__*/_defineComponent({render: render,\n'
      ) + '\nexport default __sfc__'
  } else {
    combined = renderCode.replace(/^export\s+/, '') + '\n' + scriptCode + '\n__sfc__.render = render\nexport default __sfc__'
  }

  // HMR — vue-rn hot module replacement
  // On initial load, createRecord() returns true. On HMR re-execution (detected
  // by Metro's module.hot system), the factory runs again and createRecord()
  // returns false, triggering reload() which updates the component in place
  // while preserving state.
  //
  // Inside the __d() factory, `module` is the 5th parameter (the module object)
  // in Metro's factory signature:
  //   function(global, require, importDefault, importAll, module, exports, depMap)
  // We call module.hot.accept() to flag this module as an HMR accept boundary
  // so Metro's topological sort stops bubbling instead of doing a full refresh.
  combined += `
if (typeof __VUE_HMR_RUNTIME__ !== 'undefined') {
  __sfc__.__hmrId = "${id}"
  if (!__VUE_HMR_RUNTIME__.createRecord(__sfc__.__hmrId, __sfc__)) {
    __VUE_HMR_RUNTIME__.reload(__sfc__.__hmrId, __sfc__)
  }
  if (typeof module !== 'undefined' && module.hot) module.hot.accept()
}`

  // Strip TS → RN Babel
  const stripped = babel.transformSync(combined, {
    filename: filename.replace(/\.vue$/, '.ts'),
    babelrc: false, configFile: false,
    plugins: [[require('@babel/plugin-syntax-typescript'), { isTSX: true }], require('@babel/plugin-transform-typescript')],
    sourceMaps: false, retainLines: true,
  })

  return require('@react-native/metro-babel-transformer').transform({
    ...params, filename: filename.replace(/\.vue$/, '.js'), src: stripped.code,
  })
}

module.exports = { transform, getCacheKey: require('@react-native/metro-babel-transformer').getCacheKey }
