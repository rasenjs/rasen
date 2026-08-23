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
  /** 跳到指定节点（保存当前位置，供槽区窗口认领用） */
  enterAt(node: Node): void
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

    enterAt(node: Node) {
      // 保存当前位置到栈，直接跳到指定节点（组件挂载点的槽区窗口）
      this.parentStack.push(this.currentNode as Node)
      this.currentNode = node
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

/**
 * 认领当前节点并校验为期望标签的元素（element 工厂与编译模板共用）
 *
 * 返回认领的元素；非水合模式或校验失败时返回 null（调用方回退新建）。
 * 校验失败时同步移除被认领的错误节点，避免服务端脏节点残留在树中。
 */
export function claimElement(tag: string): HTMLElement | null {
  const ctx = getHydrationContext()
  if (!ctx?.isHydrating) return null

  const existing = ctx.claim()
  if (!existing) return null

  if (existing.nodeType === Node.ELEMENT_NODE) {
    const el = existing as HTMLElement
    if (el.tagName.toLowerCase() === tag.toLowerCase()) return el
    console.warn(
      `[Rasen Hydration] Tag mismatch: expected <${tag}>, got <${el.tagName.toLowerCase()}>`
    )
  } else {
    console.warn(
      `[Rasen Hydration] Expected element <${tag}>, got ${existing.nodeType === Node.TEXT_NODE ? 'text node' : 'other node'}`
    )
  }

  existing.parentNode?.removeChild(existing)
  return null
}
