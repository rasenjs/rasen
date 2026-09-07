/**
 * StaticLayer — the pre-rendered world layer (sky + terrain + decorations).
 *
 * A scene component: sky rect + one camera-offset `image` of the offscreen
 * tile layer, grouped together.
 */

import { com } from '@rasenjs/core'
import { VIEW_H, VIEW_W } from './constants'
import type { Game } from './game'
import { THEME_SKY } from './themes'

export const StaticLayer = com((props: { game: Game }) => {
  const game = props.game
  return (
    <group>
      {/* Sky */}
      <rect
        x={0}
        y={0}
        width={VIEW_W}
        height={VIEW_H}
        fill={() => THEME_SKY[game.level.theme]}
      />
      {/* Pre-rendered level layer — pass the refs directly; the JSX prop
          system unrefs them itself */}
      <image image={game.staticLayer} x={game.camRenderX} y={0} />
    </group>
  )
})
