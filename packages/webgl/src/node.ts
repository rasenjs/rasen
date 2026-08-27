/**
 * WebGL Node —— 宿主节点抽象（真实树结构）
 *
 * 类型策略：GL 上下文与句柄直接复用 DOM 标准类型
 * （WebGLRenderingContext / WebGL2RenderingContext / WebGLBuffer …）；
 * 带 HTML 前缀的类型（HTMLCanvasElement 等）一律自实现最小造型——
 * 本包只依赖画布表面的 width/height，不触达文档层。
 *
 * GL 本身就是 3D：不存在独立的「2D 节点」；components/2d 下的组件
 * 只是 z 缺省为 0 的普通组件（内部快分支），节点类型完全一致。
 *
 * 层级模型：
 *  - 组件挂载时通过 createNode 创建自己的节点，挂到收到的宿主下
 *    （宿主是 group 节点则成为其子节点；顶层裸宿主则注册为渲染根）
 *  - 绘制顺序 = 树的前序遍历；group 节点在自身绘制中 push 变换后
 *    递归 children、pop，子树变换层级天然成立
 */

import { getReactiveRuntime } from '@rasenjs/core'
import { RenderContext, hasRenderContext, getRenderContext } from './render-context'
import type { Bounds } from './types'

/**
 * domlike 画布表面 —— 替代 HTMLCanvasElement 的最小造型
 */
export interface CanvasSurface {
  readonly width: number
  readonly height: number
}

/** WebGL1 上下文（canvas 成员覆写为自实现表面造型） */
export type Gl1Context = Omit<WebGLRenderingContext, 'canvas'> & {
  readonly canvas: CanvasSurface
}

/** WebGL2 上下文（canvas 成员覆写为自实现表面造型） */
export type Gl2Context = Omit<WebGL2RenderingContext, 'canvas'> & {
  readonly canvas: CanvasSurface
}

/**
 * domlike WebGL 上下文：WebGL1 | WebGL2 联合。
 * WebGL2 专属成员调用前用 `'xxx' in gl` 能力探测收窄。
 */
export type GlContext = Gl1Context | Gl2Context

/**
 * WebGL 宿主/场景节点
 *
 * Mountable<GlNode> 的 node 入参；同时也是场景树的成员。
 */
export interface GlNode {
  readonly ctx: GlContext
  /**
   * 渲染上下文配置：由桥接方（dom <canvas>）注入，组件懒创建
   * RenderContext 时读取。替代旧的 dataset 传递。
   */
  readonly rcOptions?: import('./render-context').RenderContextOptions
  /** 父节点；顶层（直接挂在渲染根上）为 null */
  readonly parent: GlNode | null
  /** 子节点（按绘制顺序） */
  readonly children: GlNode[]
  /** Optional bounds provider (world coordinates); null for 3D components. */
  bounds?: () => Bounds | null
  /** 绘制：叶子只画自身；容器在 push 自身变换后调用 drawChildren() 再 pop */
  draw(): void
  /** 从树上摘除并停止自身的响应式订阅 */
  remove(): void
}

export interface GlNodeOptions {
  /**
   * 绘制自身。容器组件在需要绘制子树的位置调用 `drawChildren()`
   * （典型形态：pushTransform → drawChildren() → popTransform），
   * 叶子组件忽略该参数。
   */
  draw: (drawChildren: () => void) => void
  /** 可选包围盒（世界坐标；3D 组件返回 null 表示全量重绘） */
  bounds?: () => Bounds | null
  /** 可选响应式依赖：任一变化 → 标脏触发重绘 */
  deps?: () => unknown[]
}

function ensureRenderContext(ctx: GlContext, rcOptions?: import('./render-context').RenderContextOptions): RenderContext {
  if (!hasRenderContext(ctx)) {
    return new RenderContext(ctx, rcOptions)
  }
  return getRenderContext(ctx)
}

/**
 * 共享的节点构造：挂到 parent 下（parent 为 null 时注册为渲染根）。
 */
function attachNode(
  rc: RenderContext,
  ctx: GlContext,
  rcOptions: import('./render-context').RenderContextOptions | undefined,
  parent: GlNode | null,
  opts?: GlNodeOptions
): GlNode {
  const children: GlNode[] = []
  // 根节点自身无绘制逻辑 —— 纯容器，直接递归子树
  const drawSelf = opts?.draw ?? ((drawChildren: () => void) => drawChildren())

  const node: GlNode = {
    ctx,
    rcOptions,
    parent,
    children,
    bounds: opts?.bounds ?? undefined,
    draw() {
      // Container semantics: drawSelf decides WHERE the subtree renders
      // (between its own transform push/pop). Leaves simply ignore it.
      drawSelf(() => {
        for (const c of children) c.draw()
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

  if (parent) {
    parent.children.push(node)
    // 结构变化即标脏：向已有子树追加节点必须触发重绘
    // （根路径的 addRoot 内部已 markDirty）
    rc.markDirty()
  } else {
    rc.addRoot(node)
  }

  // 依赖 → 标脏（全量重绘；GL 场景本就无 2D bounds 可言）
  let stop: (() => void) | undefined
  if (opts?.deps) {
    stop = getReactiveRuntime().subscribe(opts.deps, () => rc.markDirty())
  }

  return node
}

/**
 * 创建渲染根 —— 官方的「从裸 ctx 得到根节点」入口。
 *
 * dom <canvas> 桥与测试都经此把一个原始渲染上下文物化成真实的
 * 场景树根；组件一律通过 createNode 挂在这棵树下。
 *
 * 返回的根节点额外携带 `requestRedraw()`：宿主改了绘图缓冲尺寸等
 * 环境状态后显式请求重绘（替代旧的 'rasen:resize' 事件契约）。
 */
export function createRoot(
  ctx: GlContext,
  options?: import('./render-context').RenderContextOptions
): GlNode & { requestRedraw(): void } {
  const rc = ensureRenderContext(ctx, options)
  const root = attachNode(rc, ctx, options, null)
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
export function createNode(parent: GlNode, opts: GlNodeOptions): GlNode {
  const rc = ensureRenderContext(parent.ctx, parent.rcOptions)
  return attachNode(rc, parent.ctx, parent.rcOptions, parent, opts)
}

/**
 * WebGL 组件造型：业务 props 入参，返回以 GlNode 为节点的 Mountable
 */
export type Component3D<P> = (props: P) => import('@rasenjs/core').Mountable<GlNode>
