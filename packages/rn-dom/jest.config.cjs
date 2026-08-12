/**
 * Jest config — rn-dom 迁移 vitest → jest。
 * preset: @react-native/jest-preset(提供 react-native mock + babel-jest 转换)。
 * rn-dom 是 "type": "module",config 用 .cjs。
 */
module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/src/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@rasenjs)/)',
  ],
}
