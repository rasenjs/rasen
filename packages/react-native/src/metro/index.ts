/**
 * @rasenjs/react-native — Metro configuration plugin
 *
 * Wraps all the Metro config a Rasen RN consumer needs (JSX runtime
 * redirection, single-instance resolution, watch folders) so the user only
 * writes one line in metro.config.js:
 *
 * ```js
 * const { getDefaultConfig } = require('@react-native/metro-config')
 * const { withRasenRN } = require('@rasenjs/react-native/metro')
 *
 * module.exports = withRasenRN(getDefaultConfig(__dirname))
 * ```
 *
 * Why these intercepts are needed:
 *  - `react/jsx-runtime` / `react/jsx-dev-runtime`: RN's babel preset compiles
 *    JSX to `import { jsx } from 'react/jsx-runtime'`. Rasen renders without
 *    React, so these are redirected to `@rasenjs/react-native/jsx-runtime`.
 *  - `@rasenjs/*`: each package's `exports` maps `import` → `dist/index.js`
 *    and `require` → `dist/index.cjs`. Metro can resolve both conditions,
 *    producing TWO module instances (module-level state splits — e.g. the
 *    reactive runtime singleton, the tag registry). Forcing a single entry
 *    keeps one instance.
 */

import path from 'path'

interface ResolveContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveRequest: (context: any, moduleName: string, platform: string | undefined) => any
  [key: string]: unknown
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MetroConfig = Record<string, any>

export interface WithRasenRNOptions {
  /**
   * Package resolution function (defaults to `require.resolve`). Injectable
   * for testing.
   */
  resolve?: (id: string) => string
}

/** Resolve a package's root directory from its package.json. */
function packageRoot(resolve: (id: string) => string, pkgName: string): string {
  // Prefer package.json when the package's exports expose it.
  try {
    return path.dirname(resolve(`${pkgName}/package.json`))
  } catch {
    // Otherwise derive the root from the main entry (dist/index.js → root).
    return path.resolve(resolve(pkgName), '../..')
  }
}

/** Resolve a package's ESM entry (dist/index.js) for single-instance forcing. */
function esmEntry(resolve: (id: string) => string, pkgName: string): string {
  return path.join(packageRoot(resolve, pkgName), 'dist', 'index.js')
}

/** Resolve a package's jsx-runtime entry. */
function jsxRuntimeEntry(resolve: (id: string) => string, pkgName: string): string {
  return path.join(packageRoot(resolve, pkgName), 'dist', 'jsx-runtime.js')
}

/**
 * Merge the Metro config needed by @rasenjs/react-native into the user's
 * config.
 *
 * @param config - the user's Metro config (usually from getDefaultConfig)
 * @param options - optional overrides (e.g. a custom resolver for testing)
 * @returns the merged config
 */
export function withRasenRN(
  config: MetroConfig,
  options: WithRasenRNOptions = {},
): MetroConfig {
  const resolve = options.resolve ?? ((id: string) => require.resolve(id))

  // Package roots (compatible with any node_modules layout).
  const reactNativeRoot = packageRoot(resolve, '@rasenjs/react-native')
  const rnDomRoot = packageRoot(resolve, '@rasenjs/rn-dom')
  const coreRoot = packageRoot(resolve, '@rasenjs/core')
  const reactiveVueRoot = packageRoot(resolve, '@rasenjs/reactive-vue')

  // Preserve the user's own resolveRequest (if any) — run it first, fall back.
  const userResolveRequest = config?.resolver?.resolveRequest

  // Preserve the user's existing sourceExts.
  const baseExts: string[] = config?.resolver?.sourceExts ?? []
  const sourceExts = [...new Set([...baseExts, 'mjs'])]

  // Preserve the user's existing watchFolders.
  const baseWatchFolders: string[] = config?.watchFolders ?? []

  return {
    ...config,
    resolver: {
      ...(config?.resolver ?? {}),
      sourceExts,
      resolveRequest: (
        context: ResolveContext,
        moduleName: string,
        platform: string | undefined,
      ) => {
        // User's custom intercept wins.
        if (userResolveRequest) {
          const result = userResolveRequest(context, moduleName, platform)
          if (result) return result
        }

        // JSX runtime → @rasenjs/react-native/jsx-runtime (no React).
        if (moduleName === 'react/jsx-runtime' || moduleName === 'react/jsx-dev-runtime') {
          return {
            filePath: jsxRuntimeEntry(resolve, '@rasenjs/react-native'),
            type: 'sourceFile',
          }
        }

        // Force single instance for rasen packages (import/require split).
        if (moduleName === '@rasenjs/react-native') {
          return { filePath: esmEntry(resolve, '@rasenjs/react-native'), type: 'sourceFile' }
        }
        if (moduleName === '@rasenjs/react-native/jsx-runtime' ||
            moduleName === '@rasenjs/react-native/jsx-dev-runtime') {
          return { filePath: jsxRuntimeEntry(resolve, '@rasenjs/react-native'), type: 'sourceFile' }
        }
        if (moduleName === '@rasenjs/rn-dom') {
          return { filePath: esmEntry(resolve, '@rasenjs/rn-dom'), type: 'sourceFile' }
        }
        if (moduleName === '@rasenjs/core') {
          return { filePath: esmEntry(resolve, '@rasenjs/core'), type: 'sourceFile' }
        }
        if (moduleName === '@rasenjs/reactive-vue') {
          return { filePath: esmEntry(resolve, '@rasenjs/reactive-vue'), type: 'sourceFile' }
        }

        return context.resolveRequest(context, moduleName, platform)
      },
    },
    watchFolders: [
      ...new Set([...baseWatchFolders, reactNativeRoot, rnDomRoot, coreRoot, reactiveVueRoot]),
    ],
  }
}

export default withRasenRN
