/**
 * GfxNode —— 唯一的场景树节点抽象（WebGL 与 WebGPU 共用）。
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
 *
 * 组件面：draw 回调收到的就是这个节点。几何提交（addShape/beginMesh/
 * endMesh/createTexture）由节点直接转发给它关联的 batch renderer，
 * 场景状态（变换栈/相机/指针）由节点转发给所属后端——组件因此只认识
 * GfxNode 一个类型，不需要再做任何 ctx → 引擎 的查找。
 */

import { getReactiveRuntime } from '@rasenjs/core'
import { Mat4x4f } from '@rasenjs/math'
import type { TransformState, TransformInput } from './transform-stack'
import type { Bounds } from './types'
import type { BlendMode, TextureHandle } from './renderer/base'
import { Renderer, type GlPointerHandler } from './renderer/base'
import { getRenderContext, hasRenderContext } from './renderer/gl/index'
import { WebGLRenderer } from './renderer/gl/index'
import type { BitmapSource, TextureOptions } from './utils'

/** domlike 画布表面 —— 替代 HTMLCanvasElement 的最小造型 */
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
 *
 * Policy (WebGL2-first): the host bridge prefers WebGL2 and only falls back
 * to WebGL1 when WebGL2 is unavailable. WebGL1 is FROZEN — no new features;
 * WebGL2-only members must be feature-probed (`'xxx' in gl`) before use so
 * the fallback path keeps working.
 */
export type GlContext = Gl1Context | Gl2Context

/**
 * domlike WebGPU canvas context — `GPUCanvasContext` with its `canvas` member
 * narrowed to the self-implemented surface shape, exactly as {@link GlContext}
 * narrows WebGL's.
 *
 * This is the WebGPU analogue of the GL seam: the renderer receives the
 * context, it never derives it from a canvas itself, so a host with no DOM
 * supplies its own implementation instead of the library reaching for
 * `navigator`/`HTMLCanvasElement`. Only two members are ever called:
 * `configure` (once, at construction) and `getCurrentTexture` (once per
 * frame).
 *
 * The host is responsible for:
 *  - exposing the real drawing-buffer size through `canvas.width/height` —
 *    the same physical-pixel values a browser `<canvas>` reports, which is
 *    what `logicalWidth/logicalHeight` scale against;
 *  - honouring `configure`'s `usage`, which includes `COPY_SRC` because
 *    frame readback copies out of the current texture;
 *  - presenting after the queue is submitted. A browser canvas context does
 *    this implicitly; a host-owned swapchain presents there. Making it the
 *    host's call keeps presentation off the renderer's critical path.
 */
export type GpuCanvasContext = Omit<GPUCanvasContext, 'canvas'> & {
  readonly canvas: CanvasSurface
}

/** Live staging-span view returned by beginMesh (see BatchRenderer). */
export type MeshSpan = ReturnType<Renderer['beginMesh']>

/**
 * 场景树节点 —— 组件的唯一可见面。
 *
 * Mountable<GfxNode> 的 node 入参；同时也是场景树的成员。
 */
export interface GfxNode {
  /** 后端上下文句柄（GL context / WebGPU 画布）。仅供后端特化代码使用。 */
  readonly ctx: unknown
  /** 渲染上下文配置：由桥接方（dom <canvas>）注入，组件懒创建时读取。 */
  readonly rcOptions?: Record<string, unknown>
  /** 本树所有组件的渲染引擎（每棵树/每个画布一个）。 */
  readonly renderer: Renderer
  /** 父节点；顶层（直接挂在渲染根上）为 null */
  readonly parent: GfxNode | null
  /** 子节点（按绘制顺序） */
  readonly children: GfxNode[]
  /** Optional bounds provider (world coordinates); null for 3D components. */
  bounds?: () => Bounds | null

  // -- 几何提交（转发到 batch） ---------------------------------------------

  /** batchKey 仅为兼容保留（调试标记），batch 层忽略它。 */
  addShape(
    batchKey: string,
    vertices: Float32Array,
    color: { r: number; g: number; b: number; a: number },
    transform: Mat4x4f | Float32Array | number[] | TransformInput,
    uv?: Float32Array,
    texture?: TextureHandle | null,
    vertexColors?: Float32Array,
    depthWrite?: boolean,
    normals?: Float32Array,
    layer?: number,
    skipTonemap?: boolean,
    premultiplied?: boolean,
    blendMode?: BlendMode,
    indices?: Uint16Array | number[],
    translationOnly?: boolean,
    packedColor?: Uint8Array | { r: number; g: number; b: number; a: number },
  ): void
  beginMesh(vertexCount: number, indexCount: number): MeshSpan | null
  endMesh(
    span: { vBase: number; iBase: number },
    vertexCount: number,
    indexCount: number,
    texture?: TextureHandle | null,
    blendMode?: BlendMode,
    premultiplied?: boolean,
    skipTonemap?: boolean,
  ): void
  createTexture(source: BitmapSource, options?: TextureOptions): TextureHandle
  deleteTexture(texture: TextureHandle): void

  // -- 场景状态（转发到所属后端） -------------------------------------------

  getCurrentTransform(): TransformState
  pushTransform(transform: Partial<TransformState>): void
  popTransform(): void
  getViewMatrix(): Mat4x4f
  readonly camera?: { x?: number; y?: number; zoom?: number }
  addPointerHandler(handler: GlPointerHandler): () => void

  /** 标脏触发重绘（deps 订阅与结构性变化都走这里）。 */
  markDirty(): void

  /** 绘制：叶子只画自身；容器在 push 自身变换后调用 drawChildren() 再 pop */
  draw(): void
  /** 从树上摘除并停止自身的响应式订阅 */
  remove(): void
}

export interface GfxNodeOptions {
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

/** addShape 的对象形式 → 矩阵（Mat4x4f 直传零开销）。 */
function toMatrix(transform: Mat4x4f | Float32Array | number[] | TransformInput): Mat4x4f {
  if (transform instanceof Mat4x4f) return transform
  if (transform instanceof Float32Array || Array.isArray(transform)) {
    return Mat4x4f.fromArray(transform)
  }
  return Mat4x4f.identity()
    .multiply(Mat4x4f.translate(transform.tx, transform.ty, transform.tz ?? 0))
    .multiply(Mat4x4f.rotateX(transform.rotationX ?? 0))
    .multiply(Mat4x4f.rotateY(transform.rotationY ?? 0))
    .multiply(Mat4x4f.rotateZ(transform.rotationZ ?? 0))
    .multiply(Mat4x4f.scale(transform.scaleX ?? 1, transform.scaleY ?? 1, transform.scaleZ ?? 1))
}

/**
 * 共享的节点构造：挂到 parent 下（parent 为 null 时注册为渲染根）。
 * 节点方法全部是对所属 Renderer 的转发——组件只见 GfxNode。
 */
function attachNode(
  renderer: Renderer,
  ctx: unknown,
  rcOptions: Record<string, unknown> | undefined,
  parent: GfxNode | null,
  opts?: GfxNodeOptions
): GfxNode {
  const children: GfxNode[] = []
  // 根节点自身无绘制逻辑 —— 纯容器，直接递归子树
  const drawSelf = opts?.draw ?? ((drawChildren: () => void) => drawChildren())

  const node: GfxNode = {
    ctx,
    rcOptions,
    renderer,
    parent,
    children,
    bounds: opts?.bounds ?? undefined,

    addShape: (batchKey, vertices, color, transform, uv, texture, vertexColors, depthWrite, normals, layer, skipTonemap, premultiplied, blendMode, indices, translationOnly, packedColor) => {
      void batchKey
      renderer.addShape(vertices, color, toMatrix(transform), uv, texture, vertexColors, depthWrite, normals, layer, skipTonemap, premultiplied, blendMode, indices, translationOnly, packedColor)
    },
    beginMesh: (vertexCount, indexCount) => renderer.beginMesh(vertexCount, indexCount),
    endMesh: (span, vertexCount, indexCount, texture, blendMode, premultiplied, skipTonemap) =>
      renderer.endMesh(span, vertexCount, indexCount, texture, blendMode, premultiplied, skipTonemap),
    createTexture: (source, options) => renderer.createTexture(source, options),
    deleteTexture: (texture) => renderer.deleteTexture(texture),

    getCurrentTransform: () => renderer.getCurrentTransform(),
    pushTransform: (transform) => renderer.pushTransform(transform),
    popTransform: () => renderer.popTransform(),
    getViewMatrix: () => renderer.getViewMatrix(),
    camera: renderer.camera,
    addPointerHandler: (handler) => renderer.addPointerHandler(handler),
    markDirty: () => renderer.markDirty(),

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
        renderer.removeRoot(node)
      }
      renderer.markDirty()
    },
  }

  if (parent) {
    parent.children.push(node)
    // 结构变化即标脏：向已有子树追加节点必须触发重绘
    // （根路径的 addRoot 内部已 markDirty）
    renderer.markDirty()
  } else {
    renderer.addRoot(node)
  }

  // 依赖 → 标脏（全量重绘；GL 场景本就无 2D bounds 可言）
  let stop: (() => void) | undefined
  if (opts?.deps) {
    stop = getReactiveRuntime().subscribe(opts.deps, () => renderer.markDirty())
  }

  return node
}

/**
 * 创建渲染根 —— 官方的「从裸 ctx 得到根节点」入口（WebGL）。
 *
 * dom <canvas> 桥与测试都经此把一个原始渲染上下文物化成真实的
 * 场景树根；组件一律通过 createNode 挂在这棵树下。
 *
 * 返回的根节点额外携带 `requestRedraw()`：宿主改了绘图缓冲尺寸等
 * 环境状态后显式请求重绘（替代旧的 'rasen:resize' 事件契约）。
 */
export function createRoot(
  ctx: GlContext,
  options?: import('./renderer/gl/index').RenderContextOptions
): GfxNode & { requestRedraw(): void } {
  // One renderer per GL context (the registry dedupes): repeated createRoot
  // calls add roots to the SAME engine — a scene may be assembled across
  // multiple createRoot call sites.
  const has = hasRenderContext(ctx)
  const renderer = has ? getRenderContext(ctx) : new WebGLRenderer(ctx, options ?? {})
  return createRootNode(renderer, ctx, options)
}

/**
 * 创建一棵以「拥有 renderer 的根节点」为顶的场景树（任意后端）。
 * dom <canvas> 桥在 WebGPU 路径用它包装 WebGPURenderer。
 */
export function createRootNode(
  renderer: Renderer,
  ctx: unknown,
  rcOptions?: Record<string, unknown>
): GfxNode & { requestRedraw(): void } {
  const root = attachNode(renderer, ctx, rcOptions, null)
  return Object.assign(root, {
    requestRedraw: () => renderer.requestRedraw(),
  })
}

/**
 * 创建场景节点并挂到 parent 下（纯树操作）。
 *
 * @param parent 接收到的挂载宿主——group 节点则成为其子节点；
 *               顶层组件的宿主是渲染根（createRoot 物化的 GL 根，
 *               或 WebGPURoot 自身）。
 */
export function createNode(parent: GfxNode, opts: GfxNodeOptions): GfxNode {
  return attachNode(parent.renderer, parent.ctx, parent.rcOptions, parent, opts)
}

/**
 * 组件造型：业务 props 入参，返回以 GfxNode 为节点的 Mountable
 */
export type Component3D<P> = (props: P) => import('@rasenjs/core').Mountable<GfxNode>

/** 兼容别名：旧名 GlNode / GlNodeOptions 指向同一抽象。 */
export type GlNode = GfxNode
export type GlNodeOptions = GfxNodeOptions
