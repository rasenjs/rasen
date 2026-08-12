/**
 * Babel config — jest 迁移用。
 * @react-native/babel-preset 编译 Flow(react-native 源码)+ TS(rn-dom 测试)。
 * rn-dom 是 "type": "module",babel 配置用 .cjs 避免 CJS/ESM 冲突。
 */
module.exports = {
  presets: ['module:@react-native/babel-preset'],
}
