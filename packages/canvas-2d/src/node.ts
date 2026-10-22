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
 *  - Draw order = pre-order traversal of the tree, and the node owns that single
 *    recursion: it hands the subtree to `draw`'s `drawChildren` callback, which
 *    decides where inside its own state it renders — `group` calls it between its
 *    transform/clip save and restore, so the subtree's transforms compose.
 *    There is no second recursion after `draw`: one recursion, one owner.
 */

import { getReactiveRuntime } from '@rasenjs/core'
import {
  RenderContext,
  hasRenderContext,
  type Bounds,
  type RenderContextOptions
} from './render-context'
import type { CanvasEventHandlers } from './events'

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
  /** Optional bounds provider (world coordinates, untransformed scenes). */
  bounds?: () => Bounds | null
  /** Optional exact point-in-shape test; falls back to bounds containment. */
  hit?: (x: number, y: number) => boolean
  /** Pointer handlers dispatched when this node is the hit target. */
  on?: CanvasEventHandlers
  /**
   * Draw: a leaf paints only itself; a container paints its children at the
   * position it chooses (see `CanvasNodeOptions.draw`). Either way the children
   * are reached once — by this one pre-order pass.
   */
  draw(ctx: Context2D): void
  /** 从树上摘除并停止自身的响应式订阅 */
  remove(): void
}

export interface CanvasNodeOptions {
  /**
   * Draws this node. A container calls `drawChildren()` wherever its subtree
   * must render (the usual shape: save → own transform → `drawChildren()` →
   * restore); a leaf ignores the argument.
   *
   * One authority per recursion: when `draw` is given, the node does **not**
   * recurse `children` on its own. It used to, unconditionally, while `group`
   * recursed its own children to place them inside its transform — so a leaf
   * under N nested groups was drawn 2^N times, once per subset of its
   * ancestors' transforms, and the transform-less copy was painted last.
   */
  draw: (ctx: Context2D, drawChildren: () => void) => void
  /** 可选包围盒（预留：脏区优化）；可接收 ctx 用于 measureText 等 */
  bounds?: (ctx: Context2D) => Bounds | null
  /**
   * Optional exact point-in-shape test in canvas coordinates. When absent,
   * hit testing falls back to bounds containment (AABB).
   */
  hit?: (x: number, y: number) => boolean
  /**
   * Pointer handlers dispatched when this node is the hit target. Presence
   * lazily attaches the context's delegated DOM listeners.
   */
  on?: CanvasEventHandlers
  /** 可选响应式依赖：任一变化 → 标脏触发重绘 */
  deps?: () => unknown[]
}

function ensureRenderContext(ctx: Context2D, options?: RenderContextOptions): RenderContext {
  if (!hasRenderContext(ctx)) {
    return new RenderContext(ctx, options)
  }
  return RenderContext.for(ctx)
}

/**
 * 共享的节点构造：挂到 parent 下（parent 为 null 时注册为渲染根）。
 */
function attachNode(
  rc: RenderContext,
  ctx: Context2D,
  parent: CanvasNode | null,
  opts?: CanvasNodeOptions
): CanvasNode {
  const children: CanvasNode[] = []
  // 根节点自身无绘制逻辑 —— 纯容器，直接递归子树
  // The root has no drawing of its own: its default draw *is* the recursion.
  const drawSelf: (ctx: Context2D, drawChildren: () => void) => void =
    opts?.draw ?? ((_ctx, drawChildren) => drawChildren())

  const node: CanvasNode = {
    ctx,
    parent,
    children,
    // Adapt the ctx-taking provider to the public zero-arg shape.
    bounds: opts?.bounds ? () => opts.bounds!(ctx) : undefined,
    hit: opts?.hit ?? undefined,
    on: opts?.on ?? undefined,
    draw(ctx2: Context2D) {
      // The node owns the recursion and hands it to `drawSelf`, which decides
      // *where* in its own state the subtree renders. Calling `drawSelf` and
      // then recursing again here would draw every child twice.
      drawSelf(ctx2, () => {
        for (let i = 0; i < children.length; i++) {
          children[i].draw(ctx2)
        }
      })
    },
    remove() {
      stop?.()
      if (parent) {
        const i = parent.children.indexOf(node)
        if (i >= 0) parent.children.splice(i, 1)
      } else {
        rc.removeRoot(node)
      }
      rc.markDirty()
    }
  }

  // Handlers on any node signal the host adapter to bind listeners.
  // The renderer itself never touches addEventListener — the host
  // (dom canvas / tests) decides how to feed dispatchPointer.
  if (opts?.on) {
    rc.markNeedsPointerBinding()
  }

  if (parent) {
    parent.children.push(node)
    // 结构变化即标脏：向已有子树追加节点必须触发重绘
    // （根路径的 addRoot 内部已 markDirty）
    rc.markDirty()
  } else {
    rc.addRoot(node)
  }

  // 依赖 → 标脏（v1 全画布重绘；per-node 脏区后续优化）
  let stop: (() => void) | undefined
  if (opts?.deps) {
    stop = getReactiveRuntime().subscribe(opts.deps, () => rc.markDirty())
  }

  return node
}

/**
 * 创建渲染根 —— 官方的「从裸 ctx 得到根节点」入口。
 *
 * dom <canvas> 桥与测试都经此把一个原始绘制上下文物化成真实的
 * 场景树根；组件一律通过 createNode 挂在这棵树下。
 *
 * 返回的根节点额外携带 `requestRedraw()`：宿主改了绘图缓冲尺寸等
 * 环境状态后显式请求重绘（替代旧的 'rasen:resize' 事件契约）。
 */
export function createRoot(
  ctx: Context2D,
  options?: RenderContextOptions
): CanvasNode & { requestRedraw(): void } {
  const rc = ensureRenderContext(ctx, options)
  const root = attachNode(rc, ctx, null)
  return Object.assign(root, {
    requestRedraw: () => rc.requestRedraw()
  })
}

/**
 * 创建场景节点并挂到 parent 下（纯树操作）。
 *
 * @param parent 接收到的挂载宿主——group 节点则成为其子节点；
 *               顶层组件的宿主是 createRoot 物化的渲染根。
 */
export function createNode(parent: CanvasNode, opts: CanvasNodeOptions): CanvasNode {
  const rc = ensureRenderContext(parent.ctx)
  return attachNode(rc, parent.ctx, parent, opts)
}

/**
 * Canvas 组件造型：业务 props 入参，返回以 CanvasNode 为节点的 Mountable
 */
export type Component2D<P> = (props: P) => import('@rasenjs/core').Mountable<CanvasNode>
