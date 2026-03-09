import { ref, useReactiveRuntime } from '@rasenjs/reactive-signals'
import { div, h1, button, mount, canvas } from '@rasenjs/dom'
import { rect, sprite } from '@rasenjs/canvas-2d'
import { frame } from '@rasenjs/animation'

useReactiveRuntime()

// 新的帧尺寸（1440x1440）
const FRAME_WIDTH = 1440
const FRAME_HEIGHT = 1440
const COLUMNS = 4
const TOTAL_FRAMES = 40

const spriteImage = new Image()
const imageLoaded = ref(false)

const animation = frame({
  frames: Array.from({ length: TOTAL_FRAMES }, (_, i) => i),
  frameRate: 8,
  loop: true
})

spriteImage.onload = () => {
  imageLoaded.value = true
  animation.play()
}

spriteImage.src = '/sprite/elf_swordsman.png'

const app = div(
  { style: { padding: '20px' } },
  h1({ style: { marginBottom: '20px' } }, '精灵剑士攻击动画'),
  div(
    { style: { marginBottom: '20px' } },
    button({ onClick: () => animation.play() }, '播放'),
    button({ onClick: () => animation.pause() }, '暂停'),
    button({ onClick: () => animation.stop() }, '停止'),
    div({ style: { display: 'inline-block', marginLeft: '20px' } }, 
      `当前帧: ${animation.value}`),
    div({ 
      style: { 
        display: 'inline-block', 
        marginLeft: '10px', 
        color: imageLoaded.value ? 'green' : 'orange' 
      } 
    }, imageLoaded.value ? '图片已加载' : '加载中...')
  ),
  canvas({
    width: 800,
    height: 600,
    style: { border: '1px solid #ccc', background: '#1a1a2e' },
    children: [
      rect({
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        fill: '#1a1a2e'
      }),
      sprite({
        image: spriteImage,
        x: 100,
        y: 0,
        frameWidth: FRAME_WIDTH,
        frameHeight: FRAME_HEIGHT,
        frame: animation,
        columns: COLUMNS,
        width: 600,
        height: 600
      })
    ]
  })
)

mount(app, document.getElementById('app')!)
