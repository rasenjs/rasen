/**
 * @rasenjs/react-native — metro plugin tests.
 *
 * Verifies the resolveRequest intercepts (JSX runtime redirection,
 * single-instance forcing) and watchFolders merging.
 */
import { describe, it, expect, vi } from 'vitest'
import path from 'path'
import { withRasenRN } from '../index'

/** Mock package resolution: /node_modules/<pkg>/package.json. */
function mockResolve(id: string): string {
  const pkg = id.replace('/package.json', '')
  return path.join('/node_modules', pkg, 'package.json')
}

function makeConfig() {
  return withRasenRN(
    {
      resolver: { sourceExts: ['js', 'tsx'] },
      watchFolders: ['/existing'],
    },
    { resolve: mockResolve },
  )
}

describe('withRasenRN', () => {
  it('redirects react/jsx-runtime to @rasenjs/react-native/jsx-runtime', () => {
    const config = makeConfig()
    const result = config.resolver.resolveRequest(
      { resolveRequest: () => null },
      'react/jsx-runtime',
      'ios',
    )
    expect(result.type).toBe('sourceFile')
    expect(result.filePath).toBe(
      path.join('/node_modules', '@rasenjs/react-native', 'dist', 'jsx-runtime.js'),
    )
  })

  it('redirects react/jsx-dev-runtime too', () => {
    const config = makeConfig()
    const result = config.resolver.resolveRequest(
      { resolveRequest: () => null },
      'react/jsx-dev-runtime',
      'ios',
    )
    expect(result.filePath).toContain('jsx-runtime.js')
  })

  it('forces single instance for @rasenjs/rn-dom', () => {
    const config = makeConfig()
    const result = config.resolver.resolveRequest(
      { resolveRequest: () => null },
      '@rasenjs/rn-dom',
      'ios',
    )
    expect(result.filePath).toBe(
      path.join('/node_modules', '@rasenjs/rn-dom', 'dist', 'index.js'),
    )
  })

  it('forces single instance for @rasenjs/react-native', () => {
    const config = makeConfig()
    const result = config.resolver.resolveRequest(
      { resolveRequest: () => null },
      '@rasenjs/react-native',
      'ios',
    )
    expect(result.filePath).toBe(
      path.join('/node_modules', '@rasenjs/react-native', 'dist', 'index.js'),
    )
  })

  it('forces single instance for @rasenjs/core and @rasenjs/reactive-vue', () => {
    const config = makeConfig()
    for (const pkg of ['@rasenjs/core', '@rasenjs/reactive-vue']) {
      const result = config.resolver.resolveRequest(
        { resolveRequest: () => null },
        pkg,
        'ios',
      )
      expect(result.filePath).toBe(path.join('/node_modules', pkg, 'dist', 'index.js'))
    }
  })

  it('falls through to the default resolver for other modules', () => {
    const config = makeConfig()
    const fallback = vi.fn(() => ({ filePath: '/default.js', type: 'sourceFile' }))
    const result = config.resolver.resolveRequest(
      { resolveRequest: fallback },
      'some-other-module',
      'ios',
    )
    expect(fallback).toHaveBeenCalledWith(
      expect.anything(),
      'some-other-module',
      'ios',
    )
    expect(result.filePath).toBe('/default.js')
  })

  it('runs the user resolveRequest first and honors its result', () => {
    const userResolve = vi.fn(() => ({ filePath: '/user.js', type: 'sourceFile' }))
    const config = withRasenRN(
      { resolver: { resolveRequest: userResolve } },
      { resolve: mockResolve },
    )
    const result = config.resolver.resolveRequest(
      { resolveRequest: () => null },
      'react/jsx-runtime',
      'ios',
    )
    expect(userResolve).toHaveBeenCalled()
    expect(result.filePath).toBe('/user.js')
  })

  it('adds mjs to sourceExts without dropping existing ones', () => {
    const config = makeConfig()
    expect(config.resolver.sourceExts).toContain('js')
    expect(config.resolver.sourceExts).toContain('tsx')
    expect(config.resolver.sourceExts).toContain('mjs')
  })

  it('merges watchFolders with the rasen package roots', () => {
    const config = makeConfig()
    expect(config.watchFolders).toContain('/existing')
    expect(config.watchFolders).toContain(path.join('/node_modules', '@rasenjs/react-native'))
    expect(config.watchFolders).toContain(path.join('/node_modules', '@rasenjs/rn-dom'))
    expect(config.watchFolders).toContain(path.join('/node_modules', '@rasenjs/core'))
    expect(config.watchFolders).toContain(path.join('/node_modules', '@rasenjs/reactive-vue'))
  })
})
