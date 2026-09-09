# Craft · Rasen

A Minecraft-style voxel world built with **Rasen** — the reactive WebGL
renderer, one JSX tree across DOM + WebGL, inspired by the classic open-source
[fogleman/Craft](https://github.com/fogleman/Craft).

![demo](https://img.shields.io/badge/status-wip-orange)

## What this demonstrates

- **Procedural terrain** — fractal simplex noise heightmap (`@rasenjs/math`
  `SimplexNoise` + `fbm2`), with grass/dirt/stone/sand and trees.
- **Chunked voxel rendering** — each 16×16×48 chunk is merged into a single
  `MeshGeometry` (only exposed faces, `buildVoxelMesh`), so a whole chunk is
  one draw call; texture atlas keeps the palette in one small texture.
- **First-person controls** — `FirstPersonCamera` (yaw/pitch) + WASD, jump,
  sprint, gravity and AABB voxel collision. Pointer-lock mouse look with a
  click-and-drag fallback so the game always starts.
- **Block editing** — ray-cast (`voxelRaycast`, DDA) to break (left click) /
  place (right click) blocks; chunk meshes rebuild reactively on edit.
- **Rasen philosophy** — one reactive core, multiple render targets: DOM HUD
  and WebGL scene live in the same JSX tree (`com`, `each`, `when`).

## Controls

| Input | Action |
| --- | --- |
| Click | Start / grab mouse |
| WASD | Move |
| Space | Jump |
| Shift | Sprint |
| Mouse / drag | Look |
| Left click | Break block |
| Right click | Place block |
| 1-8 | Select block (grass, dirt, stone, sand, wood, leaves, plank, glass) |

## Run

```bash
yarn examples:craft:dev      # or: yarn workspace @rasenjs/examples-craft dev
```

Opens on http://localhost:3011/.

## Architecture

```
src/
  main.tsx      entry — runtime, JSX tag registration, game loop, input wiring
  render.tsx    the App — <canvas contextType="webgl"> scene + DOM HUD overlay
  world.ts      World — deterministic terrain, sparse edits, chunk mesh cache
  blocks.ts     block/tile palette + procedurally drawn texture atlas
  player.ts     first-person controller with voxel AABB collision
  input.ts      keyboard + pointer-lock mouse look (drag fallback)
  jsx.d.ts      WebGL components as lowercase JSX tags
```

## Rasen features exercised / extended

- `@rasenjs/gfx` — `FirstPersonCamera`, `buildVoxelMesh`, `voxelRaycast`,
  `clearColor` context option.
- `@rasenjs/math` — `SimplexNoise` (2D/3D) + `fbm2`.
- `@rasenjs/dom` — canvas JSX `contextType`/`contextOptions` support.
