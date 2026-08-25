/**
 * Canvas Node —— 宿主节点抽象（真实树结构）
 *
 * 类型策略：绘制上下文直接复用 DOM 标准类型（CanvasRenderingContext2D）；
 * 带 HTML 前缀的类型（HTMLCanvasElement 等）一律自实现最小造型——
 * 本包只依赖画布表面的 width/height，不触达文档层。
 *
 * 层级模型：
 *  - 组件挂载时通过 createNode 创建自己的节点，挂到收到的宿主下
 *    （宿主是 group 节点则成为其子节点；顶层裸宿主则注册为渲染根）
 *  - 绘制顺序 = 树的前序遍历；group 节点在自身绘制中包裹变换/裁剪后
 *    递归 children，子树变换层级天然成立
 */

import { getReactiveRuntime } from '@rasenjs/core'
import { RenderContext, hasRenderContext, type Bounds } from './render-context'

/**
 * domlike 画布表面 —— 替代 HTMLCanvasElement 的最小造型
 */
export interface CanvasSurface {
  readonly width: number
  readonly height: number
}

/**
 * 复用 DOM 的 2D 绘制上下文，仅把 canvas 成员覆写为自实现的表面造型
 * （原生 canvas: HTMLCanvasElement 收窄为 width/height 视图）。
 */
export type Context2D = Omit<CanvasRenderingContext2D, 'canvas'> & {
  readonly canvas: CanvasSurface
}

/**
 * Canvas 宿主/场景节点
 *
 * Mountable<CanvasNode> 的 node 入参；同时也是场景树的成员。
 */
export interface CanvasNode {
  readonly ctx: Context2D
  /** 父节点；顶层（直接挂在渲染根上）为 null */
  readonly parent: CanvasNode | null
  /** 子节点（按绘制顺序） */
  readonly children: CanvasNode[]
  /** 绘制：叶子只画自身；容器先应用自身状态再递归 children */
  draw(ctx: Context2D): void
  /** 从树上摘除并停止自身的响应式订阅 */
  remove(): void
}

export interface CanvasNodeOptions {
  /** 绘制自身（不含 children 递归——容器由工厂自动追加递归） */
  draw: (ctx: Context2D) => void
  /** 可选包围盒（预留：脏区优化）；可接收 ctx 用于 measureText 等 */
  bounds?: (ctx: Context2D) => Bounds | null
  /** 可选响应式依赖：任一变化 → 标脏触发重绘 */
  deps?: () => unknown[]
}

function ensureRenderContext(ctx: Context2D): RenderContext {
  if (!hasRenderContext(ctx)) {
    return new RenderContext(ctx)
  }
  return RenderContext.for(ctx)
}

/**
 * 创建场景节点并挂到 parent 下。
 *
 * @param parent 接收到的挂载宿主——group 节点（有 children 数组）时成为
 *               其子节点；顶层裸宿主（桥接/mock 的 {ctx}）时注册为渲染根。
 */
export function createNode(
  parent: CanvasNode | { ctx: Context2D },
  opts: CanvasNodeOptions
): CanvasNode {
  const ctx = parent.ctx
  const rc = ensureRenderContext(ctx)

  const treeNode = parent as CanvasNode
  const attachedToTree = Array.isArray(treeNode.children)

  const children: CanvasNode[] = []
  const node: CanvasNode = {
    ctx,
    parent: attachedToTree ? treeNode : null,
    children,
    draw(ctx2: Context2D) {
      opts.draw(ctx2)
      for (const c of children) c.draw(ctx2)
    },
    remove() {
      stop?.()
      if (attachedToTree) {
        const i = treeNode.children.indexOf(node)
        if (i >= 0) treeNode.children.splice(i, 1)
      } else {
        rc.removeRoot(node)
      }
      rc.markDirty()
    }
  }

  if (attachedToTree) {
    treeNode.children.push(node)
  } else {
    rc.addRoot(node)
  }

  // 依赖 → 标脏（v1 全画布重绘；per-node 脏区后续优化）
  let stop: (() => void) | undefined
  if (opts.deps) {
    stop = getReactiveRuntime().subscribe(opts.deps, () => rc.markDirty())
  }

  return node
}

/**
 * Canvas 组件造型：业务 props 入参，返回以 CanvasNode 为节点的 Mountable
 */
export type Component2D<P> = (props: P) => import('@rasenjs/core').Mountable<CanvasNode>
