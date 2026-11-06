/**
 * The canvas half of the interface.
 *
 * Everything in this file is built from `widgets.ts` through `canvasUiHost`, and
 * that is the entire point: this file and `hud-dom.tsx` import the *same* widget
 * functions. Compare upstream, where the canvas HUD is a hand-written XNA widget
 * tree (`src/vui/elements/*`) and the DOM panels are separate components that
 * share nothing with it.
 *
 * Screen space, as a sibling of the camera group — see the note in `scene.tsx`.
 */

import type { Mountable } from '@rasenjs/core'
import type { CanvasNode } from '@rasenjs/canvas-2d'
import type { World } from '../core/world'
import type { TileAtlas } from '../render/atlas'
import { canvasUiHost } from './kit-canvas'
import { PALETTE, read, rgba } from './kit'
import { bar, keycap, itemSlot, readout, tooltip } from './widgets'

const SLOT = 40
const SLOT_GAP = 5

export function HudCanvasLayer(props: { world: World; atlas: TileAtlas }): Mountable<CanvasNode> {
  const { world } = props
  const host = canvasUiHost

  const children: Array<Mountable<CanvasNode>> = []

  // The hotbar is positioned from the viewport size so it stays centred on
  // resize. Each slot is an `itemSlot` — the same call the DOM inventory uses.
  children.push(
    host.stack({
      x: () => read(world.viewWidth) / 2 - (read(world.hotbar).length * (SLOT + SLOT_GAP)) / 2,
      y: () => read(world.viewHeight) - SLOT - 16,
      children: read(world.hotbar).map((_slot, index) =>
        itemSlot(host, {
          stack: () => read(world.hotbar)[index] ?? null,
          geometry: { x: index * (SLOT + SLOT_GAP), y: 0, size: SLOT },
          active: () => read(world.selectedSlot) === index,
        })
      ),
    })
  )

  // Slot number badges, drawn above the hotbar.
  children.push(
    host.stack({
      x: () => read(world.viewWidth) / 2 - (read(world.hotbar).length * (SLOT + SLOT_GAP)) / 2,
      y: () => read(world.viewHeight) - SLOT - 16,
      children: read(world.hotbar).map((_, index) =>
        readout(host, {
          x: index * (SLOT + SLOT_GAP) + 4,
          y: 3,
          size: 10,
          text: () => String(index + 1),
          fill: () => (read(world.selectedSlot) === index ? PALETTE.accent : PALETTE.inkDim),
        })
      ),
    })
  )

  // -- health bar, top left -----------------------------------------------
  children.push(
    bar(host, {
      x: 16,
      y: 16,
      width: 168,
      height: 13,
      value: () => read(world.health) / Math.max(1, read(world.maxHealth)),
      fill: () => (read(world.health) / Math.max(1, read(world.maxHealth)) < 0.3 ? PALETTE.danger : PALETTE.hp),
    })
  )
  children.push(
    readout(host, {
      x: 16,
      y: 33,
      text: () =>
        `${Math.round(read(world.health))} / ${read(world.maxHealth)} HP   ·   light ${read(world.stats).lightLevel.toFixed(2)}`,
    })
  )

  children.push(
    readout(host, {
      x: () => read(world.viewWidth) / 2,
      y: () => read(world.viewHeight) - SLOT - 36,
      size: 12,
      align: 'center',
      fill: PALETTE.ink,
      text: () => read(world.heldName),
      outline: 'rgba(0,0,0,0.9)',
    })
  )

  // -- mining progress, if a tile is being broken -------------------------
  children.push(
    bar(host, {
      x: () => read(world.viewWidth) / 2 - 40,
      y: () => read(world.viewHeight) - SLOT - 22,
      width: 80,
      height: 4,
      value: () => read(world.lastMineProgress),
      fill: PALETTE.accent,
      track: 'rgba(0,0,0,0.55)',
    })
  )

  // -- hovered tile name, near the cursor ---------------------------------
  children.push(
    readout(host, {
      x: () => read(world.pointerX) + 14,
      y: () => read(world.pointerY) + 30,
      size: 11,
      text: () => world.hoverLabel.value,
      fill: () => (world.hoverTile.value ? PALETTE.ink : PALETTE.danger),
      outline: 'rgba(0,0,0,0.9)',
    })
  )

  // -- the tooltip: a shared widget, sized through the host's measurement --
  children.push(
    tooltip(host, {
      x: world.tooltipX,
      y: world.tooltipY,
      title: world.tooltipTitle,
      lines: world.tooltipLines,
      visible: world.tooltipVisible,
    })
  )

  // -- controls, top right ------------------------------------------------
  const hints: ReadonlyArray<readonly [string, string]> = [
    ['A D', 'walk'],
    ['W', 'jump'],
    ['LMB', 'mine'],
    ['RMB', 'place'],
    ['Q', 'zoom'],
    ['R', 'respawn'],
  ]
  children.push(
    host.stack({
      x: () => read(world.viewWidth) - 168,
      y: 14,
      children: hints.flatMap(([key, label], i) => [
        keycap(host, { x: 0, y: i * 19, label: key, size: 15 }),
        readout(host, { x: 44, y: i * 19 + 2, size: 11, text: () => label }),
      ]),
    })
  )

  // -- debug readout, bottom left ----------------------------------------
  children.push(
    readout(host, {
      x: 16,
      y: () => read(world.viewHeight) - 68,
      size: 11,
      fill: rgba(150, 200, 170, 0.9),
      text: () => {
        const s = read(world.stats)
        return `${s.fps.toFixed(0)} fps · tick ${s.tickMs.toFixed(2)}ms · bake ${s.bakeMs.toFixed(2)}ms · light ${s.lightMs.toFixed(2)}ms`
      },
    })
  )
  children.push(
    readout(host, {
      x: 16,
      y: () => read(world.viewHeight) - 53,
      size: 11,
      fill: rgba(150, 200, 170, 0.9),
      text: () => {
        const s = read(world.stats)
        return `${s.nodes} nodes · ${s.entityCount} drawn · ${s.bakes} bakes · ${(s.chunkBytes / 1048576).toFixed(1)} MB`
      },
    })
  )
  children.push(
    readout(host, {
      x: 16,
      y: () => read(world.viewHeight) - 38,
      size: 11,
      fill: rgba(150, 200, 170, 0.9),
      text: () => {
        const s = read(world.stats)
        return `seed ${s.seed} · x ${(s.positionX / 16).toFixed(0)} y ${(s.positionY / 16).toFixed(0)}`
      },
    })
  )

  return host.stack({ x: 0, y: 0, children }) as Mountable<CanvasNode>
}
