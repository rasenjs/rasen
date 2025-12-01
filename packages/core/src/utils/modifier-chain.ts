/**
 * 通用链式修饰器工具
 *
 * 特性：
 * - 链式调用：prevent.stop.capture
 * - 带括号或不带括号都行：prevent.stop 或 prevent().stop()
 * - 支持带参数的插件：debounce(300).prevent
 * - 终结时传参：prevent.debounce(fn, { debounce: 300 })
 * - 类型安全：用过的插件不能重复使用
 */

// ============================================
// 核心类型定义
// ============================================

/**
 * 修饰器插件接口
 *
 * @param K - 插件名称（字面量类型）
 * @param O - 该插件贡献的 options 类型
 */
export interface ModifierPlugin<
  K extends string = string,
  O extends object = object
> {
  /** 插件名称 */
  readonly name: K

  /**
   * 应用插件到 options
   * @param options - 当前累积的 options
   */
  apply(options: object): object

  /** 类型标记 */
  readonly _optionsType?: O
}

/**
 * 修饰器结果
 */
export interface ModifierResult<T, O extends object = object> {
  /** 被修饰的目标 */
  target: T
  /** 累积的选项 */
  options: O
}

/**
 * 终结器函数类型
 * @param target - 被修饰的目标
 * @param options - 累积的选项
 * @param plugins - 使用的插件列表（用于执行插件的运行时行为）
 */
export type ModifierFinalizer<T, R, P extends AnyPlugin = AnyPlugin> = (
  target: T,
  options: object,
  plugins: readonly P[]
) => R

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPlugin = ModifierPlugin<string, any>

// ============================================
// 类型工具
// ============================================

/** 从插件数组提取名称 */
type PluginNames<Plugins extends readonly AnyPlugin[]> = Plugins[number]['name']

/** 根据名称获取插件的 Options 类型 */
type PluginOptionsByName<
  Plugins extends readonly AnyPlugin[],
  K extends string
> =
  Extract<Plugins[number], ModifierPlugin<K, object>> extends ModifierPlugin<
    K,
    infer O
  >
    ? O
    : object

/**
 * 链式修饰器类型
 */
export type ModifierChain<
  Plugins extends readonly AnyPlugin[],
  Used extends string = never,
  Acc extends object = object,
  T = unknown,
  R = ModifierResult<T, Acc>
> =
  // 可调用：终结或带参继续
  {
    // 无参调用：返回自身（支持空括号）
    (): ModifierChain<Plugins, Used, Acc, T, R>
    // 传入目标：终结
    (target: T): R
    // 传入目标和参数：终结
    (target: T, params: object): R
    // 传入参数对象：合并参数，返回新链
    (params: object): ModifierChain<Plugins, Used, Acc, T, R>
  } & // 链式属性：未使用的插件
  {
    [K in PluginNames<Plugins> as K extends Used ? never : K]: ModifierChain<
      Plugins,
      Used | K,
      Acc & PluginOptionsByName<Plugins, K>,
      T,
      R
    >
  } & // 获取当前累积的 options
  {
    readonly options: Acc
  }

// ============================================
// 运行时实现
// ============================================

/**
 * 创建修饰器链
 *
 * @param plugins - 插件列表
 * @param finalizer - 终结器函数，接收 (target, options, plugins)
 */
export function createModifierChain<
  Plugins extends readonly AnyPlugin[],
  T = unknown,
  R = ModifierResult<T, object>
>(
  plugins: Plugins,
  finalizer?: ModifierFinalizer<T, R, Plugins[number]>
): ModifierChain<Plugins, never, object, T, R> {
  return createChainNode(
    plugins,
    {},
    finalizer as ModifierFinalizer<unknown, unknown, AnyPlugin> | undefined
  ) as ModifierChain<Plugins, never, object, T, R>
}

/**
 * 内部：创建链节点
 */
function createChainNode<Plugins extends readonly AnyPlugin[]>(
  plugins: Plugins,
  accumulated: object,
  finalizer?: ModifierFinalizer<unknown, unknown, AnyPlugin>
): ModifierChain<Plugins, never, object, unknown, unknown> {
  // 查找插件
  const pluginMap = new Map<string, AnyPlugin>()
  for (const plugin of plugins) {
    pluginMap.set(plugin.name, plugin)
  }

  // 核心函数：可被调用
  const chainFn = (targetOrParams?: unknown, params?: object): unknown => {
    // 如果没有参数，返回自身的代理（支持空括号调用）
    if (targetOrParams === undefined) {
      return proxy
    }

    // 如果是普通对象（不是函数），当作参数处理，合并到 options
    if (
      typeof targetOrParams === 'object' &&
      targetOrParams !== null &&
      typeof targetOrParams !== 'function'
    ) {
      const newOptions = { ...accumulated, ...targetOrParams }
      return createChainNode(plugins, newOptions, finalizer)
    }

    // 否则是终结调用：targetOrParams 是目标
    const finalOptions = params ? { ...accumulated, ...params } : accumulated

    if (finalizer) {
      return finalizer(targetOrParams, finalOptions, plugins)
    }

    return {
      target: targetOrParams,
      options: finalOptions
    }
  }

  // 使用 Proxy 实现链式属性访问
  const proxy = new Proxy(chainFn, {
    get(_target, prop) {
      // 特殊属性
      if (prop === 'options') {
        return accumulated
      }

      // Symbol 和内部属性
      if (
        typeof prop === 'symbol' ||
        prop === 'prototype' ||
        prop === 'constructor'
      ) {
        return undefined
      }

      // 查找插件
      const plugin = pluginMap.get(prop as string)
      if (plugin) {
        const newOptions = plugin.apply(accumulated)
        return createChainNode(plugins, newOptions, finalizer)
      }

      // 未知属性，返回 undefined
      return undefined
    },

    // 让 proxy(...args) 生效
    apply(_target, _thisArg, args) {
      return chainFn(...args)
    }
  })

  return proxy as ModifierChain<Plugins, never, object, unknown, unknown>
}

// ============================================
// 插件创建工具
// ============================================

/**
 * 创建简单的标志插件（无参数）
 */
export function createFlagPlugin<K extends string>(
  name: K
): ModifierPlugin<K, { [P in K]?: true }> {
  return {
    name,
    apply: (options) => ({ ...options, [name]: true })
  }
}

/**
 * 创建值插件（在 options 中设置指定值）
 */
export function createValuePlugin<K extends string, V>(
  name: K,
  value: V
): ModifierPlugin<K, { [P in K]?: V }> {
  return {
    name,
    apply: (options) => ({ ...options, [name]: value })
  }
}

/**
 * 创建累积插件（值会累积到数组）
 */
export function createAccumulatorPlugin<K extends string, V>(
  name: K,
  value: V
): ModifierPlugin<K, { [P in K]?: V[] }> {
  return {
    name,
    apply: (options) => {
      const existing = (options as Record<string, V[]>)[name] || []
      return { ...options, [name]: [...existing, value] }
    }
  }
}
