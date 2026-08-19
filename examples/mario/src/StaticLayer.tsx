/**
 * StaticLayer — the pre-rendered world layer (sky + terrain + decorations).
 *
 * A scene component: sky rect + one camera-offset `image` of the offscreen
 * tile layer, grouped together.
 */

import { com } from '@rasenjs/core'
import { computed } from '@rasenjs/reactive-signals'
import { VIEW_H, VIEW_W } from './constants'
import type { Game } from './game'

const SKY = '#5c94fc'

export const StaticLayer = com((props: { game: Game }) => {
  const camOffset = computed(() => -props.game.camX.value)
  return (
    <group>
      {/* Sky */}
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill={SKY} />
      {/* Pre-rendered static level layer (camera-offset) */}
      <image image={props.game.assets.staticLayer} x={camOffset} y={0} />
    </group>
  )
})
