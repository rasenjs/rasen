/**
 * @rasenjs/compiler — JSX static-hoisting compiler for Rasen.
 *
 * Bundler-agnostic: unplugin factory covers vite/webpack/rspack/esbuild;
 * `@rasenjs/compiler/babel` covers Metro / React Native.
 */

export {
  COMPILE_DIRECTIVE,
  compileModule,
  transformProgram,
  type CompilerOptions,
  type CompileModuleResult,
} from './core'
export { rasenCompile, type RasenCompilerPluginOptions } from './unplugin'
