# Racing · Rasen Edition

A 3D chase-cam racing game built on **Rasen**'s WebGL renderer — a port of
Kenney's **Starter Kit Racing** (Godot) recreated with the Rasen reactive
paradigm. Drive the yellow truck around the track loop, drift through corners
to lay down smoke, and watch the camera pull back as you speed up.

## Run

```bash
# from repo root
yarn examples:racing:dev

# or from this folder
yarn dev
```

Open http://localhost:3014 (Vite).

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` / `←` / `D` / `→` | Steer |
| `R` | Reset to start |

Drift hard through corners to lay down smoke trails. Drive off the track and
you'll be reset with an impact thud. Cross the finish line to count laps.

## How it uses Rasen

This example showcases Rasen's **WebGL 3D renderer** driving a 60 fps game,
plus the reactive DOM layer for UI — all in **one JSX syntax**:

- **Unified JSX** — DOM and WebGL share the same JSX. `<canvas>` is a JSX tag
  (mapped to the `@rasenjs/dom` canvas component) and WebGL 3D shapes are
  lowercase JSX tags too (`<mesh>`, `<group>`, `<billboard>`,
  `<perspectiveCamera>`, registered via `configureTags` and typed through
  `src/jsx.d.ts`).
- **3D scene from GLB assets** — track pieces, decorations and AI trucks are
  loaded from Kenney's `.glb` models via `@rasenjs/webgl`'s `loadGLB` and
  rendered as `<mesh>` with per-pixel directional lighting + shadow mapping.
- **Split-model player truck** — the player truck is loaded as **separate
  parts** (body, underside, 4 wheels) so the wheels can spin and steer
  independently and the body can lean — matching the Godot `vehicle.gd`
  effects. A custom `loadGLBParts` loader bakes each node's world transform
  into its own geometry.
- **Reactive state** — `ref()` from `@rasenjs/reactive-signals` drives the
  vehicle transform, chase camera, HUD and smoke particles every frame. The
  game loop mutates refs and the renderer redraws automatically
  (`continuousRender` for the 3D scene).
- **Ported game logic** — `vehicle.ts` ports the Godot vehicle physics
  (throttle/brake easing, grip-scaled steering, body lean, wheel spin),
  `sound.ts` ports the engine/skid/impact audio, and `trail.ts` ports the
  drift smoke particles.
- **Decoded track layout** — the GridMap cell data from the original
  `main.tscn` is decoded (Godot 4.6 cell format) into `src/level-data.ts`,
  reproducing the exact track loop, decorations and AI truck placements.
- **HMR** — the root component uses `com()` and is hot-reloaded by
  `@rasenjs/vite-plugin-rasen`.

## Architecture

```
src/
  main.tsx        App component (scene tree + HUD), game loop, camera, shadows
  assets.ts       GLB/texture/sound loader + split-model truck loader
  vehicle.ts      Vehicle physics (port of vehicle.gd)
  input.ts        WASD keyboard input
  sound.ts        Engine/skid/impact audio (port of vehicle.gd audio)
  trail.ts        Drift smoke particles (port of GPUParticles3D trails)
  level-data.ts   Decoded track layout + centerline (from main.tscn GridMap)
  jsx.d.ts        JSX type augmentation for WebGL 3D tags
```

## Credits

- Game design & assets: [Kenney](https://kenney.nl) — Starter Kit Racing
  (MIT code, CC0 assets).
- Port to Rasen: Rasen contributors.