/**
 * Hydration 上下文
 *
 * 管理客户端水合过程中的 DOM 遍历状态
 */

export interface HydrationContext {
  /** 是否处于水合模式 */
  isHydrating: boolean
  /** 当前遍历到的节点 */
  currentNode: Node | null
  /** 父节点栈，用于嵌套结构 */
  parentStack: Node[]

  /** 获取当前节点并移动到下一个兄弟节点 */
  claim(): Node | null
  /** 进入当前元素的子节点 */
  enterChildren(parent: Node): void
  /** 退出子节点，返回父级 */
  exitChildren(): void
}

let hydrationContext: HydrationContext | null = null

/**
 * 获取当前 Hydration 上下文
 */
export function getHydrationContext(): HydrationContext | null {
  return hydrationContext
}

/**
 * 设置 Hydration 上下文
 */
export function setHydrationContext(ctx: HydrationContext | null): void {
  hydrationContext = ctx
}

/**
 * 创建 Hydration 上下文
 */
export function createHydrationContext(container: HTMLElement): HydrationContext {
  return {
    isHydrating: true,
    currentNode: container.firstChild,
    parentStack: [],

    claim() {
      const node = this.currentNode
      if (node) {
        this.currentNode = node.nextSibling
      }
      return node
    },

    enterChildren(parent: Node) {
      // 保存当前位置到栈
      this.parentStack.push(this.currentNode as Node)
      // 进入子节点
      this.currentNode = parent.firstChild
    },

    exitChildren() {
      // 恢复到父级的下一个兄弟节点
      this.currentNode = this.parentStack.pop() ?? null
    }
  }
}

/**
 * 检查是否处于 Hydration 模式
 */
export function isHydrating(): boolean {
  return hydrationContext?.isHydrating ?? false
}
