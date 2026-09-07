/**
 * Entry — loads assets, boots the game loop, mounts the Rasen app.
 */

import { configureTags } from '@rasenjs/core'
import { group, image, rect, sprite, text } from '@rasenjs/canvas-2d'
import { mount } from '@rasenjs/dom'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { loadAssets } from './assets'
import { Game } from './game'
import { Input, setupKeyboard } from './input'
import { createApp } from './render'

useReactiveRuntime()

// Register canvas-2d components as lowercase JSX tags (types in jsx.d.ts),
// so DOM and canvas share one JSX syntax.
configureTags({
  '': {
    rect,
    image,
    text,
    group,
    sprite,
  },
})

function startLoop(game: Game) {
  let last = performance.now()
  const loop = (now: number) => {
    try {
      const dt = Math.min((now - last) / 1000, 1 / 30)
      last = now
      game.update(dt)
    } catch (err) {
      // 显示异常但不停止循环（否则 rAF 链断掉，画面永久冻结）
      window.dispatchEvent(new ErrorEvent('error', { message: String(err) }))
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

async function main() {
  const container = document.getElementById('app')!

  // Debug: surface any uncaught error on the page (canvas rendering can fail
  // silently when an rAF callback throws). Remove after diagnosing.
  window.addEventListener('error', (e) => {
    let el = document.getElementById('error-banner')
    if (!el) {
      el = document.createElement('div')
      el.id = 'error-banner'
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:12px monospace;padding:6px 10px;white-space:pre-wrap;'
      document.body.appendChild(el)
    }
    el.textContent = `ERROR: ${e.message}\n${e.filename}:${e.lineno}`
  })
  window.addEventListener('unhandledrejection', (e) => {
    let el = document.getElementById('error-banner')
    if (!el) {
      el = document.createElement('div')
      el.id = 'error-banner'
      el.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:12px monospace;padding:6px 10px;white-space:pre-wrap;'
      document.body.appendChild(el)
    }
    el.textContent = `UNHANDLED REJECTION: ${String(e.reason)}`
  })

  container.textContent = 'Loading Mario assets…'

  try {
    const assets = await loadAssets()
    const input = new Input()
    setupKeyboard(input)

    const game = new Game(assets, input)
    await game.preload()
    startLoop(game)

    // Debug hook (handy for console inspection)
    ;(window as unknown as { __marioGame?: Game }).__marioGame = game

    container.textContent = ''
    const App = createApp(game, input)
    mount(App(), container)
  } catch (err) {
    console.error(err)
    container.textContent = `Failed to load assets: ${err}`
  }
}

main()
