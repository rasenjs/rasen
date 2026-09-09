/**
 * Render — the Rasen app: a full-screen WebGL canvas with the first-person
 * camera and the chunked voxel world, plus a DOM HUD overlay.
 *
 * One JSX tree for everything: DOM elements (div overlays) and WebGL
 * components (canvas children) live in the same tree, each rendering into its
 * own host — Rasen's "one reactive core, multiple render targets" model.
 */

import { com, each } from '@rasenjs/core'
import { ref } from '@rasenjs/reactive-signals'
import { when } from '@rasenjs/dom'
import { createAtlas } from './blocks'
import type { MouseControls } from './input'
import type { Player } from './player'
import type { VoxelChunk, World } from './world'
import type { CameraConfig } from '@rasenjs/gfx'
import { forwardVector } from '@rasenjs/math'

// Texture atlas is static — build once.
const atlas = createAtlas()

// Viewport tracks the window size (in CSS px). The canvas' logical size and
// the camera's aspect follow it reactively, so resizing the window grows the
// visible area instead of stretching the image.
const viewW = ref(window.innerWidth)
const viewH = ref(window.innerHeight)
const aspect = ref(viewW.value / viewH.value)
if (!(window as unknown as { __rasenCraftViewport?: boolean }).__rasenCraftViewport) {
  ;(window as unknown as { __rasenCraftViewport?: boolean }).__rasenCraftViewport = true
  window.addEventListener('resize', () => {
    viewW.value = window.innerWidth
    viewH.value = window.innerHeight
    aspect.value = viewW.value / viewH.value
  })
}

const BLOCK_NAMES: Record<number, string> = {
  1: 'grass',
  2: 'dirt',
  3: 'stone',
  4: 'sand',
  5: 'wood',
  6: 'leaves',
  7: 'plank',
  8: 'glass',
}

interface AppProps {
  world: World
  player: Player
  mouse: MouseControls
  selectedBlock: { value: number }
  fps: { value: number }
}

export function createApp(
  world: World,
  player: Player,
  mouse: MouseControls,
  selectedBlock: { value: number },
  fps: { value: number },
) {
  return () => App({ world, player, mouse, selectedBlock, fps })
}

// `com` must be called at module top level (vite-plugin-rasen HMR contract).
const App = com((props: AppProps) => {
  const { world, player, mouse, selectedBlock, fps } = props

  // Camera — flat CameraConfig consumed by <canvas camera={...}> (replaces
  // the FirstPersonCamera component). The lookAt target is the eye plus the
  // yaw/pitch forward vector. A plain getter keeps it reactive while avoiding
  // the ComputedRef/PropValue structural mismatch.
  const camera = (): CameraConfig => {
    const ep = player.eye.value
    const yaw = player.yaw.value
    const pitch = player.pitch.value
    const fwd = forwardVector(yaw, pitch)
    return {
      x: ep.x, y: ep.y, z: ep.z,
      target: { x: ep.x + fwd.x, y: ep.y + fwd.y, z: ep.z + fwd.z },
      fov: Math.PI / 3,
      near: 0.1,
      far: 400,
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#0a0d13',
      }}
    >
      <canvas
        className="game-canvas"
        width={viewW}
        height={viewH}
        contextType="webgl"
        camera={camera}
        renderOptions={{ clearColor: "#87CEEB" }}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      >
        {each(world.chunks, (c: VoxelChunk) => (
          <mesh
            geometry={c.geo}
            texture={atlas}
          />
        ))}
      </canvas>

      {/* crosshair */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '18px',
          height: '18px',
          pointerEvents: 'none',
          opacity: 0.9,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '8px',
            top: '0',
            width: '2px',
            height: '18px',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 2px rgba(0,0,0,0.8)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '0',
            width: '18px',
            height: '2px',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 2px rgba(0,0,0,0.8)',
          }}
        />
      </div>

      {/* click-to-play veil — shown only until the game starts */}
      {when({
        condition: () => !mouse.locked.value,
        then: () => (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              background: 'rgba(6,10,16,0.82)',
              color: '#dde6f2',
              fontFamily: "'Courier New', monospace",
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <h1 style={{ margin: 0, fontSize: '34px', letterSpacing: '4px' }}>
              CRAFT · RASEN
            </h1>
            <p style={{ margin: '4px 0', fontSize: '13px', lineHeight: 1.7 }}>
              click to play · WASD move · space jump · shift sprint
              <br />
              left click break · right click place · 1-8 select block
            </p>
            <p style={{ margin: 6, fontSize: '12px', opacity: 0.75 }}>
              a voxel world built with the rasen reactive webgl renderer
            </p>
          </div>
        ),
      })}

      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          left: '12px',
          bottom: '10px',
          right: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: "'Courier New', monospace",
          fontSize: '13px',
          color: 'rgba(255,255,255,0.92)',
          textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          pointerEvents: 'none',
        }}
      >
        <span>{() => `pos ${player.pos.value.x.toFixed(1)} ${player.pos.value.y.toFixed(1)} ${player.pos.value.z.toFixed(1)}`}</span>
        <span>{() => `block: ${BLOCK_NAMES[selectedBlock.value] ?? '?'} (${selectedBlock.value})`}</span>
        <span>{() => `chunks ${world.chunks.value.length} · ${fps.value} fps`}</span>
      </div>
    </div>
  )
})
