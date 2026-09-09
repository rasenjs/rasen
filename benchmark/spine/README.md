# Spine Rendering Benchmark

Rasen vs official spine-ts 4.1 vs pixi-spine on an identical complex spine rig
(NIKKE c310, Spine 4.1.20 binary — 204 bones / 181 slots / 146 meshes), same
protocol, canvas-vs-canvas and webgl-vs-webgl.

## Targets

| Group | Target | Page | Best practice used |
|---|---|---|---|
| WebGL | Official spine-ts 4.1 | `official-webgl.html` | `SceneRenderer` begin/drawSkeleton/end (official examples) |
| WebGL | pixi-spine 4.0.6 | `pixi.html` | `Application` + `Spine` display objects (community standard) |
| WebGL | Rasen | `rasen-webgl.html` | `@rasenjs/dom` canvas + `@rasenjs/gfx` spine component |
| Canvas2D | Official spine-ts 4.1 | `official-canvas.html` | `SkeletonRenderer` (triangleRendering for mesh rigs) |
| Canvas2D | Rasen | `rasen-canvas.html` | `@rasenjs/dom` canvas(2d) + `@rasenjs/canvas-2d` spine component |

## Fairness contract (shared/spec.ts)

- Same skeleton asset, same animation (first animation), same canvas (1024×1024).
- Deterministic time stepping: every rAF tick advances the animation clock by a
  fixed 1/60 s — identical logical work per frame across targets.
- Camera: bounds-fit (factor 0.92), grid layout for N instances via the same
  `gridPos()` for every target.
- Each runtime parses the asset with its own parser and solves the pose with
  its own runtime (real-world load/solve paths).

## Scenarios

- `load` — fetch + parse + first instance + first draw (fresh page per iteration).
- `createInstances(n)` — create n instances (each with its own AnimationState).
- `poseOnly(ticks)` — animation update/apply/updateWorldTransform WITHOUT any
  rendering. Isolates CPU pose-solve cost per frame.
- `animate(ms, n)` — full pose + render loop, collects wall-clock frame stats
  (avgFps, p95/p99/max frame ms, jank%). Composite cost is identical across
  targets (pixel-identical scenes) and excluded by the single-rAF protocol.

## Usage

```bash
npm run verify          # VISUAL VARIANCE TEST — must pass BEFORE benching
npm run bench           # full benchmark (headless, system Chrome)
node bench.js --count 9 --anim-runs 3 --instances 1,10,25,50
```

Reports: `reports/spine-<stamp>.json` (+ console comparison tables).
Render-equivalence evidence: `reports/render/*.png` (t0 / anim per target +
pixelmatch diff images vs the official baseline per group).

## Visual variance acceptance

- `t0` (identical static pose): pixelmatch vs official baseline < 3%.
- `anim` state: < 12% — pixi-spine clips/deforms meshes differently from the
  official runtime; the residual is legitimate runtime variance. Centroid and
  content mass are additionally checked to be aligned.
- Motion check: every target must show real movement (anim ≠ t0).
