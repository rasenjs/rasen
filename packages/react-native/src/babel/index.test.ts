/**
 * @rasenjs/react-native — babel plugin tests.
 *
 * Verifies the Metro HMR injection: enterHmrModule/exitHmrModule calls plus
 * module.hot.accept() are injected into files that use com(), and plain
 * modules are left untouched.
 */
import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import rasenRNBabel from './index'

function transform(code: string, filename = '/project/src/App.tsx') {
  const result = transformSync(code, {
    plugins: [[rasenRNBabel, { root: '/project' }]],
    filename,
    configFile: false,
    babelrc: false,
  })
  return result?.code ?? ''
}

describe('rasenRNBabel (HMR injection)', () => {
  it('injects enterHmrModule after the last import', () => {
    const out = transform(`
import { com } from '@rasenjs/core'
import { view } from '@rasenjs/react-native'

const App = com(() => view({}))
`)
    expect(out).toContain('enterHmrModule("src/App.tsx")')
    // The call must come after the imports.
    const importIdx = out.indexOf("from '@rasenjs/react-native'")
    const enterIdx = out.indexOf('enterHmrModule(')
    expect(enterIdx).toBeGreaterThan(importIdx)
  })

  it('injects exitHmrModule and module.hot.accept at the end', () => {
    const out = transform(`
import { com } from '@rasenjs/core'
const App = com(() => {})
`)
    expect(out).toContain('exitHmrModule()')
    expect(out).toContain('module.hot && module.hot.accept()')
  })

  it('does not inject into files without com()', () => {
    const out = transform(`
import { view } from '@rasenjs/react-native'
export const helper = () => view({})
`)
    expect(out).not.toContain('enterHmrModule')
    expect(out).not.toContain('module.hot')
  })

  it('does not double-inject when already injected', () => {
    const out = transform(`
import { com } from '@rasenjs/core'
import { enterHmrModule } from '@rasenjs/core'
enterHmrModule('x')
const App = com(() => {})
`)
    expect(out.match(/enterHmrModule\(/g)?.length ?? 0).toBe(1)
  })

  it('respects hmr: false option', () => {
    const code = `
import { com } from '@rasenjs/core'
const App = com(() => {})
`
    const result = transformSync(code, {
      plugins: [[rasenRNBabel, { hmr: false, root: '/project' }]],
      filename: '/project/src/App.tsx',
      configFile: false,
      babelrc: false,
    })
    expect(result?.code ?? '').not.toContain('enterHmrModule')
  })

  it('derives module id relative to the project root', () => {
    const out = transform(
      `import { com } from '@rasenjs/core'\nconst App = com(() => {})`,
      '/project/src/components/Counter.tsx',
    )
    expect(out).toContain('enterHmrModule("src/components/Counter.tsx")')
  })
})

/**
 * JSX elimination — the reason the RN pipeline needs no `jsx-runtime`.
 *
 * Metro has no `unplugin-auto-import` phase, so leaving JSX to the bundler
 * would compile it to `import { jsx } from 'react/jsx-runtime'`, which Metro
 * redirects at a runtime Rasen no longer ships. The plugin eliminates JSX on
 * `Program.enter`, before the RN preset's own JSX transform can fire.
 */
describe('rasenRNBabel (JSX elimination)', () => {
  /** Only the elimination pass — no HMR noise in the assertions. */
  function eliminate(code: string, filename = '/project/src/App.tsx') {
    const result = transformSync(code, {
      plugins: [[rasenRNBabel, { hmr: false, root: '/project' }]],
      filename,
      configFile: false,
      babelrc: false,
      // The real pipeline gets this from the RN preset; the test run has none.
      parserOpts: { plugins: ['jsx', 'typescript'] },
    })
    return result?.code ?? ''
  }

  it('turns a PascalCase tag into a bare call', () => {
    const out = eliminate(`
import { View, Text } from '@rasenjs/react-native'
export const App = () => <View style={{ flex: 1 }}><Text content="hi" /></View>
`)
    expect(out).toContain('View({')
    expect(out).toContain('Text({')
    expect(out).not.toContain('<View')
    expect(out).not.toContain('react/jsx-runtime')
  })

  it('drops nullish children and flattens nested runs', () => {
    const out = eliminate(`
import { View, Text } from '@rasenjs/react-native'
export const App = ({ rows, show }: any) => (
  <View>{show && <Text content="x" />}{rows.map((r: any) => <Text content={r} />)}</View>
)
`)
    expect(out).toContain('.flat(Infinity).filter(')
    expect(out).not.toContain('<View')
  })

  it('compiles a fragment through the app Fragment binding', () => {
    const out = eliminate(`
import { Text } from '@rasenjs/react-native'
export const App = () => <><Text content="a" /><Text content="b" /></>
`)
    expect(out).toContain('Fragment({')
    expect(out).not.toContain('<>')
  })

  it('leaves a module without JSX untouched', () => {
    const out = eliminate(`
import { view } from '@rasenjs/react-native'
export const helper = () => view({})
`)
    expect(out).not.toContain('.flat(Infinity)')
  })
})
