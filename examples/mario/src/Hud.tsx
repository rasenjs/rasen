/**
 * Hud — the reactive score/coins/world/time readout drawn on the canvas.
 *
 * Each label is a canvas-2d `text` component bound to a `computed` string
 * derived from the game's reactive state, so it updates automatically.
 * The TIME label flashes red once the hurry-up threshold is reached.
 */

import { com } from '@rasenjs/core'
import type { Game } from './game'

const FONT = 'bold 8px monospace'

export const Hud = com((props: { game: Game }) => {
  const g = props.game
  return (
    <group>
      <text text="MARIO" x={16} y={12} fill="#fff" font={FONT} />
      <text text={() => String(g.score.value).padStart(6, '0')} x={24} y={22} fill="#fff" font={FONT} />
      <image image={() => g.coinIcon()} x={88} y={15} />
      <text text={() => `×${String(g.coinCount.value).padStart(2, '0')}`} x={96} y={22} fill="#fff" font={FONT} />
      <text text="WORLD" x={144} y={12} fill="#fff" font={FONT} />
      <text text={() => g.worldLabel.value} x={152} y={22} fill="#fff" font={FONT} />
      <text text="TIME" x={200} y={12} fill="#fff" font={FONT} />
      <text
        text={() => String(g.timeLeft.value).padStart(3, '0')}
        x={208}
        y={22}
        fill={() => (g.hurry.value && Math.floor(g.clock * 4) % 2 === 0 ? '#f44' : '#fff')}
        font={FONT}
      />
    </group>
  )
})
