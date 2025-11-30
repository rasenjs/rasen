/**
 * Rasen Canvas 2D - Canvas 2D 渲染适配器
 */

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
  path,
  point,
  group
} from './components'
export {
  RenderContext,
  type Bounds,
  type RenderContextOptions
} from './render-context'
export * from './utils'

// 导出path相关类型
export type { PathPoint } from './components/path'

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
