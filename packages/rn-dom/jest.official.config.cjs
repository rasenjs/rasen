/**
 * Jest config — 官方 react-native 测试用例(对照基准)。
 *
 * 只用 @react-native/jest-preset 自带的官方 setup(jest/setup.js),
 * 不加载 rn-dom 的 src/__tests__/setup.ts —— 后者 mock 了 react-native,
 * 会破坏官方测试所需的真实 RN 组件(View/Text 等)。
 * 用户决策:与官方 setup 冲突时,沿用官方的,保证对照基准准确。
 */
module.exports = {
  preset: '@react-native/jest-preset',
  // 官方测试命名:View-test.js / Text-test.js / FlatList-test.js(以及 -itest.js)
  testMatch: ['**/src/__tests__/official/**/*-test.js', '**/src/__tests__/official/**/*.test.js'],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/)',
  ],
  // 对齐官方 RN snapshot 序列化格式:Object { } / Array [ ](jest 29 默认
  // printBasicPrototype:false 输出 { } / [ ],会造成纯格式 diff)。
  snapshotFormat: { printBasicPrototype: true, escapeString: false },
}
