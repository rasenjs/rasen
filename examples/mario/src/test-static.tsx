/**
 * 独立最小复现页:StaticLayer 场景 —— Signal.State + getter 绑定,点击按钮
 * 换 canvas,验证画布是否重绘。页面顶部直接显示 PASS / FAIL。
 *
 * 结构完全按 nikke-viewer 的做法:div > canvas(宿主组件)> canvas-2d 子组件
 * (PascalCase 直接调用,无需 tag 注册)。
 */
import { com, configureTags } from '@rasenjs/core'
import { rect, image } from '@rasenjs/canvas-2d'
import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { Signal } from 'signal-polyfill'

useReactiveRuntime()

configureTags({
  '': {
    rect,
    image,
  },
})

function makeCanvas(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 3392
  c.height = 240
  const x = c.getContext('2d')!
  x.fillStyle = color
  x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = '#000'
  for (let i = 0; i < c.width; i += 64) x.fillRect(i, 0, 4, 240)
  return c
}

const staticLayer = new Signal.State(makeCanvas('#9c9bff'))
const camRenderX = new Signal.State(0)

// 与游戏 StaticLayer 相同的绑定方式
const LayerImage = com(() => (
  <image
    image={() => staticLayer.get()}
    x={() => camRenderX.get()}
    y={0}
  />
))

const Sky = com(() => (
  <rect x={0} y={0} width={256} height={240} fill={() => '#9c9bff'} />
))

const Layer = com(() => (
  <div style={{ width: '768px', height: '720px', position: 'relative' }}>
    <canvas
      width={256}
      height={240}
      style={{ width: '768px', height: '720px', imageRendering: 'pixelated', display: 'block' }}
    >
      <Sky />
      <LayerImage />
    </canvas>
  </div>
))

export function mountRepro(container: HTMLElement): void {
  const status = document.createElement('div')
  status.id = 'repro-status'
  status.style.cssText =
    'font:16px monospace;padding:8px;background:#000;color:#fff;'
  container.appendChild(status)

  mount(Layer(), container)

  const cv = container.querySelector('canvas')!

  let swapped = false
  const btn = document.createElement('button')
  btn.textContent = 'swap canvas'
  btn.style.cssText = 'font:16px monospace;padding:8px;'
  btn.onclick = () => {
    swapped = !swapped
    staticLayer.set(makeCanvas(swapped ? '#ff8800' : '#9c9bff'))
    camRenderX.set(swapped ? -50 : 0)
    // 500ms 后用像素判定:左上角应为对应颜色
    setTimeout(() => {
      const d = cv.getContext('2d')!.getImageData(60, 10, 1, 1).data
      const got = [d[0], d[1], d[2]]
      const want = swapped ? [255, 136, 0] : [156, 155, 255]
      const pass = Math.abs(got[0] - want[0]) < 20 && Math.abs(got[1] - want[1]) < 20
      status.textContent =
        (pass ? 'PASS' : 'FAIL') +
        ' swapped=' + swapped +
        ' pixel=' + got.join(',') +
        ' expected=' + want.join(',')
      status.style.color = pass ? '#0f0' : '#f55'
    }, 300)
  }
  container.appendChild(btn)
}

// 页面直接以 <script src> 方式加载本模块 —— 自行挂载
const appEl = document.getElementById('app')
if (appEl) mountRepro(appEl)
