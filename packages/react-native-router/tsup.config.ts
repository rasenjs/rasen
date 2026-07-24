import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-native',
    '@react-navigation/native'
  ],
  env: {
    RCT_NEW_ARCH_ENABLED: '1'
  }
})
