import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // 不打包任何外部依赖
  external: [
    /^@rasenjs\/.*/,
    /^react-native(\/.*)?$/
  ],
  // 禁用 require 的包装
  shims: false,
  // 保持原始 require 调用
  banner: {
    js: '/* @rasenjs/react-native */'
  }
})
