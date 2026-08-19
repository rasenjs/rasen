/**
 * @rasenjs/react-native — babel plugin tests.
 *
 * Verifies the Metro HMR injection: enterHmrModule/exitHmrModule calls plus
 * module.hot.accept() are injected into files that use com(), and plain
 * modules are left untouched.
 */
import { describe, it, expect } from 'vitest'
import { transformSync } from '@babel/core'
import rasenRNBabel from '../index'

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
