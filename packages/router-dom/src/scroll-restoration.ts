/**
 * @rasenjs/router-dom - Scroll Restoration
 *
 * DOM 平台特定的滚动位置保存和恢复实现
 *
 * 在导航时自动保存和恢复滚动位置：
 * - 导航离开某个路由时，自动保存该路由的滚动位置
 * - 导航返回该路由时，自动恢复之前保存的滚动位置
 * - 新导航时，自动滚动到页面顶部
 *
 * @example
 * ```typescript
 * import { createRouter } from '@rasenjs/router'
 * import { useScrollRestoration } from '@rasenjs/router-dom'
 *
 * const router = createRouter(routes, { history })
 * useScrollRestoration(router)
 *
 * // 现在导航时会自动处理滚动
 * await router.push('about', {})
 * ```
 */

import type { Router } from '@rasenjs/router'

export interface ScrollPosition {
  left: number
  top: number
}

/**
 * 使用滚动位置恢复
 *
 * 在导航时自动保存和恢复滚动位置。
 * 需要在 DOM 环境中使用（window 和 history API 可用）。
 *
 * @param router - 路由器实例
 * @returns 返回包含位置记录的对象（用于测试或高级用法）
 *
 * @example
 * ```typescript
 * const { positionMap } = useScrollRestoration(router)
 *
 * // 可以访问保存的位置
 * console.log(positionMap.get('/about'))
 * ```
 */
export function useScrollRestoration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: Router<any>
): { positionMap: Map<string, ScrollPosition> } {
  // 位置记录：存储每个路由路径的滚动位置
  const positionMap = new Map<string, ScrollPosition>()

  // 记录当前路由的路径（用于导航前保存位置）
  let currentPath: string | null = router.current?.path || null

  /**
   * 获取当前滚动位置
   */
  function getScrollPosition(): ScrollPosition {
    return {
      left: window.scrollX || window.pageXOffset || 0,
      top: window.scrollY || window.pageYOffset || 0
    }
  }

  /**
   * 设置滚动位置
   */
  function setScrollPosition(position: ScrollPosition | null): void {
    if (!position) {
      // 新导航，滚动到顶部
      window.scrollTo(0, 0)
    } else {
      // 返回导航，恢复位置
      window.scrollTo(position.left, position.top)
    }
  }

  /**
   * 导航前保存当前位置
   */
  router.beforeEach((_to, from) => {
    // 离开当前路由时，保存其滚动位置
    if (from && currentPath) {
      const position = getScrollPosition()
      // 只保存非零位置或明确保存零位置
      positionMap.set(currentPath, position)
    }
  })

  /**
   * 导航后处理滚动
   */
  router.afterEach((to) => {
    // 更新当前路径
    currentPath = to.path

    // 使用 requestAnimationFrame 确保 DOM 已完全更新
    requestAnimationFrame(() => {
      // 检查是否有保存的位置（即是否是返回导航）
      const savedPosition = positionMap.get(to.path)

      if (savedPosition) {
        // 返回导航，恢复位置
        setScrollPosition(savedPosition)
      } else {
        // 新导航，滚动到顶部
        setScrollPosition(null)
      }
    })
  })

  return { positionMap }
}
