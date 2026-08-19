/**
 * Racing — Kenney Starter Kit Racing recreated with Rasen.
 *
 * A 3D chase-cam racing game: drive the yellow truck around the track loop,
 * drift through corners, and watch the camera pull back as you speed up.
 * Ported from the Godot starter kit (vehicle.gd / view.gd / main.tscn).
 */
import { configureTags, com, type Mountable } from '@rasenjs/core'
import { mount, when } from '@rasenjs/dom'
import { ref, computed } from '@rasenjs/reactive-signals'
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { PerspectiveCamera, group, mesh, billboard, each, getRenderContext } from '@rasenjs/webgl'
import { Mat4x4f, vec3f } from '@rasenjs/math'
import { loadRacingAssets, type RacingAssets } from './assets'
import { trackPieces, aiTrucks, trackCenterline } from './level-data'
import { Vehicle } from './vehicle'
import { setupKeyboard } from './input'
import { SoundManager } from './sound'
import { TrailManager, type SmokePuff } from './trail'

useReactiveRuntime()
configureTags({ '': { perspectiveCamera: PerspectiveCamera, mesh, group, billboard, each } })

// === Reactive state (drives the 3D scene + HUD every frame) ===
const viewW = ref(window.innerWidth)
const viewH = ref(window.innerHeight)
const aspect = ref(viewW.value / viewH.value)

// Player truck transform
const vx = ref(3.5)
const vz = ref(5)
const vyaw = ref(0)
const bodyPitch = ref(0)
const bodyLean = ref(0)
const wheelSpin = ref(0)
const frontYaw = ref(0)

// Chase camera
const camPos = ref({ x: 0, y: 0, z: 0 })
const camTarget = ref({ x: 0, y: 0, z: 0 })

// HUD
const speed = ref(0)
const lap = ref(0)
const started = ref(false)

// Skid smoke trails
const trails = ref<SmokePuff[]>([])

// Vehicle sits on the road surface (track cells are at y ≈ -0.125).
const VEHICLE_Y = -0.125

// === App ===
interface AppProps {
  assets: RacingAssets
}

const App = com((p: AppProps): Mountable<HTMLElement> => {
  const { assets } = p

  // Track + decoration meshes (from the decoded GridMap)
  const trackMeshes: Mountable[] = []
  for (const piece of trackPieces) {
    const geo = assets.models.get(piece.name)
    if (geo) {
      trackMeshes.push(
        <mesh geometry={{ vertices: geo.vertices, uv: geo.uv, normals: geo.normals }} texture={geo.texture}
          x={piece.x} y={piece.y} z={piece.z} rotationY={piece.rotY} scale={piece.scale} />,
      )
    }
  }

  // AI trucks — static scenery (green / purple / red)
  const truckMeshes: Mountable[] = []
  for (const t of aiTrucks) {
    const geo = assets.models.get(t.name)
    if (geo) {
      truckMeshes.push(
        <mesh geometry={{ vertices: geo.vertices, uv: geo.uv, normals: geo.normals }} texture={geo.texture}
          x={t.x} y={t.y} z={t.z} rotationY={t.rotY} scale={t.scale} />,
      )
    }
  }

  // Player truck — rendered WITHOUT group nesting because the WebGL group's
  // pushTransform only rotates child translations by the parent's rotationZ
  // (not rotationY), so wheels wouldn't follow the body's yaw. Instead each
  // part's absolute world transform is computed from the vehicle yaw via
  // computed() refs, and every mesh gets its texture (fixes the all-white
  // body/wheels).
  const parts = assets.truckParts
  const body = parts.get('body')
  const under = parts.get('underside')
  const bl = parts.get('wheel-back-left')
  const br = parts.get('wheel-back-right')
  const fl = parts.get('wheel-front-left')
  const fr = parts.get('wheel-front-right')

  // Rotate a truck-local offset (part.center) by the vehicle yaw and add the
  // vehicle position → the part's world position. Rasen rotateY maps
  // (x,z) → (c*x - s*z, s*x + c*z).
  const worldPos = (part: { center: { x: number; y: number; z: number } }) => ({
    x: computed(() => {
      const c = Math.cos(vyaw.value), s = Math.sin(vyaw.value)
      return vx.value + c * part.center.x - s * part.center.z
    }),
    y: computed(() => VEHICLE_Y + part.center.y),
    z: computed(() => {
      const c = Math.cos(vyaw.value), s = Math.sin(vyaw.value)
      return vz.value + s * part.center.x + c * part.center.z
    }),
  })

  const bodyPos = worldPos(body ?? { center: { x: 0, y: 0, z: 0 } })
  const underPos = worldPos(under ?? { center: { x: 0, y: 0, z: 0 } })
  const blPos = worldPos(bl ?? { center: { x: 0, y: 0, z: 0 } })
  const brPos = worldPos(br ?? { center: { x: 0, y: 0, z: 0 } })
  const flPos = worldPos(fl ?? { center: { x: 0, y: 0, z: 0 } })
  const frPos = worldPos(fr ?? { center: { x: 0, y: 0, z: 0 } })

  // Front wheels steer around their own Y axis: yaw + frontSteer.
  const frontRotY = computed(() => vyaw.value + frontYaw.value)

  const bodyMesh = body ? (
    <mesh geometry={body.geo} texture={body.geo.texture}
      x={bodyPos.x} y={bodyPos.y} z={bodyPos.z}
      rotationX={bodyPitch} rotationY={vyaw} rotationZ={bodyLean} />
  ) : null
  const underMesh = under ? (
    <mesh geometry={under.geo} texture={under.geo.texture}
      x={underPos.x} y={underPos.y} z={underPos.z} rotationY={vyaw} />
  ) : null

  // A wheel: positioned at its hub, spins around its own X axis (rolling),
  // and follows the body's yaw.
  const wheelMesh = (part: typeof bl, pos: ReturnType<typeof worldPos>) => part ? (
    <mesh geometry={part.geo} texture={part.geo.texture}
      x={pos.x} y={pos.y} z={pos.z} rotationX={wheelSpin} rotationY={vyaw} />
  ) : null

  // A front wheel: additionally steers around its own Y axis.
  const steerWheelMesh = (part: typeof fl, pos: ReturnType<typeof worldPos>) => part ? (
    <mesh geometry={part.geo} texture={part.geo.texture}
      x={pos.x} y={pos.y} z={pos.z} rotationX={wheelSpin} rotationY={frontRotY} />
  ) : null

  const vehicleChildren: Mountable<any>[] = [
    bodyMesh, underMesh,
    wheelMesh(bl, blPos), wheelMesh(br, brPos),
    steerWheelMesh(fl, flPos), steerWheelMesh(fr, frPos),
  ].filter((c): c is Mountable<any> => c != null)

  // Debug: expose wheel world positions to verify they follow the body yaw.
  ;(window as unknown as { __wheels?: { bl: typeof blPos; br: typeof brPos; fl: typeof flPos; fr: typeof frPos; body: typeof bodyPos } }).__wheels = {
    bl: blPos, br: brPos, fl: flPos, fr: frPos, body: bodyPos,
  }

  // Collect all WebGL scene children into one array. The DOM canvas children
  // type is `Mountable<HTMLElement>`; WebGL components are `Mountable<WebGL…>`,
  // so we widen to `Mountable<any>[]` (the JSX.Element type) to satisfy it.
  const sceneChildren: Mountable<any>[] = [
    <perspectiveCamera position={camPos} target={camTarget} aspect={aspect}
      fov={(40 * Math.PI) / 180} near={0.1} far={200} />,
    <group children={trackMeshes as Mountable[]} />,
    <group children={truckMeshes as Mountable[]} />,
    ...vehicleChildren,
    // Skid smoke trails
    each(() => trails.value, (p) => (
      <billboard x={p.x} y={p.y} z={p.z} width={p.size} height={p.size} opacity={p.opacity} texture={assets.textures.get('smoke')!} mode="full" />
    )),
  ].filter((c): c is Mountable<any> => c != null)

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas className="racing-canvas" width={viewW} height={viewH}
        contextType="webgl2"
        contextOptions={{ clearColor: '#ACC3F8', preserveDrawingBuffer: true, continuousRender: true } as never}
        style={{ width: '100%', height: '100%', display: 'block' }}>
        {sceneChildren}
      </canvas>

      {/* HUD */}
      <div style={{ position: 'absolute', left: '16px', top: '12px', fontFamily: "'Courier New', monospace",
        fontSize: '13px', color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        <div style={{ fontSize: '18px', letterSpacing: '2px', color: '#fbbf24' }}>RACING · RASEN</div>
        <div style={{ opacity: 0.7 }}>Kenney Starter Kit Racing</div>
      </div>
      <div style={{ position: 'absolute', left: '16px', bottom: '12px', fontFamily: "'Courier New', monospace",
        fontSize: '28px', color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        {() => `${Math.round(speed.value * 180)} km/h`}
      </div>
      <div style={{ position: 'absolute', right: '16px', bottom: '12px', textAlign: 'right',
        fontFamily: "'Courier New', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.9)',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        <div>Lap {() => `${lap.value + 1}`}</div>
        <div style={{ opacity: 0.7, fontSize: '12px' }}>WASD / Arrows drive · R reset</div>
      </div>

      {/* Start overlay */}
      {when({
        condition: () => !started.value,
        then: () => (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '12px', background: 'rgba(0,0,0,0.85)',
            color: '#e5e7eb', fontFamily: "'Courier New', monospace", cursor: 'pointer', zIndex: 10 }}
            onClick={() => { started.value = true }}>
            <h1 style={{ margin: 0, fontSize: '36px', letterSpacing: '3px', color: '#fbbf24' }}>RACING</h1>
            <p style={{ fontSize: '13px', lineHeight: 1.8, margin: 0, opacity: 0.8 }}>
              WASD / Arrows drive · R reset<br />Drift through corners to lay down smoke</p>
            <p style={{ fontSize: '12px', margin: 0, opacity: 0.6 }}>Click to start</p>
          </div>
        ),
      })}
    </div>
  )
})

// === Main ===
async function start() {
  const container = document.getElementById('app')!
  container.textContent = 'Loading...'
  const assets = await loadRacingAssets((m) => { container.textContent = m })
  const sound = new SoundManager(assets.sounds)
  const keys = setupKeyboard()
  const vehicle = new Vehicle()
  const camera = { vx: 3.5, vy: 0, vz: 5, camZ: 16 }
  const trail = new TrailManager()

  window.addEventListener('resize', () => {
    viewW.value = window.innerWidth
    viewH.value = window.innerHeight
    aspect.value = viewW.value / viewH.value
  })

  const app = App({ assets })
  mount(app, container)

  // Enable shadow mapping — directional sun matching the Godot DirectionalLight3D.
  let renderContext: ReturnType<typeof getRenderContext> | null = null
  const canvasEl = document.querySelector('canvas') as HTMLCanvasElement
  if (canvasEl) {
    const gl = canvasEl.getContext('webgl2')
    if (gl) {
      renderContext = getRenderContext(gl)
      // Godot Sun transform column 3 (light propagation) = (-0.906308, 0.323744, -0.271654).
      const towardLight = new Float32Array([-0.906308, 0.323744, -0.271654])
      const len = Math.hypot(towardLight[0], towardLight[1], towardLight[2])
      const d = [towardLight[0] / len, towardLight[1] / len, towardLight[2] / len]
      const eye = vec3f(d[0] * 80, d[1] * 80 + 2, d[2] * 80)
      const lightView = Mat4x4f.lookAt(eye, vec3f(0, 2, 0), vec3f(0, 1, 0))
      const lightProj = Mat4x4f.ortho(-40, 40, -40, 40, 1, 200)
      renderContext.enableShadows(lightProj.multiply(lightView))
    }
  }

  // Debug hooks
  ;(window as unknown as { __racing?: { vehicle: Vehicle; assets: RacingAssets } }).__racing = { vehicle, assets }
  ;(window as unknown as { __trail?: { puffs: () => SmokePuff[] } }).__trail = { puffs: () => trail.puffs }
  ;(window as unknown as { __cam?: { pos: typeof camPos; target: typeof camTarget } }).__cam = { pos: camPos, target: camTarget }
  ;(window as unknown as { __dbg?: { started: typeof started; keys: typeof keys; loopCount: () => number } }).__dbg = {
    started, keys, loopCount: () => loopCount,
  }
  ;(window as unknown as { __rc?: typeof renderContext }).__rc = renderContext

  // Reset on R
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR') {
      vehicle.reset()
      trail.clear()
      sound.playImpact(0.5)
    }
  })

  let last = performance.now()
  let loopCount = 0
  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    loopCount++

    if (started.value) {
      vehicle.update(dt, keys, trackCenterline)

      // Off-track → reset with an impact thud (no real physics collision).
      if (vehicle.distanceToTrack(trackCenterline) > 9) {
        sound.playImpact(vehicle.linearVelocity)
        vehicle.reset()
        trail.clear()
      }

      // Push state into refs for the reactive scene
      vx.value = vehicle.x
      vz.value = vehicle.z
      vyaw.value = vehicle.yaw
      bodyPitch.value = (vehicle.linearSpeed - vehicle.acceleration) / 6
      bodyLean.value = vehicle.lean
      wheelSpin.value = vehicle.wheelSpin
      frontYaw.value = vehicle.frontSteer
      speed.value = vehicle.speedFactor
      lap.value = vehicle.lap

      // Chase camera (view.gd): ease toward the vehicle, zoom out with speed.
      camera.vx = lerp(camera.vx, vehicle.x, dt * 4)
      camera.vy = lerp(camera.vy, 0, dt * 4)
      camera.vz = lerp(camera.vz, vehicle.z, dt * 4)
      const targetZ = 10 + (20 - 10) * vehicle.speedFactor
      camera.camZ = lerp(camera.camZ, targetZ, dt * 0.5)
      camPos.value = {
        x: camera.vx + 0.579228 * camera.camZ,
        y: camera.vy + 0.573576 * camera.camZ,
        z: camera.vz + 0.579228 * camera.camZ,
      }
      camTarget.value = { x: vehicle.x, y: 0, z: vehicle.z }

      // Skid trails + audio
      trails.value = trail.update(dt, vehicle)
      sound.update(dt, vehicle.speedFactor, keys.forward ? 1 : 0, vehicle.drift)
    }

    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

start()