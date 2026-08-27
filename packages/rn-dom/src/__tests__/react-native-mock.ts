/**
 * react-native mock — 供 vitest 解析（react-native 的 index.js 是 Flow 文件，
 * esbuild/rollup 无法解析 `import typeof` 语法）。
 *
 * 仅导出测试用到的成员；各测试文件仍可用 vi.mock('react-native') 覆盖行为。
 */

export const Platform = {
  OS: 'ios',
  select: (s: Record<string, unknown>) => s.ios ?? s.default
}

export const Keyboard = {
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
  dismiss: () => {}
}

export const StatusBar = {}

export const AppRegistry = {
  registerComponent: () => {},
  registerConfig: () => {},
  runApplication: () => {}
}

export default { Platform, Keyboard, StatusBar, AppRegistry }