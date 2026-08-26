# Canvas 2D Benchmark — Rasen vs Vanilla vs Konva vs Fabric

Canvas 2D rendering comparison built on the same fairness philosophy as the
DOM benchmark (`benchmark/`): **identical scene, identical protocol, only the
rendering library varies**.

## Targets

| Target            | Library                | Config                                              |
| ----------------- | ---------------------- | --------------------------------------------------- |
| Vanilla Canvas    | raw 2D context         | imperative baseline — the denominator of all ratios |
| Konva             | konva ^9               | defaults (interactive layer, hit graph drawn)        |
| Konva (tuned)     | konva ^9               | `listening:false` layer + per-shape perf flags       |
| Fabric            | fabric ^6              | defaults (interactive `Canvas`, objectCaching, retina scaling) |
| Fabric (tuned)    | fabric ^6              | `StaticCanvas` + `enableRetinaScaling:false` + `objectCaching:false` |
| Rasen canvas-2d   | @rasenjs/canvas-2d     | idiomatic reactive usage: `each` + per-property refs, no explicit draw calls |

Defaults vs tuned follows the official js-framework-benchmark variant
convention (keyed/non-keyed): **defaults measure what a typical user ships;
tuned measures what the library can do when its docs' performance knobs are
applied for a pure-rendering workload.** Both columns are honest; they answer
different questions.

Rasen packages are aliased to their **pre-built `dist/`** output — run
`yarn build` for `core`, `dom`, `canvas-2d`, `reactive-vue` first.

## Fairness contract (`shared/spec.ts`)

Every page renders exactly the same scene:

- Same canvas: 1280×720, DPR as-is.
- Same shapes: 1000 shapes (alternating rect/circle) from a seeded PRNG
  (mulberry32, seed 42) — identical positions/sizes/colors on every target.
- Same update rule: every 10th shape recolors (+5 palette slots) and grows ×1.25
  around its center (100 mutations).
- Same animation: per-id deterministic velocities with wall bouncing; every
  frame moves all 1000 shapes and redraws the full scene.
- Same timing protocol: `performance.now()` around the mutation **plus one
  rAF wait**. Libraries register their own rAF-drawn redraw before our wait
  rAF, and same-frame rAF callbacks run in registration order — so the
  measurement always includes the library's full draw pass. Composite/paint
  of the pixels is excluded: the scene is pixel-identical across targets, so
  raster is a shared constant that would only quantize sub-frame ops.
- Each library drives rendering its documented way: Konva `batchDraw()`,
  Fabric `requestRenderAll()`, vanilla/rasen rAF-scheduled redraws.

## Scenarios

| Scenario         | What it measures                                        |
| ---------------- | ------------------------------------------------------- |
| `create1000`     | Build + mount 1000 shapes, incl. first paint            |
| `update100`      | Mutate 100 shapes (color+size), incl. repaint           |
| `clear`          | Remove all 1000 shapes, incl. repaint                   |
| `animate`        | 4 s full-scene animation → avg FPS + p95 frame time      |

Methodology: fresh page per iteration (`networkidle0`), 1 unrecorded warmup,
15 recorded iterations per op, 3 animation runs. Headless via
`--headless=new`, system Chrome, official chrome args, never `--disable-gpu`.

### Reading the numbers

Every rAF-aligned measurement carries a uniform "wait until the next frame
boundary" component (0–8.3 ms on a 120 Hz compositor). Consequences:

- **`create1000`** exceeds one frame for every library except vanilla — real
  differences, compare directly.
- **`update100` / `clear`** are sub-frame for most libraries: their *medians*
  sit near the frame-boundary floor and their ratios are compressed noise.
  Use **min-of-N** (`min` in the report) for these — the minimum approaches
  true cost + minimal boundary phase and is comparable across targets.
- **`animate`** shows sustained throughput; at 1000 shapes most libraries hit
  the display cap, differences appear in p95 frame time first.

For work-dominated op numbers you can add official-style CPU throttling
(js-framework-benchmark uses 4× for its fast benchmarks):

```bash
node bench.js --throttle 4   # CDP Emulation.setCPUThrottlingRate on op pages
```

## Render-equivalence verification (`verify-render.mjs`)

Perf numbers are meaningless if libraries paint different things. This script
places every target at IDENTICAL logical states (shared seeded scene +
`__bench.debugStep` deterministic animation stepping), screenshots the actual
canvas surface, and pixel-diffs against the vanilla baseline (pixelmatch).
It also verifies motion per target (the stepped state must differ from the
pre-animation state — catches "shapes never move" bugs that would flatter fps).

Latest run (create / update / 90-step animation states):

| Target        | diff vs Vanilla                     | Motion |
| ------------- | ----------------------------------- | ------ |
| Konva         | 0.000% (pixel-perfect)              | ✅      |
| Konva (tuned) | 0.000% (pixel-perfect)              | ✅      |
| Fabric        | 0.49–0.56% (AA edge handling only)  | ✅      |
| Fabric (tuned)| 0.20–0.28% (AA edge handling only)  | ✅      |
| Rasen         | 0.000% (pixel-perfect)              | ✅      |

Rasen renders byte-identical output to the raw-canvas baseline in all three
states — the perf numbers measure real work on real pixels, not rendering
differences. Screenshots and diff images land in `reports/render/`.

## Interaction: hit testing (`hitQuery` scenario)

The perf comparison previously had a fairness asterisk: Konva/Fabric defaults
pay per-frame for interactivity (hit-canvas double-draw / interactive overlay)
while Rasen canvas-2d had NO hit testing at all. That gap is now closed:

- `RenderContext.hitTest(x, y)` returns the visually topmost shape at a point
  (reverse draw-order traversal; bounds AABB prefilter; exact geometric
  closures for rect/circle, AABB fallback for other kinds).
- **Component-level pointer events**: every shape accepts `onClick` /
  `onPointerDown` / `onPointerUp` / `onPointerMove`. Handlers are dispatched
  through ONE delegated listener set per canvas (attached lazily when the
  first handler mounts) — zero per-shape DOM listeners, zero per-frame cost.
  Events bubble from the hit target up the ancestor chain (first handler
  wins); coordinates are canvas CSS pixels matching drawing space.

```ts
rect({
  x: box.x, y: box.y, width: 80, height: 24,
  fill: isSelected ? '#4ecdc4' : '#667eea',
  onClick: (e) => { select(box.id) }   // e = { x, y, node, nativeEvent }
})
```

- Design choice: **geometric queries, zero per-frame cost** — unlike Konva's
  color-keyed hit canvas which redraws every shape twice per frame. The trade:
  O(n) per query instead of O(1).
- `RenderContextOptions.resolution` adds DPR backing-store support for custom
  hosts (the dom `canvas()` component already handles DPR itself).

`hitQuery` measures 1000 deterministic point queries against the created
scene (pure CPU, no paint). Tuned Konva/Fabric pages report n/a — their
tuning sacrifices built-in hit support.

| Target      | 1000 queries | per query | hits |
| ----------- | ------------ | --------- | ---- |
| Vanilla     | ~1.7 ms      | ~1.7 µs   | 402  |
| Konva       | ~0.8 ms      | ~0.8 µs   | 405  |
| Fabric      | ~82 ms       | ~82 µs    | 448  |
| Rasen       | ~48 ms       | ~48 µs    | 402  |

Konva's O(1) hit canvas wins raw query speed — paid for with 2× draw cost in
the animation scenarios above. Rasen sits between vanilla and Fabric and is
comfortably fast enough for real click-rate interaction (~50 µs/click).
Hit-count differences reflect semantics (Fabric counts stroke regions).

## Measuring user-perceived performance (three layers)

The main `bench.js` protocol measures **JS-side cost** (mutation + the
library's draw-command recording), deliberately excluding rasterization —
the scene is pixel-identical across targets, so raster is a shared constant.
That answers "how much framework tax do I pay", not "what does the user
feel". Three complementary layers cover the user-facing questions:

1. **End-to-end op latency** (`node bench-trace.mjs`) — Chrome Tracing
   (`devtools.timeline`): each op emits a user-timing mark, and we measure
   mark → `AnimationFrame::Presentation` (the compositor's frame-presented
   notification). This includes draw recording, Blink pipeline, commit and
   presentation. Note: Blink's `Paint` event is useless here — canvas
   content updates bypass the Blink paint pipeline entirely (verified via
   `diag-trace.mjs`).
2. **Sustained throughput curve** (`node bench.js --anim-counts 1000,5000,10000`)
   — at small counts every library fits the frame budget and everything is
   "120fps"; differences become user-visible only past each library's budget
   knee. The sweep finds those knees.
3. **Jank distribution** — animation stats include p95/p99/max frame time and
   the share of frames slower than 25 ms (`jank%`).

## Run

```bash
# one-time: build the rasen packages this benchmark aliases to dist/
yarn workspace @rasenjs/core build && yarn workspace @rasenjs/dom build \
  && yarn workspace @rasenjs/canvas-2d build && yarn workspace @rasenjs/reactive-vue build

yarn workspace benchmark-canvas2d build   # vite build (multi-page)
yarn workspace benchmark-canvas2d bench   # headless run → reports/*.json + console table

# options
node bench.js --no-headless --count 5 --anim-runs 1
```

Manual inspection: `yarn workspace benchmark-canvas2d dev` then open
`http://localhost:5175/{vanilla,konva,fabric,rasen}.html` and drive
`window.__bench.create(1000)` etc. from DevTools.

`node probe-paint.mjs` is a diagnostic that runs each target once, prints
in-page timings (no CDP round-trip noise between ops) and samples canvas
pixels after create/update/clear — proving every target paints the same
scene (identical non-transparent pixel counts).

## Known caveats

- **Defaults are feature-loaded.** Konva's default layer draws a hit canvas
  (every shape twice) and Fabric's defaults allocate a per-shape offscreen
  cache canvas and scale the backing store by DPR — those defaults exist to
  serve interactivity/quality, which this benchmark does not exercise. The
  tuned variants isolate pure rendering cost; compare like with like.
- Fabric v6 keeps a large create gap even tuned (~25× vanilla): constructing
  1000 heavy class instances is intrinsic object-model cost, not config.
- Rasen v1 redraws the whole canvas on any change (documented simplification);
  dirty-region optimization is future work and will show up here when it lands.
- Animation FPS in headless mode reflects Chrome's headless compositor;
  compare runs on the same machine/mode only.
- Single-op ratios drift across runs (same as the DOM benchmark); only
  same-round comparisons are meaningful.

## Latest results (2026-08-25, headless, same-round)

**Ops** (min-of-15, ratio vs Vanilla):

| Scenario    | Vanilla | Konva | Konva (tuned) | Fabric | Fabric (tuned) | Rasen |
| ----------- | ------- | ----- | ------------- | ------ | -------------- | ----- |
| create1000  | 1.20ms  | 9.25× | 12.92×        | 38.92× | 18.50×         | 4.67× |
| update100   | 1.60ms  | 2.56× | 1.00×         | 3.31×  | 2.50×          | 0.69× |
| clear       | 5.90ms  | 0.41× | 0.20×         | 0.19×  | 0.20×          | 0.93× |

**Sustained throughput** (avg fps during full-scene animation):

| Shapes | Vanilla | Konva | Konva (tuned) | Fabric | Fabric (tuned) | Rasen |
| ------ | ------- | ----- | ------------- | ------ | -------------- | ----- |
| 1000   | 120     | 120   | 120           | 120    | 120            | 120   |
| 5000   | 120     | 75.5  | 120.1         | 43.1   | 118.4          | 120.1 |
| 10000  | 120     | 34.4  | 111.4         | 20.2   | 58.0           | 118.4 |

At 10000 shapes Konva-default and Fabric-default run at 100% janky frames
(p95 33–57 ms); Fabric-tuned drops to 58 fps; Rasen tracks vanilla (118 fps).

**End-to-end on-screen latency** (`bench-trace.mjs`, median of 3, mark →
`AnimationFrame::Presentation`): every sub-frame op lands within one vsync
(12–19 ms) on ALL targets — users cannot perceive any difference for small
updates. The only user-visible outlier: Fabric-default `create1000`
(106 ms on-screen, multiple dropped frames).

Attribution notes: Fabric default→tuned create gap is mostly objectCaching
allocation + retina scaling + interactive overlay; the remainder is object
construction. Konva tuning confirms its hit canvas roughly doubles draw cost
for unlistened scenes. Single-op ratios drift across runs — only same-round
comparisons are meaningful.
