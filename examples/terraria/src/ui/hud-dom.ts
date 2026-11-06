/**
 * The DOM half of the interface: the satchel and the crafting panel.
 *
 * This file imports exactly the same widget functions as `hud-canvas.ts` — the only
 * difference is which host object is passed in. Read the two side by side:
 * `itemSlot(domUiHost, …)` and `itemSlot(canvasUiHost, …)` are the same call.
 *
 * ## Why these two panels live in the DOM and the hotbar does not
 *
 * The hotbar is part of the world view: it has to sit exactly at the bottom centre of
 * the canvas, and it is always visible. The satchel and the crafting list are
 * *documents* — a grid of nine, a scrollable list of rows with labels and numbers.
 * `@rasenjs/canvas-2d` has no layout engine on purpose (every node takes explicit
 * coordinates), so a list of variable-height rows would mean reimplementing flow
 * layout by hand for no benefit. That is a layout decision, not a widget decision:
 * the *slots and rows* are the shared part, and they are shared.
 *
 * This is also, incidentally, exactly the split Open-Terraria arrived at from the
 * other direction — its canvas UI grew a DOM overlay for the panels that were awkward
 * on canvas.
 */

import type { Mountable } from '@rasenjs/core'
import { each } from '@rasenjs/core'
import { RECIPES, itemDef, guideRecipes } from '../core/items'
import type { Toast, World } from '../core/world'
import type { TileAtlas } from '../render/atlas'
import { domUiHost } from './kit-dom'
import { PALETTE, read } from './kit'
import { itemSlot, keycap, readout, tooltip } from './widgets'

const SLOT = 40
const GAP = 5
const COLS = 9
const ROW_H = 26

export function HudDomLayer(props: { world: World; atlas: TileAtlas }): Mountable<HTMLElement> {
  const { world } = props
  const host = domUiHost

  // -- the satchel ---------------------------------------------------------
  const satchel = host.stack({
    x: 16,
    y: 62,
    children: [
      host.box({
        x: 0,
        y: 0,
        width: COLS * (SLOT + GAP) - GAP + 20,
        height: () => {
          const rows = Math.max(1, Math.ceil(read(world.inventory).length / COLS))
          return rows * (SLOT + GAP) - GAP + 32
        },
        fill: PALETTE.panel,
        stroke: PALETTE.panelEdge,
        lineWidth: 1,
        radius: 6,
      }),
      host.label({
        x: 10,
        y: 9,
        text: () => 'Satchel',
        fill: PALETTE.accent,
        size: 12,
        weight: 'bold',
        baseline: 'top',
      }),
      // A live count, right-aligned inside the panel.
      host.label({
        x: COLS * (SLOT + GAP) - GAP + 10,
        y: 9,
        text: () => `${read(world.inventory).length} kinds`,
        fill: PALETTE.inkDim,
        size: 11,
        align: 'right',
        baseline: 'top',
      }),
      host.stack({
        x: 10,
        y: 28,
        children: Array.from({ length: 18 }, (_, i) =>
          // The same `itemSlot` the canvas hotbar uses.
          itemSlot(host, {
            stack: () => read(world.inventory)[i] ?? null,
            geometry: {
              x: (i % COLS) * (SLOT + GAP),
              y: Math.floor(i / COLS) * (SLOT + GAP),
              size: SLOT,
            },
          })
        ),
      }),
    ],
  })

  // -- the crafting panel --------------------------------------------------
  // Toggled with E. Every row is a real recipe: clicking it attempts the craft
  // through `world.craft`, which validates and consumes through the same code path
  // the simulation uses.
  const recipes = guideRecipes()
  const craftPanel = host.stack({
    x: 16,
    y: () => 62 + (Math.max(1, Math.ceil(read(world.inventory).length / COLS)) * (SLOT + GAP) + 22),
    opacity: () => (read(world.craftOpen) ? 1 : 0),
    children: [
      host.box({
        x: 0,
        y: 0,
        width: COLS * (SLOT + GAP) - GAP + 20,
        height: recipes.length * ROW_H + 34,
        fill: PALETTE.panel,
        stroke: PALETTE.panelEdge,
        lineWidth: 1,
        radius: 6,
      }),
      host.label({
        x: 10,
        y: 9,
        text: () => 'Crafting',
        fill: PALETTE.accent,
        size: 12,
        weight: 'bold',
        baseline: 'top',
      }),
      host.label({
        x: COLS * (SLOT + GAP) - GAP + 10,
        y: 9,
        text: () => 'E to close',
        fill: PALETTE.inkDim,
        size: 10,
        align: 'right',
        baseline: 'top',
      }),
      ...recipes.flatMap((recipe, index) => {
        const y = 28 + index * ROW_H
        const canCraft = () => read(world.craftAvailable)[RECIPES.indexOf(recipe)] ?? false
        return [
          // The row background doubles as the button, so the whole row is clickable
          // rather than just the icon.
          host.box({
            x: 8,
            y,
            width: COLS * (SLOT + GAP) - GAP + 4,
            height: ROW_H - 3,
            fill: () => (canCraft() ? 'rgba(44,52,40,0.9)' : 'rgba(26,28,36,0.65)'),
            radius: 3,
            interactive: true,
            onClick: () => world.craft(RECIPES.indexOf(recipe)),
          }),
          host.icon({
            x: 12,
            y: y + 2,
            size: 18,
            item: () => recipe.output.item,
          }),
          host.label({
            x: 36,
            y: y + (ROW_H - 3) / 2,
            text: () => itemDef(recipe.output.item).name,
            fill: () => (canCraft() ? PALETTE.ink : PALETTE.inkDim),
            size: 11,
            baseline: 'middle',
          }),
          // A compact ingredient summary: "2 stone + 1 wood".
          host.label({
            x: COLS * (SLOT + GAP) - GAP + 8,
            y: y + (ROW_H - 3) / 2,
            text: () =>
              recipe.inputs
                .map((need) => `${world.countOf(need.item)}/${need.count} ${itemDef(need.item).name}`)
                .join('  +  '),
            fill: () => (canCraft() ? PALETTE.accent : PALETTE.inkDim),
            size: 10,
            align: 'right',
            baseline: 'middle',
          }),
        ] as Array<Mountable<HTMLElement>>
      }),
    ],
  })

  // -- the control legend --------------------------------------------------
  const hints: ReadonlyArray<readonly [string, string]> = [
    ['A D', 'walk'],
    ['W', 'jump'],
    ['LMB', 'use / mine'],
    ['RMB', 'place'],
    ['1-6', 'select'],
    ['E', 'craft'],
    ['Q', 'zoom'],
    ['R', 'respawn'],
  ]
  const legend = host.stack({
    x: () => read(world.viewWidth) - 150,
    y: 14,
    children: hints.flatMap(([key, label], i) => [
      keycap(host, { x: 0, y: i * 18, label: key, size: 14 }),
      readout(host, { x: 40, y: i * 18 + 2, size: 11, text: () => label }),
    ]),
  })

  // -- the death screen ----------------------------------------------------
  const death = host.stack({
    x: 0,
    y: 0,
    opacity: () => (read(world.dead) ? 1 : 0),
    children: [
      host.box({
        x: 0,
        y: 0,
        width: () => read(world.viewWidth),
        height: () => read(world.viewHeight),
        fill: 'rgba(48,10,10,0.5)',
      }),
      host.label({
        x: () => read(world.viewWidth) / 2,
        y: () => read(world.viewHeight) / 2 - 14,
        text: () => 'You were slain',
        fill: 'rgba(238,120,110,1)',
        size: 30,
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
      }),
      host.label({
        x: () => read(world.viewWidth) / 2,
        y: () => read(world.viewHeight) / 2 + 20,
        text: () => 'Respawning…',
        fill: PALETTE.inkDim,
        size: 13,
        align: 'center',
        baseline: 'middle',
      }),
    ],
  })

  // -- toasts --------------------------------------------------------------
  // A variable-length list, which is exactly what `each` is for: the DOM side can
  // afford real structural updates because `each` reuses nodes by object identity and
  // only the entering and leaving rows cost anything.
  const toasts = host.stack({
    x: 0,
    y: 0,
    children: [
      each(read(world.toasts) as Toast[], (toast: Toast, index: number) =>
        host.label({
          x: () => read(world.viewWidth) / 2,
          y: () => 90 + index * 18,
          text: () => toast.text,
          fill: PALETTE.ink,
          size: 12,
          align: 'center',
          baseline: 'top',
          outline: 'rgba(0,0,0,0.9)',
        })
      ) as unknown as Mountable<HTMLElement>,
    ],
  })

  // -- the world tooltip, mirroring the canvas one -------------------------
  // Deliberately the *same widget* reading the *same signals* as the tooltip drawn
  // over the world — the clearest single demonstration that the host split is real.
  const worldTooltip = tooltip(host, {
    x: () => read(world.viewWidth) - 210,
    y: () => read(world.viewHeight) - 150,
    title: () => read(world.tooltipTitle) || 'Nothing hovered',
    lines: () =>
      read(world.tooltipVisible)
        ? [...read(world.tooltipLines), 'DOM copy of the canvas tooltip']
        : ['hover a tile to inspect it'],
    visible: () => true,
    fontSize: 11,
  })

  return host.stack({
    x: 0,
    y: 0,
    children: [satchel, craftPanel, legend, death, toasts, worldTooltip],
  }) as unknown as Mountable<HTMLElement>
}
