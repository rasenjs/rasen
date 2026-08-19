/**
 * Rasen UI — reactive DOM shell + reactive canvas-2d scene tree.
 *
 * The world is composed from self-contained pieces: `StaticLayer` (sky +
 * pre-rendered tiles), one entity per game object (each renders itself via
 * its `render()` method → a canvas-2d `image`) and `Hud`. The game loop
 * mutates entity refs and the renderer redraws automatically. Overlays
 * (title / game over / win) are DOM layers shown via `when`.
 */

import { com } from '@rasenjs/core'
import { computed } from '@rasenjs/reactive-signals'
import { when } from '@rasenjs/dom'
import { VIEW_H, VIEW_W } from './constants'
import type { Game } from './game'
import { Input } from './input'
import { sfx } from './audio'
import { View2D } from './View2D'

const SCALE = 3
const W = VIEW_W * SCALE
const H = VIEW_H * SCALE

// ── Overlays (DOM, reactive) ─────────────────────────────────────────────

function TitleScreen(props: { game: Game }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        background: 'rgba(32, 36, 44, 0.55)',
        cursor: 'pointer',
        textAlign: 'center',
      }}
      onClick={() => props.game.startGame()}
    >
      <div style={{ fontSize: '40px', fontWeight: 'bold', color: '#e33', textShadow: '3px 3px 0 #7a1f1f', letterSpacing: '2px' }}>
        SUPER MARIO
      </div>
      <div style={{ fontSize: '16px', color: '#ffd75e' }}>★ Rasen Edition ★</div>
      <div style={{ fontSize: '13px', color: '#fff', marginTop: '8px' }}>
        Press <b>SPACE</b> / <b>↑</b> or click to start
      </div>
      <div style={{ fontSize: '11px', color: '#aab', lineHeight: '1.8' }}>
        ← → move&nbsp;&nbsp;·&nbsp;&nbsp;SPACE / ↑ jump
        <br />
        Stomp goombas · Grab coins · Reach the flag pole!
      </div>
    </div>
  )
}

function GameOverScreen(props: { game: Game }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'rgba(32, 36, 44, 0.65)',
        cursor: 'pointer',
      }}
      onClick={() => props.game.restart()}
    >
      <div style={{ fontSize: '34px', fontWeight: 'bold', color: '#e33', textShadow: '3px 3px 0 #7a1f1f' }}>
        GAME OVER
      </div>
      <div style={{ fontSize: '13px', color: '#fff' }}>Press SPACE or click to retry</div>
    </div>
  )
}

function WinScreen(props: { game: Game }) {
  const finalScore = computed(() => String(props.game.score.value))
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'rgba(20, 60, 20, 0.6)',
        cursor: 'pointer',
      }}
      onClick={() => props.game.restart()}
    >
      <div style={{ fontSize: '34px', fontWeight: 'bold', color: '#5f5', textShadow: '3px 3px 0 #164' }}>
        YOU WIN!
      </div>
      <div style={{ fontSize: '16px', color: '#ffd75e' }}>Thanks for playing!</div>
      <div style={{ fontSize: '13px', color: '#fff' }}>
        Final score: <b>{finalScore}</b>
      </div>
      <div style={{ fontSize: '12px', color: '#aab' }}>Press SPACE or click to play again</div>
    </div>
  )
}

// ── Touch controls (mobile) ──────────────────────────────────────────────

function TouchControls(props: { input: Input }) {
  const { input } = props
  const hold = (action: 'left' | 'right' | 'jump') => ({
    onPointerDown: (e: { preventDefault: () => void }) => {
      e.preventDefault()
      if (action === 'left') input.pressLeft()
      else if (action === 'right') input.pressRight()
      else input.pressJump()
    },
    onPointerUp: () => {
      if (action === 'left') input.releaseLeft()
      else if (action === 'right') input.releaseRight()
      else input.releaseJump()
    },
    onPointerLeave: () => {
      if (action === 'left') input.releaseLeft()
      else if (action === 'right') input.releaseRight()
      else input.releaseJump()
    },
  })
  const btn: Record<string, string | number> = {
    position: 'absolute',
    bottom: '10px',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '22px',
    userSelect: 'none',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  return (
    <div style={{ display: 'none' }}>
      <span {...hold('left')} style={{ ...btn, left: '10px' }}>
        ◀
      </span>
      <span {...hold('right')} style={{ ...btn, left: '84px' }}>
        ▶
      </span>
      <span {...hold('jump')} style={{ ...btn, right: '10px' }}>
        A
      </span>
    </div>
  )
}

// ── Main app ─────────────────────────────────────────────────────────────

// Module-level deps so `com()` runs at module top-level (required for the
// vite-plugin-rasen HMR wrapper: enterHmrModule/exitHmrModule are injected
// around the module, and com() must be called while the context is active).
let game!: Game
let input!: Input

const App = com(() => {
  const isTitle = computed(() => game.phase.value === 'title')
  const isGameOver = computed(() => game.phase.value === 'gameover')
  const isWin = computed(() => game.phase.value === 'win')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px' }}>
      <div
        style={{
          position: 'relative',
          width: `${W}px`,
          height: `${H}px`,
          flexShrink: 0,
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Reactive 2D scene — same Game logic, canvas-2d view ── */}
        <View2D game={game} />

        {/* ── DOM overlays ── */}
        {when({ condition: isTitle, then: () => <TitleScreen game={game} /> })}
        {when({ condition: isGameOver, then: () => <GameOverScreen game={game} /> })}
        {when({ condition: isWin, then: () => <WinScreen game={game} /> })}

        {/* Mute button */}
        <span
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            padding: '4px 10px',
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.45)',
            color: '#fff',
            fontSize: '13px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          onClick={() => sfx.toggleMute()}
        >
          🔊
        </span>
      </div>

      {/* Touch controls */}
      <TouchControls input={input} />

      {/* Footer hint */}
      <div style={{ fontSize: '12px', color: '#889', textAlign: 'center', lineHeight: '1.7' }}>
        ← → / A D move · SPACE / ↑ / W jump · click to restart
        <br />
        Built with <b>Rasen</b> — reactive canvas-2d renderer · sprites from the
        Meth Meth Method Super Mario tutorial
      </div>
    </div>
  )
})

export function createApp(g: Game, i: Input) {
  game = g
  input = i
  return App
}
