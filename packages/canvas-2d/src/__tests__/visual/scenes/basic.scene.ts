/**
 * Canvas 2D 视觉测试场景 - 基础图形
 *
 * 每个场景包含两部分：
 * 1. baseline: 使用原生 Canvas API 绘制（用于生成基准快照）
 * 2. render: 使用 rasen 组件绘制（用于测试验证）
 */

import type { VisualTestScene } from '../../../test-utils'
import { rect, circle, line, text } from '../../../index'

/**
 * 基础矩形 - 填充
 */
export const rectFillScene: VisualTestScene = {
  name: 'rect-fill',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(50, 50, 100, 100)
  },
  render: (ctx) => {
    rect({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      fill: '#ff0000'
    })(ctx)
  }
}

/**
 * 基础矩形 - 描边
 */
export const rectStrokeScene: VisualTestScene = {
  name: 'rect-stroke',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.strokeStyle = '#0000ff'
    ctx.lineWidth = 4
    ctx.strokeRect(50, 50, 100, 100)
  },
  render: (ctx) => {
    rect({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      stroke: '#0000ff',
      lineWidth: 4
    })(ctx)
  }
}

/**
 * 矩形 - 填充+描边
 */
export const rectFillStrokeScene: VisualTestScene = {
  name: 'rect-fill-stroke',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.fillStyle = '#00ff00'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.fillRect(50, 50, 100, 100)
    ctx.strokeRect(50, 50, 100, 100)
  },
  render: (ctx) => {
    rect({
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      fill: '#00ff00',
      stroke: '#000000',
      lineWidth: 2
    })(ctx)
  }
}

/**
 * 基础圆形 - 填充
 */
export const circleFillScene: VisualTestScene = {
  name: 'circle-fill',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.beginPath()
    ctx.arc(100, 100, 50, 0, Math.PI * 2)
    ctx.fillStyle = '#ff6600'
    ctx.fill()
  },
  render: (ctx) => {
    circle({
      x: 100,
      y: 100,
      radius: 50,
      fill: '#ff6600'
    })(ctx)
  }
}

/**
 * 基础圆形 - 描边
 */
export const circleStrokeScene: VisualTestScene = {
  name: 'circle-stroke',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.beginPath()
    ctx.arc(100, 100, 50, 0, Math.PI * 2)
    ctx.strokeStyle = '#9900ff'
    ctx.lineWidth = 3
    ctx.stroke()
  },
  render: (ctx) => {
    circle({
      x: 100,
      y: 100,
      radius: 50,
      stroke: '#9900ff',
      lineWidth: 3
    })(ctx)
  }
}

/**
 * 基础线条
 */
export const lineBasicScene: VisualTestScene = {
  name: 'line-basic',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.beginPath()
    ctx.moveTo(20, 20)
    ctx.lineTo(180, 180)
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 2
    ctx.stroke()
  },
  render: (ctx) => {
    line({
      x1: 20,
      y1: 20,
      x2: 180,
      y2: 180,
      stroke: '#333333',
      lineWidth: 2
    })(ctx)
  }
}

/**
 * 多条线条
 */
export const lineMultipleScene: VisualTestScene = {
  name: 'line-multiple',
  width: 200,
  height: 200,
  baseline: (ctx) => {
    ctx.strokeStyle = '#0066cc'
    ctx.lineWidth = 2

    // 水平线
    ctx.beginPath()
    ctx.moveTo(20, 50)
    ctx.lineTo(180, 50)
    ctx.stroke()

    // 垂直线
    ctx.beginPath()
    ctx.moveTo(100, 20)
    ctx.lineTo(100, 180)
    ctx.stroke()

    // 对角线
    ctx.beginPath()
    ctx.moveTo(20, 180)
    ctx.lineTo(180, 20)
    ctx.stroke()
  },
  render: (ctx) => {
    // 水平线
    line({
      x1: 20,
      y1: 50,
      x2: 180,
      y2: 50,
      stroke: '#0066cc',
      lineWidth: 2
    })(ctx)

    // 垂直线
    line({
      x1: 100,
      y1: 20,
      x2: 100,
      y2: 180,
      stroke: '#0066cc',
      lineWidth: 2
    })(ctx)

    // 对角线
    line({
      x1: 20,
      y1: 180,
      x2: 180,
      y2: 20,
      stroke: '#0066cc',
      lineWidth: 2
    })(ctx)
  }
}

/**
 * 基础文本
 */
export const textBasicScene: VisualTestScene = {
  name: 'text-basic',
  width: 300,
  height: 100,
  baseline: (ctx) => {
    ctx.font = '24px Arial, sans-serif'
    ctx.fillStyle = '#000000'
    ctx.fillText('Hello Rasen!', 20, 50)
  },
  render: (ctx) => {
    text({
      text: 'Hello Rasen!',
      x: 20,
      y: 50,
      font: '24px Arial, sans-serif',
      fill: '#000000'
    })(ctx)
  },
  // 文本渲染在不同环境可能有细微差异
  options: { maxDiffPercent: 5 }
}

/**
 * 文本对齐
 */
export const textAlignScene: VisualTestScene = {
  name: 'text-align',
  width: 300,
  height: 200,
  baseline: (ctx) => {
    ctx.font = '16px Arial, sans-serif'
    ctx.fillStyle = '#333333'

    // 参考线
    ctx.strokeStyle = '#cccccc'
    ctx.beginPath()
    ctx.moveTo(150, 0)
    ctx.lineTo(150, 200)
    ctx.stroke()

    // 左对齐
    ctx.textAlign = 'left'
    ctx.fillText('Left', 150, 40)

    // 居中
    ctx.textAlign = 'center'
    ctx.fillText('Center', 150, 80)

    // 右对齐
    ctx.textAlign = 'right'
    ctx.fillText('Right', 150, 120)
  },
  render: (ctx) => {
    // 参考线
    line({
      x1: 150,
      y1: 0,
      x2: 150,
      y2: 200,
      stroke: '#cccccc',
      lineWidth: 1
    })(ctx)

    // 左对齐
    text({
      text: 'Left',
      x: 150,
      y: 40,
      font: '16px Arial, sans-serif',
      fill: '#333333',
      textAlign: 'left'
    })(ctx)

    // 居中
    text({
      text: 'Center',
      x: 150,
      y: 80,
      font: '16px Arial, sans-serif',
      fill: '#333333',
      textAlign: 'center'
    })(ctx)

    // 右对齐
    text({
      text: 'Right',
      x: 150,
      y: 120,
      font: '16px Arial, sans-serif',
      fill: '#333333',
      textAlign: 'right'
    })(ctx)
  },
  options: { maxDiffPercent: 5 }
}

/**
 * 导出所有基础场景
 */
export const basicScenes: VisualTestScene[] = [
  rectFillScene,
  rectStrokeScene,
  rectFillStrokeScene,
  circleFillScene,
  circleStrokeScene,
  lineBasicScene,
  lineMultipleScene,
  textBasicScene,
  textAlignScene
]
