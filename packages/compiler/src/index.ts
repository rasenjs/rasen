/**
 * @rasenjs/compiler — JSX static-hoisting compiler for Rasen.
 *
 * Bundler-agnostic: unplugin factory covers vite/webpack/rspack/esbuild;
 * `@rasenjs/compiler/babel` covers Metro / React Native.
 */

export {
  COMPILE_DIRECTIVE,
  DEFAULT_INTRINSIC_TAGS,
  compileModule,
  transformProgram,
  type CompilerOptions,
  type CompileModuleResult,
} from './core'
export { rasenCompile, type RasenCompilerPluginOptions } from './unplugin'
export { transformJsxExpressions } from './jsx-transform'
export { injectHmr, usesCom, hasHmrWrapping } from './hmr'
