/**
 * Input.
 *
 * Split the way arpg splits it: host-agnostic intent first, then exactly one
 * adapter that turns browser events into that intent. The simulation never sees a
 * `PointerEvent`, and a second adapter (touch, gamepad, a test harness) would not
 * touch the simulation.
 *
 * Two rules that are easy to get wrong and are therefore stated here:
 *
 *  1. **World picking happens here, not in the renderer.** `@rasenjs/canvas-2d`
 *     hit-tests against node bounds in *screen* space, and the tile layer lives
 *     inside a zoomed camera group whose bounds are in world space. Routing picks
 *     through the sim's own `screenToWorld` keeps one coordinate authority instead
 *     of two that have to agree.
 *  2. **The canvas owns the pointer only while it is over the canvas.** Listeners
 *     are attached to the canvas element, and the DOM panels sit on top of it, so
 *     clicking the inventory does not also mine the block behind it.
 */

import type { World } from './core/world'
import { TILE } from './core/constants'
import { tileDef } from './core/tile-defs'
import { tileToItem } from './core/world'

export interface InputHandle {
  dispose(): void
}

export function bindInput(canvas: HTMLCanvasElement, world: World): InputHandle {
  const held = new Set<string>()

  const onPointerMove = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    world.pointerX.value = sx
    world.pointerY.value = sy
    world.pointerInside.value = true

    const p = world.screenToWorld(sx, sy)
    world.cursorWorldX = p.x
    world.cursorWorldY = p.y
    const tx = Math.floor(p.x / TILE)
    const ty = Math.floor(p.y / TILE)
    world.cursorTileX = tx
    world.cursorTileY = ty

    // The hover readout and the tooltip are written from here rather than polled in
    // the render loop, so a still pointer costs nothing.
    const inReach = Math.hypot(tx * TILE + TILE / 2 - world.playerX, ty * TILE + TILE / 2 - world.playerY) <= TILE * 6.5
    if (!inReach) {
      world.hoverLabel.value = ''
      world.hoverBroken.value = false
      world.tooltipVisible.value = false
      return
    }

    const def = tileDef(world.tileAt(tx, ty))
    if (def.id === 0) {
      // Air: nothing to describe.
      world.hoverLabel.value = ''
      world.hoverBroken.value = false
      world.tooltipVisible.value = false
      return
    }

    world.hoverLabel.value = def.name
    world.tooltipTitle.value = def.name
    world.tooltipSwatch.value = null
    const lines: string[] = [`Hardness ${def.hardness}`]
    if (def.light) lines.push('Emits light')
    if (def.liquid) lines.push(`Liquid: ${def.liquid}`)
    world.tooltipLines.value = lines
    world.tooltipVisible.value = true
    // Offset so the panel never sits under the cursor it is describing.
    world.tooltipX.value = sx + 16
    world.tooltipY.value = sy + 14
  }

  const onPointerDown = (e: PointerEvent): void => {
    // Capture so a drag that leaves the canvas still mines — releasing outside
    // the window is otherwise a stuck mouse button.
    canvas.setPointerCapture(e.pointerId)
    if (e.button === 0) {
      // Left-click is "use the item in hand": a pickaxe mines *and* swings, a sword
      // only swings, a block does nothing. The simulation decides — the input layer
      // does not know what is equipped, and should not.
      world.mining = true
      world.attackHeld = true
      world.requestAttack()
    } else if (e.button === 2) world.placing = true
    else if (e.button === 1) {
      // Middle-click puts the matching item into the active slot, if you have one.
      const item = tileToItem(world.tileAt(world.cursorTileX, world.cursorTileY))
      if (item < 0) return
      const index = world.hotbar.value.findIndex((s) => s.item === item)
      if (index >= 0) world.selectSlot(index)
    }
    e.preventDefault()
  }

  const onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) {
      world.mining = false
      world.attackHeld = false
    } else if (e.button === 2) world.placing = false
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
  }

  const onPointerLeave = (): void => {
    // Do not clear the mining flag here: pointer capture means the gesture is
    // still live even though the cursor left the element.
    world.pointerInside.value = false
    world.tooltipVisible.value = false
  }

  const onWheel = (e: WheelEvent): void => {
    // Integer zoom steps only, for the same reason as the Q key.
    const dir = e.deltaY > 0 ? -1 : 1
    world.setZoom(world.camZoom.value + dir)
    e.preventDefault()
  }

  const onContextMenu = (e: MouseEvent): void => e.preventDefault()

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    held.add(e.code)
    applyMovement()

    // Number row selects a hotbar slot.
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5))
      if (n >= 1 && n <= 9) world.selectSlot(n - 1)
    }
    if (e.code === 'KeyR') world.respawn()
    if (e.code === 'Escape') world.craftOpen.value = false
    if (e.code === 'KeyE') world.toggleCraft()
    // Zoom steps are integers: the baked terrain uses nearest-neighbour, so a
    // fractional scale would resample it on a non-integer grid.
    if (e.code === 'KeyQ') world.setZoom(world.camZoom.value >= 4 ? 1 : world.camZoom.value + 1)
  }

  const onKeyUp = (e: KeyboardEvent): void => {
    held.delete(e.code)
    applyMovement()
  }

  function applyMovement(): void {
    // A/D or arrows for movement; W/Space/Up to jump.
    world.inputLeft = held.has('KeyA') || held.has('ArrowLeft')
    world.inputRight = held.has('KeyD') || held.has('ArrowRight')
    world.inputJump =
      held.has('KeyW') || held.has('Space') || held.has('ArrowUp')
  }

  const onBlur = (): void => {
    // Losing focus mid-drag otherwise leaves the player walking forever.
    held.clear()
    applyMovement()
    world.mining = false
    world.placing = false
    world.attackHeld = false
  }

  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  return {
    dispose(): void {
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
