import {
  switchCase as coreSwitchCase,
  type Mountable,
  type PropValue
} from '@rasenjs/core'
import { hostHooks } from '../host-hooks'

/**
 * switchCase 组件 - 多分支条件渲染（DOM 优化版）
 *
 * 在 core 的 switchCase 基础上，提供 DOM 特定优化：
 * - 使用 Comment 节点作为标记
 * - 精确控制插入位置
 *
 * @example
 * // 基础用法
 * switchCase({
 *   value: () => currentTab,
 *   cases: {
 *     home: () => HomeView(),
 *     profile: () => ProfileView(),
 *     settings: () => SettingsView(),
 *   },
 *   default: () => NotFoundView()
 * })
 *
 * // 路由场景
 * switchCase({
 *   value: () => router.current?.key,
 *   cases: {
 *     home: () => HomePage(),
 *     user: (key) => UserPage({ key }),
 *   },
 *   default: () => NotFound()
 * })
 */
export function switchCase<K extends string = string>(config: {
  /** 响应式的值，用于匹配 cases */
  value: PropValue<K | null | undefined>

  /** 分支映射：key -> 组件工厂 */
  cases: Partial<Record<K, (key: K) => Mountable<HTMLElement>>>

  /** 默认分支（无匹配时） */
  default?: () => Mountable<HTMLElement>

  /**
   * 是否缓存已创建的分支
   * - false（默认）：切换时销毁旧分支
   * - true：保留已创建的分支，切换时只隐藏/显示（需要平台支持）
   */
  cache?: boolean
}): Mountable<HTMLElement> {
  return coreSwitchCase<HTMLElement, K, Node>({
    ...config,
    ...hostHooks
  })
}
