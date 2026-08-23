/**
 * Babel plugin adapter — for Metro / React Native and any babel pipeline.
 *
 * Usage (babel.config.js):
 *   plugins: [require('@rasenjs/compiler/babel').default]
 */

import { COMPILE_DIRECTIVE, transformProgram, type CompilerOptions } from './core'

export interface BabelPluginAPI {
  types: typeof import('@babel/types')
}

export default function rasenCompileBabel(
  _api: BabelPluginAPI,
  options: CompilerOptions & { filename?: string } = {}
) {
  return {
    name: 'rasen-compile',
    visitor: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Program(programPath: any, state: any) {
        const filename: string = state.file?.opts?.filename ?? 'file.tsx'
        const code = state.file?.code
        if (typeof code !== 'string' || !code.includes(COMPILE_DIRECTIVE)) {
          return
        }

        const stats = transformProgram(programPath.node, code, {
          ...options,
          templateSource:
            (state.opts && state.opts.templateSource) || options.templateSource,
        })
        if (stats === null) return

        // eslint-disable-next-line no-console
        if (process.env.RASEN_COMPILER_DEBUG) {
          console.log(
            `[rasen-compile] ${filename}: ${stats.compiled} compiled, ${stats.fellBack} fell back`
          )
        }
      },
    },
  }
}
