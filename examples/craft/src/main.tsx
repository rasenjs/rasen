/**
 * Entry — boots the reactive runtime, registers WebGL JSX tags, mounts the
 * Rasen app and runs the game loop.
 */

import { configureTags } from '@rasenjs/core'
import { mount } from '@rasenjs/dom'
import { ref } from '@rasenjs/reactive-signals'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import {
  FirstPersonCamera,
  billboard,
  box,
  forwardVector,
  group,
  mesh,
  rect,
  voxelRaycast,
} from '@rasenjs/webgl'
import { Blocks } from './blocks'
import { createPointerLockControls, setupKeyboard, type MouseControls } from './input'
import { Player } from './player'
import { createApp } from './render'
import { World } from './world'

useReactiveRuntime()

// Register WebGL components as lowercase JSX tags (types in jsx.d.ts), so DOM
// and WebGL share one JSX syntax.
configureTags({
  '': {
    firstPersonCamera: FirstPersonCamera,
    mesh,
    box,
    billboard,
    group,
    rect,
  },
})

// Hot-bar selection: 1-8 pick the block to place.
const SELECTABLE: Record<string, number> = {
  Digit1: Blocks.GRASS,
  Digit2: Blocks.DIRT,
  Digit3: Blocks.STONE,
  Digit4: Blocks.SAND,
  Digit5: Blocks.WOOD,
  Digit6: Blocks.LEAVES,
  Digit7: Blocks.PLANK,
  Digit8: Blocks.GLASS,
}

function bindMouse(canvas: HTMLCanvasElement, world: World, player: Player, mouse: MouseControls, selectedBlock: { value: number }) {
  const ray = () =>
    voxelRaycast(
      player.eye.value,
      forwardVector(player.yaw.value, player.pitch.value),
      (x, y, z) => world.getBlock(x, y, z),
      8,
    )

  const breakBlock = () => {
    const hit = ray()
    if (hit && hit.y > 0) {
      world.setBlock(hit.x, hit.y, hit.z, Blocks.AIR)
    }
  }
  const placeBlock = () => {
    const hit = ray()
    if (hit) {
      const px = hit.x + hit.nx
      const py = hit.y + hit.ny
      const pz = hit.z + hit.nz
      if (py > 0 && py < 47 && !player.occupies(px, py, pz)) {
        world.setBlock(px, py, pz, selectedBlock.value)
      }
    }
  }

  // Click anywhere (including on the start veil) to begin.
  document.addEventListener('click', () => {
    if (!mouse.locked.value) mouse.request()
  })

  // In drag-look fallback, pressing the left button drags the view; a click is
  // only a break/place if the pointer didn't move (distinguish click vs drag).
  let downX = 0
  let downY = 0

  canvas.addEventListener('mousedown', (e) => {
    if (!mouse.locked.value) return
    downX = e.clientX
    downY = e.clientY
  })

  canvas.addEventListener('mouseup', (e) => {
    if (!mouse.locked.value) return
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
    const isClick = moved < 6
    if (isClick) {
      if (e.button === 0) breakBlock()
      else if (e.button === 2) placeBlock()
    }
  })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
}

function startLoop(world: World, player: Player, keys: Set<string>, fps: { value: number }) {
  let last = performance.now()
  let frames = 0
  let since = last
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now

    player.update(dt, world, keys)
    world.update(player.pos.value.x, player.pos.value.z)

    frames++
    if (now - since >= 500) {
      fps.value = Math.round((frames * 1000) / (now - since))
      frames = 0
      since = now
    }

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function main() {
  const container = document.getElementById('app')!
  const world = new World()
  const player = new Player()
  const keys = setupKeyboard()
  const fps = ref(0)
  const selectedBlock = ref<number>(Blocks.GRASS)

  // Mouse controls are created before the canvas exists; inject refs so the
  // scene can react to lock state immediately, then wire events after mount.
  const locked = ref(false)
  const mouse: MouseControls = {
    yaw: player.yaw,
    pitch: player.pitch,
    locked,
    request: () => {},
    release: () => {},
  }

  const app = createApp(world, player, mouse, selectedBlock, fps)
  mount(app(), container)

  // Wire mouse after the canvas exists (mount is synchronous for the canvas).
  const canvas = document.querySelector('canvas') as HTMLCanvasElement
  const controls = createPointerLockControls(canvas, { yaw: player.yaw, pitch: player.pitch, locked })
  mouse.request = controls.request
  mouse.release = controls.release
  bindMouse(canvas, world, player, mouse, selectedBlock)

  window.addEventListener('keydown', (e) => {
    const block = SELECTABLE[e.code]
    if (block !== undefined) selectedBlock.value = block
  })

  // Drop the player onto the terrain near the origin.
  player.spawn(world, 8.5, 8.5)
  startLoop(world, player, keys, fps)

  // Debug hook (console inspection)
  ;(window as unknown as { __craftDebug: { world: World; player: Player; keys: Set<string> } }).__craftDebug = { world, player, keys }
}

main()
