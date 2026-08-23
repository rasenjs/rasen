/**
 * Bundler-agnostic plugin (vite / webpack / rspack / esbuild via unplugin).
 *
 * Usage (vite):
 *   import { rasenCompile } from '@rasenjs/compiler'
 *   export default defineConfig({ plugins: [rasenCompile.vite()] })
 */

import { createUnplugin } from 'unplugin'
import { compileModule, type CompilerOptions } from './core'

export interface RasenCompilerPluginOptions extends CompilerOptions {
  /** Disable the plugin (default: enabled) */
  enabled?: boolean
}

export const rasenCompile = createUnplugin(
  (options: RasenCompilerPluginOptions = {}) => {
    const enabled = options.enabled ?? true
    return {
      name: 'rasen-compile',
      // Must run before the bundler's built-in JSX→jsxcalls conversion
      enforce: 'pre',
      transformInclude(id: string) {
        return /\.[tj]sx?$/.test(id.split('?')[0])
      },
      // Inject the __RASEN_SSR__ compile-time constant so emitted SSR
      // branches dead-code-eliminate per build target:
      //   client build → 'false' (SSR literals stripped from the bundle)
      //   ssr build    → 'true'
      //   dev          → 'true' (harmless: the branch also duck-types the
      //                  host, so it never fires for DOM elements)
      // biome-ignore lint/suspicious/noExplicitAny: vite config types vary
      config(userConfig: any, { command }: any) {
        if (command !== 'build') {
          return { define: { __RASEN_SSR__: 'true' } }
        }
        return {
          define: { __RASEN_SSR__: userConfig.build?.ssr ? 'true' : 'false' },
        }
      },
      transform(code: string, id: string) {
        if (!enabled) return null
        try {
          const result = compileModule(code, {
            ...options,
            filename: id.split('?')[0],
          })
          if (!result) return null
          return { code: result.code, map: result.map }
        } catch (error) {
          this.error(error as Error)
          return null
        }
      },
    }
  }
)
