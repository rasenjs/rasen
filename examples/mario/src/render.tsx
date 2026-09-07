/**
 * Rasen UI — reactive DOM shell + reactive canvas-2d scene tree.
 *
 * The world is composed from self-contained pieces: `StaticLayer` (sky +
 * pre-rendered tiles), one entity pool per game object and `Hud`. Overlays
 * (title / world-intro card / game over / win) are DOM layers shown via
 * `when`.
 */

import { com } from '@rasenjs/core'
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
        ← → move · SHIFT/X run · ↓ crouch · SPACE / ↑ jump
        <br />
        Worlds 1-1 → 1-4 · Stomp enemies · Grow with mushrooms!
      </div>
    </div>
  )
}

/** Classic black world-intro card: WORLD 1-1, mario × lives. */
function IntroCard(props: { game: Game }) {
  const g = props.game
  return (
    <div
      style={{
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: '#000',
      }}
    >
      <div style={{ fontSize: '24px', color: '#fff', fontWeight: 'bold', letterSpacing: '2px' }}>
        {() => `WORLD ${g.worldLabel.value}`}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>🍄</span>
        <span style={{ fontSize: '20px', color: '#fff' }}>{() => `×  ${g.lives.value}`}</span>
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
        background: 'rgba(32, 36, 44, 0.85)',
        cursor: 'pointer',
      }}
      onClick={() => props.game.startGame()}
    >
      <div style={{ fontSize: '34px', fontWeight: 'bold', color: '#e33', textShadow: '3px 3px 0 #7a1f1f' }}>
        GAME OVER
      </div>
      <div style={{ fontSize: '13px', color: '#fff' }}>Press SPACE or click to retry</div>
    </div>
  )
}

function WinScreen(props: { game: Game }) {
  const g = props.game
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
        background: 'rgba(20, 60, 20, 0.75)',
        cursor: 'pointer',
      }}
      onClick={() => g.startGame()}
    >
      <div style={{ fontSize: '34px', fontWeight: 'bold', color: '#5f5', textShadow: '3px 3px 0 #164' }}>
        THANK YOU MARIO!
      </div>
      <div style={{ fontSize: '16px', color: '#ffd75e' }}>Your quest is complete.</div>
      <div style={{ fontSize: '13px', color: '#fff' }}>
        Final score: <b>{() => String(g.score.value)}</b>
      </div>
      <div style={{ fontSize: '12px', color: '#aab' }}>Press SPACE or click to play again</div>
    </div>
  )
}

// ── Touch controls (mobile) ──────────────────────────────────────────────

function TouchControls(props: { input: Input }) {
  const { input } = props
  const hold = (action: 'left' | 'right' | 'jump' | 'run' | 'down') => ({
    onPointerDown: (e: { preventDefault: () => void }) => {
      e.preventDefault()
      if (action === 'left') input.pressLeft()
      else if (action === 'right') input.pressRight()
      else if (action === 'run') input.pressRun()
      else if (action === 'down') input.pressDown()
      else input.pressJump()
    },
    onPointerUp: () => {
      if (action === 'left') input.releaseLeft()
      else if (action === 'right') input.releaseRight()
      else if (action === 'run') input.releaseRun()
      else if (action === 'down') input.releaseDown()
      else input.releaseJump()
    },
    onPointerLeave: () => {
      if (action === 'left') input.releaseLeft()
      else if (action === 'right') input.releaseRight()
      else if (action === 'run') input.releaseRun()
      else if (action === 'down') input.releaseDown()
      else input.releaseJump()
    },
  })
  const btn: Record<string, string | number> = {
    position: 'absolute',
    bottom: '10px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '20px',
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
      <span {...hold('right')} style={{ ...btn, left: '76px' }}>
        ▶
      </span>
      <span {...hold('down')} style={{ ...btn, left: '142px' }}>
        ▼
      </span>
      <span {...hold('run')} style={{ ...btn, right: '84px' }}>
        B
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
        {/* ── Reactive 2D scene ── */}
        <View2D game={game} />

        {/* ── DOM overlays ── */}
        {when({ condition: () => game.phase.value === 'title', then: () => <TitleScreen game={game} /> })}
        {when({ condition: () => game.phase.value === 'intro', then: () => <IntroCard game={game} /> })}
        {when({ condition: () => game.phase.value === 'gameover', then: () => <GameOverScreen game={game} /> })}
        {when({ condition: () => game.phase.value === 'win', then: () => <WinScreen game={game} /> })}

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
          onClick={() => {
            const muted = sfx.toggleMute()
            const bgmMuted = game.bgm.toggleMute()
            // keep both in sync; if unmuting, restart the current theme
            if (!muted && !bgmMuted && game.phase.value === 'playing') {
              game.bgm.playTheme(game.level.theme, game.hurry.value)
            }
          }}
        >
          🔊
        </span>
      </div>

      {/* Touch controls */}
      <TouchControls input={input} />

      {/* Footer hint */}
      <div style={{ fontSize: '12px', color: '#889', textAlign: 'center', lineHeight: '1.7' }}>
        ← → / A D move · SHIFT / X run · ↓ / S crouch · SPACE / ↑ / W jump
        <br />
        Built with <b>Rasen</b> — reactive canvas-2d renderer · levels &amp;
        sprites from the Meth Meth Method Super Mario data
      </div>
    </div>
  )
})

export function createApp(g: Game, i: Input) {
  game = g
  input = i
  return App
}
