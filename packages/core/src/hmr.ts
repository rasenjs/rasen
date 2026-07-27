/**
 * hmr - HMR 共享状态
 *
 * 模块上下文栈（Vite 插件注入 enterHmrModule/exitHmrModule）
 * + 组件注册表（com() 内部使用）
 */

// ============================================================
// 模块上下文
// ============================================================

export const hmrState = {
  active: false,
  stack: [] as Array<{ id: string; nextIndex: number }>
}

export function enterHmrModule(id: string): void {
  hmrState.active = true
  hmrState.stack.push({ id, nextIndex: 0 })
}

export function exitHmrModule(): void {
  hmrState.stack.pop()
}

// 组件注册表（com() 内部使用，不导出到 public API）

const registry = new Map<string, HotEntry>()

export function getRegistryEntry(key: string): HotEntry | undefined {
  return registry.get(key)
}

export function setRegistryEntry(key: string, entry: HotEntry): void {
  registry.set(key, entry)
}

interface HotEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  impl: (...args: any[]) => any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapper: (...args: any[]) => any
  instances: Map<symbol, HotInstance>
  /** HMR 重执行后标记已消费，根层 mount 再调 wrapper 时空返回 */
  _consumed?: boolean
}

interface HotInstance {
  host: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any[]
  unmount: (() => void) | null
}
