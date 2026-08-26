/**
 * Rasen Canvas 2D - Canvas 2D 渲染适配器
 */

import { SyncComponent } from '@rasenjs/core'
import type { CanvasNode } from './node'

export type { CanvasNode, Context2D, CanvasSurface } from './node'

export {
  rect,
  text,
  line,
  circle,
  ellipse,
  arc,
  ring,
  star,
  wedge,
  polygon,
  arrow,
  image,
  sprite,
  path,
  point,
  group
} from './components'
export {
  RenderContext,
  getRenderContext,
  hasRenderContext,
  type Bounds,
  type RenderContextOptions
} from './render-context'
export type {
  CanvasPointerEvent,
  CanvasEventHandler,
  CanvasEventHandlers
} from './events'
export * from './utils'

// 导出path相关类型
export type { PathPoint } from './components/path'

// 组件 props 类型（供 JSX 增强、组合等场景引用实际组件属性）
export type { RectProps } from './components/rect'
export type { TextProps } from './components/text'
export type { LineProps } from './components/line'
export type { CircleProps } from './components/circle'
export type { EllipseProps } from './components/ellipse'
export type { ArcProps } from './components/arc'
export type { RingProps } from './components/ring'
export type { StarProps } from './components/star'
export type { WedgeProps } from './components/wedge'
export type { PolygonProps } from './components/polygon'
export type { ArrowProps } from './components/arrow'
export type { ImageProps } from './components/image'
export type { SpriteProps } from './components/sprite'
export type { PathProps } from './components/path'
export type { GroupProps } from './components/group'

// 类型导出
export type {
  // 基础类型
  MaybeRef,
  Point,
  Size,
  // 样式类型
  FillStyle,
  StrokeStyle,
  ShadowStyle,
  Gradient,
  LinearGradient,
  RadialGradient,
  GradientColorStop,
  Pattern,
  PatternRepeat,
  LineCap,
  LineJoin,
  // 变换类型
  TransformConfig,
  TransformOrigin,
  Scale,
  Skew,
  // 组件配置类型
  BaseConfig,
  ShapeConfig,
  RectConfig,
  CircleConfig,
  EllipseConfig,
  LineConfig,
  PolygonConfig,
  TextConfig,
  PathConfig,
  ArcConfig,
  RingConfig,
  StarConfig,
  WedgeConfig,
  ArrowConfig,
  ImageConfig,
  GroupConfig
} from './types'

type Canvas2DAppComponent = SyncComponent<[props: object]>

export function render(
  component: Canvas2DAppComponent,
  props: object,
  node: CanvasNode
): () => void {
  const mountable = component(props)
  const cleanup = mountable(node, {})
  return () => {
    cleanup?.()
  }
}
