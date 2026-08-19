/**
 * Hud — the reactive score/coins/time/lives readout drawn on the canvas.
 *
 * Each label is a canvas-2d `text` component bound to a `computed` string
 * derived from the game's reactive state, so it updates automatically.
 */

import { com } from '@rasenjs/core'
import { computed } from '@rasenjs/reactive-signals'
import type { Game } from './game'

const FONT = 'bold 8px monospace'

export const Hud = com((props: { game: Game }) => {
  const g = props.game
  const scoreText = computed(() => String(g.score.value).padStart(6, '0'))
  const coinText = computed(() => String(g.coinCount.value).padStart(2, '0'))
  const timeText = computed(() => String(g.timeLeft.value).padStart(3, '0'))
  const lifeText = computed(() => String(g.lives.value))

  return (
    <group>
      <text text="MARIO" x={16} y={12} fill="#fff" font={FONT} />
      <text text={scoreText} x={49} y={12} fill="#fff" font={FONT} />
      <text text="WORLD" x={148} y={12} fill="#fff" font={FONT} />
      <text text="1-1" x={170} y={12} fill="#fff" font={FONT} />
      <text text="TIME" x={194} y={12} fill="#fff" font={FONT} />
      <text text={timeText} x={224} y={12} fill="#fff" font={FONT} />
      <text text={`LIVES ${lifeText}`} x={16} y={22} fill="#fff" font={FONT} />
      <text text={`×${coinText}`} x={118} y={22} fill="#fff" font={FONT} />
    </group>
  )
})
