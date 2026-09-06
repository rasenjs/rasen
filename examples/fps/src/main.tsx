import { configureTags, com, type Mountable } from '@rasenjs/core'
import { mount, when } from '@rasenjs/dom'
import { ref } from '@rasenjs/reactive-signals'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { group, mesh, skybox, billboard, each, getRenderContext, type CameraConfig } from '@rasenjs/webgl'
import { Mat4x4f, vec3f, forwardVector, rightVector } from '@rasenjs/math'
import { loadFPSAssets } from './assets'
import { getLevelObjects, getEnemySpawns, getLevelWalls } from './level'
import { Player, rayBoxIntersect } from './player'
import { Enemy } from './enemy'
import { weapon } from './weapon'
import { setupKeyboard, bindLookControls } from './input'
import { SoundManager } from './sound'
import { createImpact, updateImpact, type Impact } from './impact'

useReactiveRuntime()
configureTags({ '': { mesh, group, skybox, weapon, billboard, each } })

const viewW = ref(window.innerWidth)
const viewH = ref(window.innerHeight)
const aspect = ref(viewW.value / viewH.value)
const muzzleFlash = ref(false)
const hitMarker = ref(false)
const recoil = ref(0)
let sound: SoundManager | null = null
// Active hit impacts (spawned at raycast collision points, animated + removed).
const impacts = ref<Impact[]>([])
// Enemy muzzle flash sprites (burst.png billboards at the enemy's blasters).
const muzzleFlashes = ref<Array<{ x: number; y: number; z: number; tex: HTMLImageElement }>>([])

// Clouds: white (no texture) + vertical sine bob, matching Godot's cloud.gd.
// Positions match the original scene's Decoration (cloud) nodes — scattered
// far outside the play area (x/z 20–36 units away).
const cloudDefs = [
  { x: -9.5, y: 8.5, z: 20.6, freq: 0.7, amp: 0.6 },
  { x: 25.6, y: 6.4, z: -12.1, freq: 1.2, amp: 0.4 },
  { x: 6.4, y: 6.4, z: -28.7, freq: 0.5, amp: 0.8 },
  { x: -2.75, y: 2.4, z: 25.4, freq: 0.9, amp: 0.5 },
  { x: 27.5, y: 12.0, z: -5.4, freq: 0.6, amp: 0.7 },
  { x: -28.6, y: 16.3, z: -4.9, freq: 1.0, amp: 0.5 },
  { x: -25.1, y: 8.8, z: -24.3, freq: 0.8, amp: 0.6 },
  { x: 14.1, y: 10.1, z: 17.5, freq: 0.5, amp: 0.9 },
].map((c) => ({ ...c, yRef: ref(c.y) }))

// === App (com pattern, same as craft) ===
interface AppProps {
  player: Player; enemies: Enemy[]
  assets: Awaited<ReturnType<typeof loadFPSAssets>>
  levelObjs: ReturnType<typeof getLevelObjects>
  muzzleFlash: { value: boolean }
  locked: { value: boolean }
  impacts: Impact[]
  muzzleFlashes: { value: Array<{ x: number; y: number; z: number; tex: HTMLImageElement }> }
  hitFrames: HTMLCanvasElement[]
}

const App = com((p: AppProps): Mountable<HTMLElement> => {
  const { player, enemies, assets, levelObjs, muzzleFlash: mf, locked: lk, impacts, muzzleFlashes, hitFrames } = p
  // Main camera — flat CameraConfig consumed by <canvas camera={...}>. The
  // lookAt target is the eye plus the yaw/pitch forward vector. A plain
  // getter keeps the config reactive (re-evaluated on every dep change)
  // while avoiding the ComputedRef/PropValue structural mismatch.
  const camera = (): CameraConfig => {
    const ep = player.eye.value
    const yaw = player.yaw.value
    const pitch = player.pitch.value
    const fwd = forwardVector(yaw, pitch)
    return {
      x: ep.x, y: ep.y, z: ep.z,
      target: { x: ep.x + fwd.x, y: ep.y + fwd.y, z: ep.z + fwd.z },
      fov: (80 * Math.PI) / 180,
      near: 0.1,
      far: 200,
    }
  }
  const levelMeshes: Mountable[] = []
  for (const obj of levelObjs) {
    const geo = assets.models.get(obj.model)
    if (geo) levelMeshes.push(<mesh geometry={{ vertices: geo.vertices, uv: geo.uv, normals: geo.normals }} texture={geo.texture}
      x={obj.x} y={obj.y} z={obj.z} rotationX={obj.rx ?? 0} rotationY={obj.ry ?? 0} rotationZ={obj.rz ?? 0}
      scaleX={obj.sx ?? 1} scaleY={obj.sy ?? 1} scaleZ={obj.sz ?? 1} />)
  }
  const eGeo = assets.models.get('enemy-flying')
  const enemyMeshes = enemies.filter(e => e.alive.value).map(e =>
    eGeo ? <mesh geometry={{ vertices: eGeo.vertices, uv: eGeo.uv, normals: eGeo.normals }} texture={eGeo.texture}
      x={e.x} y={e.y} z={e.z} rotationY={e.yaw} visible={e.alive} scaleX={1} scaleY={1} scaleZ={1} /> : null
  ) as Mountable[]
  const cGeo = assets.models.get('cloud')
  const cloudMeshes = cloudDefs.map(c =>
    cGeo ? <mesh geometry={{ vertices: cGeo.vertices, uv: cGeo.uv, normals: cGeo.normals }}
      x={c.x} y={c.yRef} z={c.z} scaleX={3} scaleY={3} scaleZ={3} /> : null
  ) as Mountable[]
  // Decorative plants (grass-small) scattered across ALL platforms — not just
  // the main one. Positions sit on each platform's top surface.
  const pGeo = assets.models.get('grass-small')
  const plantDefs = [
    // Main ground platform (0,-0.5,0), top y=0
    { x: -1.8, y: 0, z: 1.6 }, { x: 1.5, y: 0, z: 2.2 }, { x: 2.1, y: 0, z: -1.2 },
    { x: -0.8, y: 0, z: -2.2 }, { x: -2.3, y: 0, z: -0.6 },
    // platform-large-grass2 (-2,0.5,-6), top y=1
    { x: -2.8, y: 1, z: -6.8 }, { x: -1.2, y: 1, z: -5.2 },
    // platform-large-grass3 (-6,1,2.5), top y=1.5
    { x: -6.8, y: 1.5, z: 1.7 }, { x: -5.2, y: 1.5, z: 3.3 },
    // platform-large-grass4 (5,0.5,5.5), top y=1
    { x: 4.2, y: 1, z: 4.7 }, { x: 5.8, y: 1, z: 6.3 },
    // platform (2.5,3,-3.5), top y=3.5
    { x: 2.5, y: 3.5, z: -3.5 },
  ]
  const plantMeshes = plantDefs.map(p =>
    pGeo ? <mesh geometry={{ vertices: pGeo.vertices, uv: pGeo.uv, normals: pGeo.normals }} texture={pGeo.texture}
      x={p.x} y={p.y} z={p.z} scaleX={1} scaleY={1} scaleZ={1} /> : null
  ) as Mountable[]
  // Weapon (blaster) — follows camera via reactive refs
  const wGeo = assets.models.get('blaster')

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas className="fps-canvas" width={viewW} height={viewH}
        contextType="webgl2" camera={camera} contextOptions={{ preserveDrawingBuffer: true }} renderOptions={{ clearColor: "#87CEEB", continuousRender: true }}
        style={{ width: '100%', height: '100%', display: 'block' }}>
        {/* Skybox FIRST so it renders as background (before scene geometry) */}
        <skybox texture={assets.textures.get('skybox')} radius={150} position={player.eye} />
        <group children={levelMeshes as Mountable[]} />
        <group children={enemyMeshes as Mountable[]} />
        <group children={cloudMeshes as Mountable[]} />
        <group children={plantMeshes as Mountable[]} />
        {/* Hit impacts — camera-facing sprites at raycast collision points */}
        {each(() => impacts.value.filter(i => i.alive.value), (i) => (
          <billboard x={i.x} y={i.y} z={i.z} width={0.32} height={0.32} texture={i.texture} mode="vertical" />
        ))}
        {/* Enemy muzzle flashes — burst sprites at the enemy's blasters */}
        {each(() => muzzleFlashes.value, (f) => (
          <billboard x={f.x} y={f.y} z={f.z} width={0.5} height={0.5} texture={f.tex} mode="full" />
        ))}
        {/* Weapon — follows camera */}
        {wGeo ? <weapon player={player} geometry={wGeo} recoil={recoil} muzzleFlash={muzzleFlash} burstTexture={assets.textures.get('burst')} /> : <></>}
      </canvas>
      {/* Crosshair — matches Godot: crosshair.png 128px × scale 0.35 ≈ 45px */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '45px', height: '45px',
        backgroundImage: `url(${(assets.textures.get('crosshair') as HTMLImageElement | undefined)?.src ?? ''})`,
        backgroundSize: 'contain', backgroundPosition: 'center', pointerEvents: 'none', opacity: 0.9 }} />
      {/* Hit marker — flashes when a shot lands */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '60px', height: '60px',
        backgroundImage: `url(${(assets.textures.get('hit') as HTMLImageElement | undefined)?.src ?? ''})`,
        backgroundSize: 'contain', backgroundPosition: 'center', pointerEvents: 'none', opacity: hitMarker.value ? 1 : 0 }} />
      {/* Muzzle flash */}
      <div style={{ position: 'absolute', left: '50%', top: '65%', transform: 'translate(-50%,-50%)', width: '64px', height: '64px',
        backgroundImage: `url(${(assets.textures.get('burst') as HTMLImageElement | undefined)?.src ?? ''})`,
        backgroundSize: 'contain', pointerEvents: 'none', opacity: mf.value ? 1 : 0, mixBlendMode: 'screen' }} />
      {/* HUD */}
      <div style={{ position: 'absolute', left: '16px', bottom: '12px', right: '16px', display: 'flex',
        justifyContent: 'space-between', fontFamily: "'Courier New', monospace", fontSize: '14px',
        color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        <div>♥ {() => `${player.health.value}/${player.maxHealth}`}</div><div>Blaster</div><div>Kills: 0 · 60 fps</div>
      </div>
      {/* Start screen veil */}
      {when({
        condition: () => !lk.value,
        then: () => (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(0,0,0,0.85)',
            color: '#e5e7eb', fontFamily: "'Courier New', monospace", cursor: 'pointer', zIndex: 10 }}>
            <h1 style={{ margin: 0, fontSize: '36px', letterSpacing: '3px', color: '#ef4444' }}>FPS ARENA</h1>
            <p style={{ fontSize: '13px', lineHeight: 1.8, margin: 0, opacity: 0.8 }}>
              WASD move · Space jump · Mouse aim<br />Left click shoot · E switch weapon</p>
          </div>
        ),
      })}
    </div>
  )
})

function createApp(player: Player, enemies: Enemy[], assets: Awaited<ReturnType<typeof loadFPSAssets>>, locked: ReturnType<typeof ref<boolean>>, hitFrames: HTMLCanvasElement[]) {
  return () => App({ player, enemies, assets, levelObjs: getLevelObjects(), muzzleFlash, locked, impacts, muzzleFlashes, hitFrames })
}

/**
 * Crop hit.png (2×2 grid of 128px frames) into 4 individual frame canvases,
 * matching Godot impact.tscn's AtlasTexture regions.
 */
function cropHitFrames(hit: HTMLImageElement): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = []
  const size = 128
  for (let i = 0; i < 4; i++) {
    const sx = (i % 2) * size
    const sy = Math.floor(i / 2) * size
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const ctx = c.getContext('2d')!
    ctx.drawImage(hit, sx, sy, size, size, 0, 0, size, size)
    frames.push(c)
  }
  return frames
}

// === Main ===
async function start() {
  const container = document.getElementById('app')!
  container.textContent = 'Loading...'
  const assets = await loadFPSAssets(m => { container.textContent = m })
  sound = new SoundManager(assets.sounds)
  window.addEventListener('resize', () => {
    viewW.value = window.innerWidth; viewH.value = window.innerHeight; aspect.value = viewW.value / viewH.value
  })
  const player = new Player(); const keys = setupKeyboard()
  const locked = ref(false)

  const enemies = getEnemySpawns().map(s => new Enemy(s.x, s.y, s.z))
  const walls = getLevelWalls()
  const mouse = { yaw: player.yaw, pitch: player.pitch, locked, request: () => {}, release: () => {} }

  // Pre-crop hit.png into 4 animation frames for impact sprites.
  const hitFrames = cropHitFrames(assets.textures.get('hit')!)

  const app = createApp(player, enemies, assets, locked, hitFrames)
  mount(app(), container)

  // Enable shadow mapping (directional sun, matching the Godot light) and the
  // dual-camera overlay (weapon camera, FOV 40° — matches Godot's CameraItem).
  let renderContext: ReturnType<typeof getRenderContext> | null = null
  const canvasEl = document.querySelector('canvas') as HTMLCanvasElement
  if (canvasEl) {
    const gl = canvasEl.getContext('webgl2')
    if (gl) {
      renderContext = getRenderContext(gl)
      // Godot DirectionalLight3D transform column 3 = light -Z (propagation) =
      // (0.906308, -0.323744, 0.271654). toward-light = the negation.
      const towardLight = new Float32Array([-0.906308, 0.323744, -0.271654])
      const len = Math.hypot(towardLight[0], towardLight[1], towardLight[2])
      const d = [towardLight[0] / len, towardLight[1] / len, towardLight[2] / len]
      const eye = vec3f(d[0] * 80, d[1] * 80 + 2, d[2] * 80)
      const lightView = Mat4x4f.lookAt(eye, vec3f(0, 2, 0), vec3f(0, 1, 0))
      const lightProj = Mat4x4f.ortho(-30, 30, -30, 30, 1, 200)
      renderContext.enableShadows(lightProj.multiply(lightView))
      // Configure the overlay (weapon) camera with the same eye/yaw/pitch as
      // the main camera but FOV 40°. Matrices are updated every frame.
      renderContext.setOverlayCamera(2, Mat4x4f.identity(), Mat4x4f.perspective((40 * Math.PI) / 180, aspect.value, 0.1, 200))
    }
  }

  ;(window as unknown as { __fps?: typeof assets }).__fps = assets
  // Debug hook: expose player + enemies for testing shooting/hit logic.
  ;(window as unknown as { __game?: { player: Player; enemies: Enemy[] } }).__game = { player, enemies }
  // Debug hook: expose impacts + muzzle flash + recoil state.
  ;(window as unknown as { __fx?: { impacts: typeof impacts; muzzleFlash: typeof muzzleFlash; recoil: typeof recoil; muzzleFlashes: typeof muzzleFlashes } }).__fx = { impacts, muzzleFlash, recoil, muzzleFlashes }
  // Debug hook: expose render context for manual render triggering.
  ;(window as unknown as { __rc?: typeof renderContext }).__rc = renderContext

  setTimeout(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement
    if (canvas) bindInput(canvas, player, mouse, enemies, locked, hitFrames, walls)
  }, 100)

  player.spawn(0, 1, 0)
  let last = performance.now(), frames = 0, since = last
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now
    player.update(dt, walls, keys)
    for (const e of enemies) e.update(dt, player.pos.value.x, player.pos.value.z)
    // Enemy attacks: every 0.25s (Godot enemy.tscn Timer) the enemy fires a
    // 5-unit RayCast toward the player. If it hits (in range + line of sight)
    // the enemy muzzle flashes, plays the attack sound, and damages the player
    // by 5 (Godot enemy.gd _on_timer_timeout → collider.damage(5)).
    const burstTex = assets.textures.get('burst')!
    for (const e of enemies) {
      if (e.canAttack()) {
        e.resetAttack()
        const ex = e.x.value, ey = e.y.value, ez = e.z.value
        const px = player.pos.value.x, py = player.pos.value.y + 1, pz = player.pos.value.z
        const dx = px - ex, dy = py - ey, dz = pz - ez
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
        // Godot RayCast target_position = (0,0,5) → 5-unit range.
        if (dist <= 5) {
          // Line of sight: a wall between the enemy and player blocks the shot.
          const dir = { x: dx / dist, y: dy / dist, z: dz / dist }
          let blocked = false
          for (const w of walls) {
            const hit = rayBoxIntersect({ x: ex, y: ey, z: ez }, dir, w)
            if (hit && hit.t < dist) { blocked = true; break }
          }
          if (!blocked) {
            e.flashMuzzle()
            // Spawn burst sprites at both blaster muzzles (Godot MuzzleA/B).
            for (const m of e.muzzlePositions()) {
              const f = { x: m.x, y: m.y, z: m.z, tex: burstTex }
              muzzleFlashes.value = [...muzzleFlashes.value, f]
              setTimeout(() => {
                muzzleFlashes.value = muzzleFlashes.value.filter(x => x !== f)
              }, 70)
            }
            player.damage(5)
            sound?.play('enemy_attack')
          }
        }
      }
    }
    // Cloud bob animation (Godot cloud.gd: sine vertical movement)
    const t = now / 1000
    for (const c of cloudDefs) {
      c.yRef.value = c.y + Math.cos(t * c.freq) * c.amp
    }
    // Advance impact animations; drop finished ones (Godot impact.gd removes
    // itself when the "shot" animation finishes).
    for (let i = impacts.value.length - 1; i >= 0; i--) {
      if (!updateImpact(impacts.value[i], dt, hitFrames)) {
        impacts.value = impacts.value.filter((_, idx) => idx !== i)
      }
    }
    // Update the weapon (overlay) camera to follow the player.
    if (renderContext) {
      const ep = player.eye.value
      const fwd = forwardVector(player.yaw.value, player.pitch.value)
      const ovView = Mat4x4f.lookAt(
        vec3f(ep.x, ep.y, ep.z),
        vec3f(ep.x + fwd.x, ep.y + fwd.y, ep.z + fwd.z),
        vec3f(0, 1, 0),
      )
      renderContext.setOverlayCamera(2, ovView, Mat4x4f.perspective((40 * Math.PI) / 180, aspect.value, 0.1, 200))
    }
    frames++
    if (now - since >= 500) { frames = 0; since = now }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function bindInput(canvas: HTMLCanvasElement, player: Player, mouse: { yaw: ReturnType<typeof ref<number>>; pitch: ReturnType<typeof ref<number>>; locked: ReturnType<typeof ref<boolean>>; request: () => void; release: () => void }, enemies: Enemy[], _locked: ReturnType<typeof ref<boolean>>, hitFrames: HTMLCanvasElement[], walls: ReturnType<typeof getLevelWalls>) {
  // DOM 适配器负责 pointer-lock API 与事件监听；相机模块只提供纯状态机。
  const controls = bindLookControls(canvas, mouse)
  mouse.request = controls.request; mouse.release = controls.release
  document.addEventListener('click', () => { if (!mouse.locked.value) mouse.request() })
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    // Request pointer lock on first click (for mouse look), but ALWAYS allow
    // shooting — don't gate the shot on lock state (it may fail in some envs).
    if (!mouse.locked.value) mouse.request()
    if (!player.canShoot(performance.now())) return
    player.lastShot.value = performance.now()
    const weapon = player.currentWeapon.value
    sound?.play('blaster')
    muzzleFlash.value = true; setTimeout(() => { muzzleFlash.value = false }, 60)
    // Recoil: weapon kicks back (Godot: container.position.z += 0.25)
    recoil.value = 0.25
    setTimeout(() => { recoil.value = 0 }, 80)

    // Fire weapon.shotCount rays, each with random spread. Godot sets
    // raycast.target_position.x/y = randf_range(-spread, spread) in the
    // camera's LOCAL space (base target = (0,0,-max_distance)), so the spread
    // is a positional offset, NOT an angle. World dir = right*sx + up*sy +
    // forward*maxDistance, normalized.
    const eye = player.eye.value
    const yaw = player.yaw.value
    const pitch = player.pitch.value
    const fwd = forwardVector(yaw, pitch)
    const right = rightVector(yaw)
    // up = cross(right, forward)
    const up = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    }
    let hit = false
    for (let n = 0; n < weapon.shotCount; n++) {
      const sx = (Math.random() * 2 - 1) * weapon.spread
      const sy = (Math.random() * 2 - 1) * weapon.spread
      let dx = right.x * sx + up.x * sy + fwd.x * weapon.maxDistance
      let dy = right.y * sx + up.y * sy + fwd.y * weapon.maxDistance
      let dz = right.z * sx + up.z * sy + fwd.z * weapon.maxDistance
      const len = Math.hypot(dx, dy, dz) || 1
      dx /= len; dy /= len; dz /= len
      const dir = { x: dx, y: dy, z: dz }

      // Find the closest collision among enemies and walls (Godot RayCast
      // returns the nearest collider).
      let bestT = Infinity
      let best: { x: number; y: number; z: number; nx: number; ny: number; nz: number; enemy?: Enemy } | null = null

      for (const enemy of enemies) {
        if (!enemy.alive.value) continue
        const t = enemy.rayHit(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, weapon.maxDistance)
        if (t !== null && t < bestT) {
          bestT = t
          best = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t, nx: 0, ny: 0, nz: 0, enemy }
        }
      }
      for (const w of walls) {
        const h = rayBoxIntersect(eye, dir, w)
        if (h && h.t < bestT) {
          bestT = h.t
          best = { x: h.x, y: h.y, z: h.z, nx: h.nx, ny: h.ny, nz: h.nz }
        }
      }

      // No collision within max_distance → no impact (Godot: continue).
      if (!best) continue

      if (best.enemy) {
        best.enemy.damage(weapon.damage)
        hit = true
        if (!best.enemy.alive.value) sound?.play('enemy_destroy'); else sound?.play('enemy_hurt')
      }

      // Spawn impact at collision_point + normal/10 (Godot impact.tscn).
      const px = best.x + best.nx / 10
      const py = best.y + best.ny / 10
      const pz = best.z + best.nz / 10
      impacts.value = [...impacts.value, createImpact(px, py, pz, hitFrames)]
    }

    // Knockback (Godot action_shoot): camera pitch kick, yaw kick, backward push.
    player.applyKnockback(weapon)

    if (hit) {
      hitMarker.value = true
      setTimeout(() => { hitMarker.value = false }, 120)
    }
  })
  canvas.addEventListener('contextmenu', e => e.preventDefault())
  window.addEventListener('keydown', e => { if (e.code === 'KeyE') { player.switchWeapon(); sound?.play('weapon_change') } })
}

start()
