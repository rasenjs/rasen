/**
 * @rasenjs/vite-plugin-rasen - Vite plugin for Rasen HMR
 *
 * 为含 com() 的文件注入 HMR 运行时。
 * 将 enterHmrModule/exitHmrModule 包裹在模块前后，
 * 并在末尾注入 acceptHmr。
 *
 * 用户零配置。
 */

import type { Plugin, ResolvedConfig } from 'vite'
import { relative } from 'path'

export interface RasenHMRPluginOptions {
  enabled?: boolean
  exclude?: string[]
}

const IMPORT_LINE_RE = /^import\s+/m
const COM_CALL_RE = /\bcom\s*\(/

export function rasenHMR(options: RasenHMRPluginOptions = {}): Plugin {
  let config: ResolvedConfig
  const enabled = options.enabled ?? true
  const excludeSet = new Set(options.exclude ?? ['node_modules', '/dist/', '/.yarn/'])

  return {
    name: 'rasen:hmr',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    transform(code: string, id: string) {
      if (!enabled) return
      if (config.command === 'build') return
      if (isExcluded(id, excludeSet)) return
      if (!/\.(tsx?|jsx?)$/.test(id)) return
      if (!COM_CALL_RE.test(code)) return
      if (id.includes('node_modules')) return
      if (code.includes('enterHmrModule(')) return

      const moduleId = relative(config.root, id)

      // 在最后一个 import 后注入 enterHmrModule
      const lines = code.split('\n')
      let lastImport = -1
      for (let i = 0; i < lines.length; i++) {
        if (IMPORT_LINE_RE.test(lines[i])) lastImport = i
      }
      let pos = 0
      for (let i = 0; i <= lastImport; i++) pos += lines[i].length + 1

      const before = code.slice(0, pos)
      const after = code.slice(pos)

      return {
        code: before +
          `import { enterHmrModule, exitHmrModule } from '@rasenjs/core';\n` +
          `enterHmrModule('${moduleId}');\n\n` +
          after +
          `\n\nexitHmrModule();\n/* rsen-hmr */\nimport.meta.hot && import.meta.hot.accept();`,
        map: null
      }
    }
  }
}

function isExcluded(id: string, exclusions: Set<string>): boolean {
  for (const p of exclusions) { if (id.includes(p)) return true }
  return false
}
