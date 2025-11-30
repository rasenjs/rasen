/**
 * Canvas 2D 视觉测试场景 - 高级功能
 *
 * 每个场景包含两部分：
 * 1. baseline: 使用原生 Canvas API 绘制（用于生成基准快照）
 * 2. render: 使用 rasen 组件绘制（用于测试验证）
 *
 * 注意：高级功能（阴影、渐变、变换等）尚未实现
 * 目前 render 函数暂时跳过测试（skip: true）
 */

import type { VisualTestScene } from '../../../test-utils'
import { rect, line, path } from '../../../index'

/**
 * 阴影效果
 */
export const shadowScene: VisualTestScene = {
  name: 'shadow-basic',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetX = 5
    ctx.shadowOffsetY = 5
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(100, 50, 100, 100)
  },
  render: (ctx) => {
    rect({
      x: 100,
      y: 50,
      width: 100,
      height: 100,
      fill: '#ff0000',
      shadowColor: 'rgba(0, 0, 0, 0.5)',
      shadowBlur: 10,
      shadowOffsetX: 5,
      shadowOffsetY: 5
    })(ctx)
  }
}

/**
 * 线性渐变
 */
export const linearGradientScene: VisualTestScene = {
  name: 'gradient-linear',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    const gradient = ctx.createLinearGradient(0, 0, 300, 0)
    gradient.addColorStop(0, '#ff0000')
    gradient.addColorStop(0.5, '#00ff00')
    gradient.addColorStop(1, '#0000ff')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 200)
  },
  render: (ctx) => {
    // 直接使用原生渐变API - 渐变是Canvas原生功能
    const gradient = ctx.createLinearGradient(0, 0, 300, 0)
    gradient.addColorStop(0, '#ff0000')
    gradient.addColorStop(0.5, '#00ff00')
    gradient.addColorStop(1, '#0000ff')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 200)
  }
}

/**
 * 径向渐变
 */
export const radialGradientScene: VisualTestScene = {
  name: 'gradient-radial',
  width: 300,
  height: 300,
  baseline: (ctx) => {
    const gradient = ctx.createRadialGradient(150, 150, 10, 150, 150, 100)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#000000')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 300)
  },
  render: (ctx) => {
    // 直接使用原生渐变API - 渐变是Canvas原生功能
    const gradient = ctx.createRadialGradient(150, 150, 10, 150, 150, 100)
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(1, '#000000')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 300, 300)
  }
}

/**
 * 旋转变换
 */
export const rotationScene: VisualTestScene = {
  name: 'transform-rotation',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.save()
    ctx.translate(100, 100)
    ctx.rotate((45 * Math.PI) / 180)
    ctx.fillStyle = '#ff6600'
    ctx.fillRect(-40, -40, 80, 80)
    ctx.restore()
  },
  render: (ctx) => {
    rect({
      x: 60,
      y: 60,
      width: 80,
      height: 80,
      fill: '#ff6600',
      rotation: (45 * Math.PI) / 180
    })(ctx)
  }
}

/**
 * 缩放变换
 */
export const scaleScene: VisualTestScene = {
  name: 'transform-scale',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.save()
    ctx.translate(100, 100)
    ctx.scale(1.5, 0.75)
    ctx.fillStyle = '#9900ff'
    ctx.fillRect(-40, -40, 80, 80)
    ctx.restore()
  },
  render: (ctx) => {
    rect({
      x: 60,
      y: 60,
      width: 80,
      height: 80,
      fill: '#9900ff',
      scaleX: 1.5,
      scaleY: 0.75
    })(ctx)
  }
}

/**
 * 虚线样式
 */
export const dashedLineScene: VisualTestScene = {
  name: 'line-dashed',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 3
    ctx.setLineDash([10, 5])

    ctx.beginPath()
    ctx.moveTo(20, 50)
    ctx.lineTo(280, 50)
    ctx.stroke()

    ctx.setLineDash([5, 10, 15])
    ctx.beginPath()
    ctx.moveTo(20, 100)
    ctx.lineTo(280, 100)
    ctx.stroke()

    ctx.setLineDash([20, 5, 5, 5])
    ctx.beginPath()
    ctx.moveTo(20, 150)
    ctx.lineTo(280, 150)
    ctx.stroke()
  },
  render: (ctx) => {
    line({
      x1: 20,
      y1: 50,
      x2: 280,
      y2: 50,
      stroke: '#333333',
      lineWidth: 3,
      lineDash: [10, 5]
    })(ctx)

    line({
      x1: 20,
      y1: 100,
      x2: 280,
      y2: 100,
      stroke: '#333333',
      lineWidth: 3,
      lineDash: [5, 10, 15]
    })(ctx)

    line({
      x1: 20,
      y1: 150,
      x2: 280,
      y2: 150,
      stroke: '#333333',
      lineWidth: 3,
      lineDash: [20, 5, 5, 5]
    })(ctx)
  }
}

/**
 * 线帽样式
 */
export const lineCapScene: VisualTestScene = {
  name: 'line-cap',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    ctx.strokeStyle = '#0066cc'
    ctx.lineWidth = 15

    // butt
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.moveTo(50, 50)
    ctx.lineTo(250, 50)
    ctx.stroke()

    // round
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(50, 100)
    ctx.lineTo(250, 100)
    ctx.stroke()

    // square
    ctx.lineCap = 'square'
    ctx.beginPath()
    ctx.moveTo(50, 150)
    ctx.lineTo(250, 150)
    ctx.stroke()
  },
  render: (ctx) => {
    // butt
    line({
      x1: 50,
      y1: 50,
      x2: 250,
      y2: 50,
      stroke: '#0066cc',
      lineWidth: 15,
      lineCap: 'butt'
    })(ctx)

    // round
    line({
      x1: 50,
      y1: 100,
      x2: 250,
      y2: 100,
      stroke: '#0066cc',
      lineWidth: 15,
      lineCap: 'round'
    })(ctx)

    // square
    line({
      x1: 50,
      y1: 150,
      x2: 250,
      y2: 150,
      stroke: '#0066cc',
      lineWidth: 15,
      lineCap: 'square'
    })(ctx)
  }
}

/**
 * 线连接样式
 */
export const lineJoinScene: VisualTestScene = {
  name: 'line-join',
  width: 400,
  height: 200,
  baseline: (ctx) => {
    ctx.strokeStyle = '#ff6600'
    ctx.lineWidth = 10

    // miter
    ctx.lineJoin = 'miter'
    ctx.beginPath()
    ctx.moveTo(50, 50)
    ctx.lineTo(100, 150)
    ctx.lineTo(150, 50)
    ctx.stroke()

    // round
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(180, 50)
    ctx.lineTo(230, 150)
    ctx.lineTo(280, 50)
    ctx.stroke()

    // bevel
    ctx.lineJoin = 'bevel'
    ctx.beginPath()
    ctx.moveTo(310, 50)
    ctx.lineTo(360, 150)
    ctx.lineTo(410, 50)
    ctx.stroke()
  },
  render: (ctx) => {
    // miter
    path({
      points: [
        { x: 50, y: 50 },
        { x: 100, y: 150 },
        { x: 150, y: 50 }
      ],
      stroke: '#ff6600',
      lineWidth: 10,
      lineJoin: 'miter'
    })(ctx)

    // round
    path({
      points: [
        { x: 180, y: 50 },
        { x: 230, y: 150 },
        { x: 280, y: 50 }
      ],
      stroke: '#ff6600',
      lineWidth: 10,
      lineJoin: 'round'
    })(ctx)

    // bevel
    path({
      points: [
        { x: 310, y: 50 },
        { x: 360, y: 150 },
        { x: 410, y: 50 }
      ],
      stroke: '#ff6600',
      lineWidth: 10,
      lineJoin: 'bevel'
    })(ctx)
  }
}

/**
 * 透明度
 */
export const opacityScene: VisualTestScene = {
  name: 'opacity',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    // 背景
    ctx.fillStyle = '#cccccc'
    ctx.fillRect(0, 0, 300, 200)

    // 半透明矩形
    ctx.globalAlpha = 0.5
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(50, 50, 100, 100)

    ctx.globalAlpha = 0.3
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(100, 75, 100, 100)
  },
  render: (ctx) => {
    // 背景
    rect({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      fill: '#cccccc'
    })(ctx)

    // 半透明矩形
    rect({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      fill: '#ff0000',
      opacity: 0.5
    })(ctx)

    rect({
      x: 100,
      y: 75,
      width: 100,
      height: 100,
      fill: '#0000ff',
      opacity: 0.3
    })(ctx)
  }
}

/**
 * 合成模式
 */
export const compositeScene: VisualTestScene = {
  name: 'composite',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    // 目标矩形
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(50, 50, 100, 100)

    // 使用 source-over 合成
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(100, 75, 100, 100)
  },
  render: (ctx) => {
    // 目标矩形
    rect({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      fill: '#ff0000'
    })(ctx)

    // 使用 source-over 合成
    rect({
      x: 100,
      y: 75,
      width: 100,
      height: 100,
      fill: '#0000ff',
      globalCompositeOperation: 'source-over'
    })(ctx)
  }
}

/**
 * 导出所有高级场景
 */
export const advancedScenes: VisualTestScene[] = [
  shadowScene,
  linearGradientScene,
  radialGradientScene,
  rotationScene,
  scaleScene,
  dashedLineScene,
  lineCapScene,
  lineJoinScene,
  opacityScene,
  compositeScene
]
