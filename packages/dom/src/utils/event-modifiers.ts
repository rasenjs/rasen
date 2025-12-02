/**
 * 事件修饰器工具
 *
 * 基于 @rasenjs/core 的通用装饰器链实现
 *
 * 提供两种使用方式：
 * 1. 底层函数：modifier(fn, { prevent: true, stop: true })
 * 2. 链式 API：prevent.stop(fn) 或 stop.prevent.once(fn)
 *
 * 支持两种语法风格：
 * - prevent.stop(fn)
 * - prevent().stop()(fn)
 */

import {
  createModifierChain,
  type ModifierPlugin as CoreModifierPlugin
} from '@rasenjs/core'

// ============================================
// 事件修饰器插件接口
// ============================================

/**
 * 事件修饰器插件 - 扩展 core 的插件接口
 */
export interface EventModifierPlugin<
  E extends Event = Event,
  K extends string = string,
  V = boolean
> extends CoreModifierPlugin<K, { [P in K]?: V }> {
  /**
   * 过滤器：返回 false 则不执行后续处理
   */
  filter?: (event: E, options: Record<string, unknown>) => boolean

  /**
   * 处理器：在原始函数之前执行
   */
  handle?: (event: E, options: Record<string, unknown>) => void
}

// ============================================
// 事件修饰器插件定义
// ============================================

/**
 * prevent 插件 - 阻止默认行为
 */
export const preventPlugin: EventModifierPlugin<Event, 'prevent', boolean> = {
  name: 'prevent',
  apply: (options) => ({ ...options, prevent: true }),
  handle: (event: Event, options: Record<string, unknown>) => {
    if (options.prevent) {
      event.preventDefault()
    }
  }
}

/**
 * stop 插件 - 阻止事件冒泡
 */
export const stopPlugin: EventModifierPlugin<Event, 'stop', boolean> = {
  name: 'stop',
  apply: (options) => ({ ...options, stop: true }),
  handle: (event: Event, options: Record<string, unknown>) => {
    if (options.stop) {
      event.stopPropagation()
    }
  }
}

/**
 * capture 插件 - 使用捕获阶段
 * 注意：capture 不在 handle 中处理，而是通过返回值附加到 handler 上
 */
export const capturePlugin: EventModifierPlugin<Event, 'capture', boolean> = {
  name: 'capture',
  apply: (options) => ({ ...options, capture: true })
}

/**
 * once 插件 - 只执行一次
 * 注意：once 不在 handle 中处理，而是通过返回值附加到 handler 上
 */
export const oncePlugin: EventModifierPlugin<Event, 'once', boolean> = {
  name: 'once',
  apply: (options) => ({ ...options, once: true })
}

/**
 * self 插件 - 只在目标元素上触发
 */
export const selfPlugin: EventModifierPlugin<Event, 'self', boolean> = {
  name: 'self',
  apply: (options) => ({ ...options, self: true }),
  filter: (event: Event, options: Record<string, unknown>) => {
    if (options.self && event.target !== event.currentTarget) {
      return false
    }
    return true
  }
}

/**
 * 所有事件修饰器插件
 */
export const eventPlugins = [
  preventPlugin,
  stopPlugin,
  capturePlugin,
  oncePlugin,
  selfPlugin
] as const

// ============================================
// 按键修饰器插件
// ============================================

/**
 * 创建按键修饰器插件
 */
function createKeyPlugin<K extends string>(
  name: K,
  keys: string[]
): EventModifierPlugin<Event, K, boolean> {
  return {
    name,
    apply: (options: object) => ({ ...options, [name]: true }),
    filter: (event: Event, options: Record<string, unknown>) => {
      if (options[name] && !keys.includes((event as KeyboardEvent).key)) {
        return false
      }
      return true
    }
  }
}

export const enterPlugin = createKeyPlugin('enter', ['Enter'])
export const escPlugin = createKeyPlugin('esc', ['Escape'])
export const tabPlugin = createKeyPlugin('tab', ['Tab'])
export const spacePlugin = createKeyPlugin('space', [' '])
export const deletePlugin = createKeyPlugin('delete', ['Delete', 'Backspace'])
export const upPlugin = createKeyPlugin('up', ['ArrowUp'])
export const downPlugin = createKeyPlugin('down', ['ArrowDown'])
export const leftPlugin = createKeyPlugin('left', ['ArrowLeft'])
export const rightPlugin = createKeyPlugin('right', ['ArrowRight'])

/**
 * 所有按键修饰器插件
 */
export const keyPlugins = [
  enterPlugin,
  escPlugin,
  tabPlugin,
  spacePlugin,
  deletePlugin,
  upPlugin,
  downPlugin,
  leftPlugin,
  rightPlugin
] as const

// ============================================
// 包装后的处理器类型
// ============================================

/**
 * 包装后的事件处理器
 */
export interface ModifiedHandler<E extends Event = Event> {
  (event: E): void
  /** addEventListener 的 capture 选项 */
  capture?: boolean
  /** addEventListener 的 once 选项 */
  once?: boolean
  /** 原始选项（用于调试） */
  __modifiers?: Record<string, unknown>
}

// ============================================
// 事件修饰器链类型（专用于事件处理）
// ============================================

/** 事件处理函数类型 */
type EventHandler = (event: Event) => void

/** 所有可用的修饰器名称 */
type ModifierName =
  | 'prevent'
  | 'stop'
  | 'capture'
  | 'once'
  | 'self'
  | 'enter'
  | 'esc'
  | 'tab'
  | 'space'
  | 'delete'
  | 'up'
  | 'down'
  | 'left'
  | 'right'

/**
 * 事件修饰器链类型
 * 支持链式调用，且每个修饰器只能使用一次
 */
export type EventModifierChain<Used extends ModifierName = never> = {
  /** 调用链终结：传入事件处理函数，返回修饰后的处理器 */
  (handler: EventHandler): ModifiedHandler<Event>
  /** 空调用：返回自身 */
  (): EventModifierChain<Used>
} & {
  /** 链式属性：未使用的修饰器 */
  [K in Exclude<ModifierName, Used>]: EventModifierChain<Used | K>
} & {
  /** 当前累积的选项 */
  readonly options: object
}

// ============================================
// 创建自定义 finalizer
// ============================================

/**
 * 事件修饰器的 finalizer
 * 将 capture/once 附加到返回的 handler 上
 */
function eventFinalizer(
  fn: (event: Event) => void,
  options: object,
  plugins: readonly EventModifierPlugin[]
): ModifiedHandler<Event> {
  const opts = options as Record<string, unknown>
  const handler: ModifiedHandler<Event> = (event: Event) => {
    // 先执行 filter
    for (const plugin of plugins) {
      if (plugin.filter && !plugin.filter(event, opts)) {
        return
      }
    }

    // 执行 handle（在原始函数之前）
    for (const plugin of plugins) {
      if (plugin.handle) {
        plugin.handle(event, opts)
      }
    }

    // 执行原始处理器
    fn(event)
  }

  // 附加 addEventListener 选项
  if (opts.capture) handler.capture = true
  if (opts.once) handler.once = true
  handler.__modifiers = opts

  return handler
}

// ============================================
// 创建链式 API
// ============================================

// 合并所有插件（保留完整类型信息）
const allEventPlugins = [...eventPlugins, ...keyPlugins] as const

// 内部使用 createModifierChain 创建运行时实现
const _mod = createModifierChain<
  typeof allEventPlugins,
  EventHandler,
  ModifiedHandler<Event>
>(allEventPlugins, eventFinalizer)

/**
 * mod - 通用事件修饰器入口
 *
 * @example
 * onClick: mod.prevent.stop(fn)
 * onKeydown: mod.enter.prevent(fn)
 */
export const mod: EventModifierChain = _mod as unknown as EventModifierChain

/**
 * prevent - 阻止默认行为
 *
 * @example
 * onClick: prevent(handleClick)
 * onClick: prevent.stop(handleClick)
 */
export const prevent: EventModifierChain<'prevent'> =
  mod.prevent as EventModifierChain<'prevent'>

/**
 * stop - 阻止事件冒泡
 *
 * @example
 * onClick: stop(handleClick)
 * onClick: stop.prevent(handleClick)
 */
export const stop: EventModifierChain<'stop'> =
  mod.stop as EventModifierChain<'stop'>

/**
 * capture - 使用捕获阶段
 *
 * @example
 * onClick: capture(handleClick)
 * onClick: capture.once(handleClick)
 */
export const capture: EventModifierChain<'capture'> =
  mod.capture as EventModifierChain<'capture'>

/**
 * once - 只执行一次
 *
 * @example
 * onClick: once(handleClick)
 * onClick: once.prevent(handleClick)
 */
export const once: EventModifierChain<'once'> =
  mod.once as EventModifierChain<'once'>

/**
 * self - 只在目标元素上触发
 *
 * @example
 * onClick: self(handleClick)
 * onClick: self.stop(handleClick)
 */
export const self: EventModifierChain<'self'> =
  mod.self as EventModifierChain<'self'>

// ============================================
// 按键修饰器入口
// ============================================

/**
 * key - 按键修饰器入口
 *
 * @example
 * onKeydown: key.enter(handleSubmit)
 * onKeydown: key.enter.prevent(handleSubmit)
 * onKeydown: key.esc(handleCancel)
 */
export const key = {
  enter: mod.enter as EventModifierChain<'enter'>,
  esc: mod.esc as EventModifierChain<'esc'>,
  tab: mod.tab as EventModifierChain<'tab'>,
  space: mod.space as EventModifierChain<'space'>,
  delete: mod.delete as EventModifierChain<'delete'>,
  up: mod.up as EventModifierChain<'up'>,
  down: mod.down as EventModifierChain<'down'>,
  left: mod.left as EventModifierChain<'left'>,
  right: mod.right as EventModifierChain<'right'>
}

// 单独导出按键修饰器，便于直接使用
export const enter: EventModifierChain<'enter'> =
  mod.enter as EventModifierChain<'enter'>
export const esc: EventModifierChain<'esc'> =
  mod.esc as EventModifierChain<'esc'>
export const tab: EventModifierChain<'tab'> =
  mod.tab as EventModifierChain<'tab'>
export const space: EventModifierChain<'space'> =
  mod.space as EventModifierChain<'space'>
export const del: EventModifierChain<'delete'> =
  mod.delete as EventModifierChain<'delete'> // delete 是保留字
export const up: EventModifierChain<'up'> = mod.up as EventModifierChain<'up'>
export const down: EventModifierChain<'down'> =
  mod.down as EventModifierChain<'down'>
export const left: EventModifierChain<'left'> =
  mod.left as EventModifierChain<'left'>
export const right: EventModifierChain<'right'> =
  mod.right as EventModifierChain<'right'>

// ============================================
// 底层 modifier 函数（兼容旧 API）
// ============================================

/**
 * 修饰器配置选项（兼容旧 API）
 */
export interface ModifierOptions {
  /** 调用 event.preventDefault() */
  prevent?: boolean
  /** 调用 event.stopPropagation() */
  stop?: boolean
  /** 使用捕获阶段 (通过返回值传递给 addEventListener) */
  capture?: boolean
  /** 只执行一次后自动移除 (通过返回值传递给 addEventListener) */
  once?: boolean
  /** 只在 event.target === event.currentTarget 时触发 */
  self?: boolean
  /** 事件委托选择器 */
  delegateSelector?: string
}

/**
 * 底层修饰器函数
 *
 * @example
 * const handler = modifier(handleClick, { prevent: true, stop: true })
 * element.addEventListener('click', handler)
 */
export function modifier<E extends Event = Event>(
  fn: (event: E) => void,
  options: ModifierOptions = {}
): ModifiedHandler<E> {
  const { prevent, stop, capture, once, self, delegateSelector } = options

  const handler: ModifiedHandler<E> = (event: E) => {
    // delegated 修饰器：只在匹配选择器的元素上触发
    if (delegateSelector) {
      const target = event.target as Element
      if (!target || typeof target.closest !== 'function') {
        return
      }
      const delegateTarget = target.closest(delegateSelector)
      if (!delegateTarget) {
        return
      }
      // 将委托目标附加到事件上，便于处理器访问
      ;(event as E & { delegateTarget: Element }).delegateTarget = delegateTarget
    }

    // self 修饰器：只在目标元素上触发
    if (self && event.target !== event.currentTarget) {
      return
    }

    // prevent 修饰器
    if (prevent) {
      event.preventDefault()
    }

    // stop 修饰器
    if (stop) {
      event.stopPropagation()
    }

    // 执行原始处理器
    fn(event)
  }

  // 附加 addEventListener 选项
  if (capture) handler.capture = true
  if (once) handler.once = true
  handler.__modifiers = options as Record<string, unknown>

  return handler
}

// ============================================
// delegated 修饰符 - 事件委托
// ============================================

/**
 * delegated - 事件委托修饰符
 *
 * 在父元素上监听事件，但只响应来自匹配选择器的子元素的事件
 *
 * @example
 * ul({
 *   onClick: delegated('li')(handleItemClick),
 *   onClick: delegated('li').stop(handleItemClick),
 *   onClick: prevent.delegated('.btn')(handleClick),
 *   children: items.map(item => li({ ... }))
 * })
 *
 * // 在处理器中可以通过 event.delegateTarget 访问匹配的元素
 * function handleItemClick(event) {
 *   const li = event.delegateTarget // 匹配的 li 元素
 *   console.log(li.textContent)
 * }
 */
export function delegated(selector: string) {
  return function <E extends Event = Event>(
    fn: (event: E & { delegateTarget: Element }) => void
  ): ModifiedHandler<E> {
    return modifier(fn as (event: E) => void, { delegateSelector: selector })
  }
}
