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
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    game.update(dt)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

async function main() {
  const container = document.getElementById('app')!
  container.textContent = 'Loading Mario assets…'

  try {
    const assets = await loadAssets()
    const input = new Input()
    setupKeyboard(input)

    const game = new Game(assets, input)
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
