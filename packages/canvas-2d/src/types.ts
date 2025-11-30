/**
 * Canvas 2D 类型定义
 *
 * 参考主流库的 API 设计：
 * - Konva.js: 声明式配置
 * - Fabric.js: 类型分层
 * - PixiJS: 样式转换
 */

// 响应式引用类型定义（与 @rasenjs/core 保持一致）
export interface Ref<T = unknown> {
  value: T
}

export interface ReadonlyRef<T = unknown> {
  readonly value: T
}

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 支持响应式的属性值类型
 */
export type MaybeRef<T> = T | Ref<T> | ReadonlyRef<T>

/**
 * 点坐标
 */
export interface Point {
  x: number
  y: number
}

/**
 * 尺寸
 */
export interface Size {
  width: number
  height: number
}

/**
 * 边界框
 */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// ============================================================================
// 填充样式 (参考 Konva.js, Fabric.js)
// ============================================================================

/**
 * 线性渐变色标
 */
export interface GradientColorStop {
  offset: number // 0-1
  color: string
}

/**
 * 线性渐变
 */
export interface LinearGradient {
  type: 'linear'
  x0: number
  y0: number
  x1: number
  y1: number
  colorStops: GradientColorStop[]
}

/**
 * 径向渐变
 */
export interface RadialGradient {
  type: 'radial'
  x0: number
  y0: number
  r0: number
  x1: number
  y1: number
  r1: number
  colorStops: GradientColorStop[]
}

/**
 * 渐变类型
 */
export type Gradient = LinearGradient | RadialGradient

/**
 * 图案重复模式
 */
export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat'

/**
 * 图案填充
 */
export interface Pattern {
  image: CanvasImageSource
  repeat?: PatternRepeat
  transform?: DOMMatrix2DInit
}

/**
 * 填充样式
 * 支持纯色、渐变、图案
 */
export type FillStyle = string | Gradient | Pattern | null

// ============================================================================
// 描边样式 (参考 Konva.js, PixiJS)
// ============================================================================

/**
 * 线帽样式
 */
export type LineCap = 'butt' | 'round' | 'square'

/**
 * 线条连接样式
 */
export type LineJoin = 'miter' | 'round' | 'bevel'

/**
 * 描边样式配置
 */
export interface StrokeStyle {
  /** 描边颜色 */
  color?: string | Gradient
  /** 描边宽度 */
  width?: number
  /** 描边透明度 */
  opacity?: number
  /** 虚线模式 */
  dash?: number[]
  /** 虚线偏移 */
  dashOffset?: number
  /** 线帽样式 */
  lineCap?: LineCap
  /** 连接样式 */
  lineJoin?: LineJoin
  /** 斜接限制 */
  miterLimit?: number
}

// ============================================================================
// 阴影样式 (参考 Konva.js, Fabric.js)
// ============================================================================

/**
 * 阴影配置
 */
export interface ShadowStyle {
  /** 阴影颜色 */
  color?: string
  /** 模糊半径 */
  blur?: number
  /** X 轴偏移 */
  offsetX?: number
  /** Y 轴偏移 */
  offsetY?: number
  /** 阴影透明度 (0-1) */
  opacity?: number
}

// ============================================================================
// 变换属性 (参考 Konva.js, Fabric.js)
// ============================================================================

/**
 * 变换原点
 */
export interface TransformOrigin {
  x: number
  y: number
}

/**
 * 缩放配置
 */
export interface Scale {
  x: number
  y: number
}

/**
 * 倾斜配置
 */
export interface Skew {
  x: number
  y: number
}

/**
 * 变换配置
 */
export interface TransformConfig {
  /** 旋转角度 (度) */
  rotation?: number
  /** 缩放 */
  scale?: Scale | number
  /** 倾斜 */
  skew?: Skew
  /** 变换原点 */
  origin?: TransformOrigin
}

// ============================================================================
// 基础图形属性 (通用)
// ============================================================================

/**
 * 基础节点配置
 */
export interface BaseConfig {
  /** X 坐标 */
  x?: MaybeRef<number>
  /** Y 坐标 */
  y?: MaybeRef<number>
  /** 可见性 */
  visible?: MaybeRef<boolean>
  /** 透明度 (0-1) */
  opacity?: MaybeRef<number>
}

/**
 * 形状基础配置
 */
export interface ShapeConfig extends BaseConfig {
  // 填充
  /** 填充颜色/渐变/图案 */
  fill?: MaybeRef<FillStyle>
  /** 填充透明度 */
  fillOpacity?: MaybeRef<number>
  /** 填充规则 */
  fillRule?: MaybeRef<'nonzero' | 'evenodd'>

  // 描边
  /** 描边颜色 */
  stroke?: MaybeRef<string>
  /** 描边宽度 */
  strokeWidth?: MaybeRef<number>
  /** 描边透明度 */
  strokeOpacity?: MaybeRef<number>
  /** 虚线模式 */
  strokeDash?: MaybeRef<number[]>
  /** 虚线偏移 */
  strokeDashOffset?: MaybeRef<number>
  /** 线帽样式 */
  strokeLineCap?: MaybeRef<LineCap>
  /** 连接样式 */
  strokeLineJoin?: MaybeRef<LineJoin>
  /** 斜接限制 */
  strokeMiterLimit?: MaybeRef<number>

  // 阴影
  /** 阴影配置 */
  shadow?: MaybeRef<ShadowStyle | null>

  // 变换
  /** 旋转角度 (度) */
  rotation?: MaybeRef<number>
  /** 缩放 */
  scale?: MaybeRef<Scale | number>
  /** 倾斜 */
  skew?: MaybeRef<Skew>
  /** 变换原点 */
  origin?: MaybeRef<TransformOrigin>
}

// ============================================================================
// 具体图形配置
// ============================================================================

/**
 * 矩形配置 (参考 Konva.Rect, Fabric.Rect)
 */
export interface RectConfig extends ShapeConfig {
  /** 宽度 */
  width: MaybeRef<number>
  /** 高度 */
  height: MaybeRef<number>
  /** 圆角半径 (支持单值或四个值分别表示左上、右上、右下、左下) */
  cornerRadius?: MaybeRef<number | [number, number, number, number]>
}

/**
 * 圆形配置 (参考 Konva.Circle, Fabric.Circle)
 */
export interface CircleConfig extends ShapeConfig {
  /** 半径 */
  radius: MaybeRef<number>
  /** 起始角度 (弧度) */
  startAngle?: MaybeRef<number>
  /** 结束角度 (弧度) */
  endAngle?: MaybeRef<number>
  /** 是否逆时针 */
  counterClockwise?: MaybeRef<boolean>
}

/**
 * 椭圆配置 (参考 Konva.Ellipse)
 */
export interface EllipseConfig extends ShapeConfig {
  /** X 轴半径 */
  radiusX: MaybeRef<number>
  /** Y 轴半径 */
  radiusY: MaybeRef<number>
}

/**
 * 线条配置 (参考 Konva.Line, Fabric.Line)
 */
export interface LineConfig extends ShapeConfig {
  /** 点坐标数组 [x1, y1, x2, y2, ...] */
  points: MaybeRef<number[]>
  /** 是否闭合路径 */
  closed?: MaybeRef<boolean>
  /** 曲线张力 (0 = 直线, 1 = 平滑曲线) */
  tension?: MaybeRef<number>
  /** 是否使用贝塞尔曲线 */
  bezier?: MaybeRef<boolean>
}

/**
 * 多边形配置 (参考 Konva.RegularPolygon)
 */
export interface PolygonConfig extends ShapeConfig {
  /** 顶点坐标数组 [x1, y1, x2, y2, ...] */
  points?: MaybeRef<number[]>
  /** 正多边形边数 */
  sides?: MaybeRef<number>
  /** 正多边形外接圆半径 */
  radius?: MaybeRef<number>
  /** 圆角半径 */
  cornerRadius?: MaybeRef<number>
}

/**
 * 文本配置 (参考 Konva.Text, Fabric.Text)
 */
export interface TextConfig extends ShapeConfig {
  /** 文本内容 */
  text: MaybeRef<string>
  /** 字体族 */
  fontFamily?: MaybeRef<string>
  /** 字体大小 */
  fontSize?: MaybeRef<number>
  /** 字体样式 */
  fontStyle?: MaybeRef<'normal' | 'italic' | 'oblique'>
  /** 字体粗细 */
  fontWeight?: MaybeRef<'normal' | 'bold' | number>
  /** 水平对齐 */
  textAlign?: MaybeRef<CanvasTextAlign>
  /** 垂直对齐 */
  textBaseline?: MaybeRef<CanvasTextBaseline>
  /** 行高 */
  lineHeight?: MaybeRef<number>
  /** 文本装饰 */
  textDecoration?: MaybeRef<'none' | 'underline' | 'line-through'>
  /** 换行模式 */
  wrap?: MaybeRef<'word' | 'char' | 'none'>
  /** 最大宽度 (启用换行时使用) */
  maxWidth?: MaybeRef<number>
  /** 超出时显示省略号 */
  ellipsis?: MaybeRef<boolean>
  /** 字间距 */
  letterSpacing?: MaybeRef<number>
}

/**
 * 路径配置 (参考 Konva.Path, Fabric.Path)
 */
export interface PathConfig extends ShapeConfig {
  /** SVG 路径数据 */
  data: MaybeRef<string>
}

/**
 * 圆弧配置 (参考 Konva.Arc)
 */
export interface ArcConfig extends ShapeConfig {
  /** 内半径 */
  innerRadius: MaybeRef<number>
  /** 外半径 */
  outerRadius: MaybeRef<number>
  /** 圆弧角度 (度) */
  angle: MaybeRef<number>
  /** 是否顺时针 */
  clockwise?: MaybeRef<boolean>
}

/**
 * 圆环配置 (参考 Konva.Ring)
 */
export interface RingConfig extends ShapeConfig {
  /** 内半径 */
  innerRadius: MaybeRef<number>
  /** 外半径 */
  outerRadius: MaybeRef<number>
}

/**
 * 星形配置 (参考 Konva.Star)
 */
export interface StarConfig extends ShapeConfig {
  /** 顶点数量 */
  numPoints: MaybeRef<number>
  /** 内半径 */
  innerRadius: MaybeRef<number>
  /** 外半径 */
  outerRadius: MaybeRef<number>
}

/**
 * 楔形配置 (参考 Konva.Wedge)
 */
export interface WedgeConfig extends ShapeConfig {
  /** 半径 */
  radius: MaybeRef<number>
  /** 角度 (度) */
  angle: MaybeRef<number>
  /** 是否顺时针 */
  clockwise?: MaybeRef<boolean>
}

/**
 * 箭头配置 (参考 Konva.Arrow)
 */
export interface ArrowConfig extends LineConfig {
  /** 箭头长度 */
  pointerLength?: MaybeRef<number>
  /** 箭头宽度 */
  pointerWidth?: MaybeRef<number>
  /** 起点是否有箭头 */
  pointerAtBeginning?: MaybeRef<boolean>
  /** 终点是否有箭头 */
  pointerAtEnding?: MaybeRef<boolean>
}

/**
 * 图片配置 (参考 Konva.Image, Fabric.Image)
 */
export interface ImageConfig extends ShapeConfig {
  /** 图片源 */
  image: MaybeRef<CanvasImageSource>
  /** 宽度 */
  width?: MaybeRef<number>
  /** 高度 */
  height?: MaybeRef<number>
  /** 裁剪区域 */
  crop?: MaybeRef<Bounds>
}

/**
 * 组配置 (参考 Konva.Group)
 */
export interface GroupConfig extends BaseConfig {
  /** 宽度 (用于裁剪) */
  width?: MaybeRef<number>
  /** 高度 (用于裁剪) */
  height?: MaybeRef<number>
  /** 是否启用裁剪 */
  clip?: MaybeRef<boolean>
  /** 变换配置 */
  transform?: MaybeRef<TransformConfig>
}
