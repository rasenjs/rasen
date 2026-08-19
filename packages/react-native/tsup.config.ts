import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'jsx-runtime': 'src/jsx-runtime.ts',
    'metro/index': 'src/metro/index.ts',
    'babel/index': 'src/babel/index.ts',
    'devtools/index': 'src/devtools/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
  // 不打包任何外部依赖
  external: [
    /^@rasenjs\/.*/,
    /^react-native(\/.*)?$/,
    'socket.io-client',
    '@babel/core',
    '@babel/types',
  ],
  // 禁用 require 的包装
  shims: false,
  // 保持原始 require 调用
  banner: {
    js: '/* @rasenjs/react-native */'
  },
  // 复制 CJS-only 的 server 脚本与 web 前端到 dist
  onSuccess:
    'mkdir -p dist/devtools/web && cp src/devtools/server.cjs dist/devtools/server.cjs && cp src/devtools/web/index.html dist/devtools/web/index.html',
})
