/**
 * @rasenjs/vue-rn Metro transformer for Vue SFC (.vue) files.
 *
 * Usage in metro.config.js:
 *
 *   babelTransformerPath: require.resolve('@rasenjs/vue-rn/dist/transformer/index'),
 *   resolver.sourceExts: [...getDefaultConfig(__dirname).resolver.sourceExts, 'vue']
 */

import { createHash } from 'crypto'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const vueCompiler = require('@vue/compiler-sfc')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createSimpleExpression } = require('@vue/compiler-core')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const babel = require('@babel/core')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolve: resolveCSS } = require('./class-resolvers')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cssToMap } = require('./class-resolvers/parse')
const parseCSS = cssToMap

const RN_BUILT_IN_TAGS = new Set(
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@rasenjs/rn-dom/elements').getAllTags() as string[]
)

let _resolverInit = false
let _styleMap = new Map<string, Record<string, unknown>>()

interface ASTNode {
  type: number
  props?: ASTProp[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

interface ASTProp {
  type: number
  name?: string
  arg?: { content: string }
  exp?: { type: number; children?: string[]; content?: string }
  value?: { content: string }
  modifiers?: string[]
}

function classToStyleNT(node: ASTNode): void {
  if (node.type !== 1 || !node.props) return
  const idx = node.props.findIndex(p => p.type === 6 && p.name === 'class')
  if (idx === -1) return

  const str = node.props[idx].value?.content || ''
  const classes = str.trim().split(/\s+/)
  let r: Record<string, unknown> | null = null
  for (const n of classes) {
    const s = _styleMap.get(n)
    if (s) { if (!r) r = {}; Object.assign(r, s) }
  }
  if (!r) return

  node.props.splice(idx, 1)
  const expr = `({ ${Object.entries(r).map(([k, v]) => {
    const key = /^[a-z]\w*$/i.test(k) ? k : `'${k}'`
    const val = typeof v === 'string' ? `'${(v as string).replace(/'/g, "\\'")}'` : String(v)
    return `${key}: ${val}`
  }).join(', ')} })`

  const si = node.props.findIndex(p => p.type === 7 && p.name === 'bind' && p.arg?.content === 'style')
  if (si >= 0) {
    const existing = node.props[si].exp!
    if (existing.type === 8) {
      existing.children![0] = `[${expr}, ${existing.children![0].slice(1)}`
    } else {
      const existingSrc = existing.content!
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

interface TransformParams {
  filename: string
  src: string
  [key: string]: unknown
}

async function transform(params: TransformParams): Promise<{ code: string; map: unknown }> {
  const { filename, src } = params

  if (!filename.endsWith('.vue')) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@react-native/metro-babel-transformer').transform(params)
  }

  if (!_resolverInit) {
    _resolverInit = true
    try { _styleMap = (await resolveCSS({ projectRoot: process.cwd() })).styleMap }
    catch { /* no CSS resolver */ }
  }

  const id = createHash('md5').update(filename).digest('hex').slice(0, 8)
  const { descriptor, errors } = vueCompiler.parse(src, { filename })
  if (errors.length > 0) throw new Error(`[vue-transformer] ${filename}: ${errors[0].message || errors[0]}`)

  // Script
  let scriptCode: string, scriptBindings: Record<string, unknown> | undefined, isScriptSetup = false
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
        mode: 'module',
        bindingMetadata: scriptBindings,
        isCustomElement: (tag: string) => RN_BUILT_IN_TAGS.has(tag) && !(scriptBindings && tag in scriptBindings),
        expressionPlugins: ['typescript'],
        nodeTransforms: _styleMap.size > 0 ? [classToStyleNT] : [],
      },
    })
    if (c.errors.length > 0) throw new Error(`[vue-transformer] ${filename}: ${c.errors[0].message || c.errors[0]}`)
    renderCode = c.code
  }

  // Merge
  let combined: string
  if (isScriptSetup) {
    combined = renderCode.replace(/^export\s+/, '') + '\n' +
      scriptCode.replace(
        /export\s+default\s+\/\*@__PURE__\*\/_defineComponent\(\{/,
        'const __sfc__ = /*@__PURE__*/_defineComponent({render: render,\n'
      ) + '\nexport default __sfc__'
  } else {
    combined = renderCode.replace(/^export\s+/, '') + '\n' + scriptCode + '\n__sfc__.render = render\nexport default __sfc__'
  }

  // Style module — parse <style module> blocks into __cssModules
  if (descriptor.styles && descriptor.styles.length > 0) {
    const cssModules: Record<string, Record<string, unknown>> = {}
    let hasModules = false
    for (const styleBlock of descriptor.styles) {
      if (styleBlock.module) {
        hasModules = true
        const moduleName = typeof styleBlock.module === 'string' ? styleBlock.module : '$style'
        const classMap: Record<string, unknown> = {}
        for (const [key, value] of parseCSS(styleBlock.content)) {
          classMap[key] = value
        }
        cssModules[moduleName] = classMap
      }
    }
    if (hasModules) {
      combined += `\n__sfc__.__cssModules = ${JSON.stringify(cssModules)}`
    }
  }

  // HMR
  combined += `
if (typeof __VUE_HMR_RUNTIME__ !== 'undefined') {
  __sfc__.__hmrId = "${id}"
  __VUE_HMR_RUNTIME__.createRecord(__sfc__.__hmrId, __sfc__)
  if (typeof module !== 'undefined' && module.hot) {
    module.hot.accept(function() {
      __VUE_HMR_RUNTIME__.rerender(__sfc__.__hmrId, __sfc__.render)
    })
  }
}`

  // Strip TS → RN Babel
  const stripped = babel.transformSync(combined, {
    filename: filename.replace(/\.vue$/, '.ts'),
    babelrc: false, configFile: false,
    plugins: [
      [require('@babel/plugin-syntax-typescript'), { isTSX: true }],
      require('@babel/plugin-transform-typescript'),
    ],
    sourceMaps: false, retainLines: true,
  })

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@react-native/metro-babel-transformer').transform({
    ...params,
    filename: filename.replace(/\.vue$/, '.js'),
    src: stripped.code as string,
    options: { ...params.options, hot: false },
  })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCacheKey } = require('@react-native/metro-babel-transformer')

export { transform, getCacheKey }
