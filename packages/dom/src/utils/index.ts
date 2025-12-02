/**
 * DOM 工具函数
 */

export {
  modifier,
  prevent,
  stop,
  capture,
  once,
  self,
  mod,
  key,
  // 按键修饰器快捷入口
  enter,
  esc,
  tab,
  space,
  del,
  up,
  down,
  left,
  right,
  // 事件委托
  delegated,
  // 插件导出
  preventPlugin,
  stopPlugin,
  capturePlugin,
  oncePlugin,
  selfPlugin,
  eventPlugins,
  keyPlugins,
  enterPlugin,
  escPlugin,
  tabPlugin,
  spacePlugin,
  deletePlugin,
  upPlugin,
  downPlugin,
  leftPlugin,
  rightPlugin,
  type ModifierOptions,
  type ModifiedHandler,
  type EventModifierPlugin
} from './event-modifiers'
