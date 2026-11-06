# Terrene — a tile-world slice for Rasen

A small tile-world sandbox built on Rasen, structured as a worked example of the
[one reactive core, many render targets](../../docs/DESIGN.md) idea. It exists to
answer a specific question:

> **What does a large imperative game engine look like when its render and interface
> layers are ported to Rasen — and what should *not* be ported?**

The reference point is [Open-Terraria](https://github.com/SandboxWorldOnline/Open-Terraria),
a from-scratch Terraria 1.4.5.8 rewrite in ~1.5 M lines of TypeScript with no game
engine. Its engine code is MIT; see [ASSETS.md](./ASSETS.md) for what is and is not
reused here.

```bash
yarn examples:terraria:dev      # http://localhost:3014
yarn examples:terraria:build
```

Controls: **A/D** walk · **W** jump · **LMB** mine · **RMB** place · **1-6** select a
block · **middle-click** pick the block under the cursor · **Q** or wheel zoom ·
**R** respawn. `?seed=1234` reproduces a world.

---

## The architecture in one picture

```
┌─ imperative, not reactive ─────────────────────────────────────────────┐
│  TileStore (SoA TypedArrays)   collision   entities   lighting BFS     │
│  ChunkBaker → offscreen canvases                                       │
└────────────────────────────┬───────────────────────────────────────────┘
                             │  ~a dozen refs, written once per tick
┌────────────────────────────▼───────────────────────────────────────────┐
│  reactive shell: canvas-2d scene tree + DOM interface, one JSX tree    │
└────────────────────────────────────────────────────────────────────────┘
```

The boundary is the whole design. `src/core/world.ts` writes a small set of signals
at the end of every tick — camera, draw list, revision counters, HUD state — and that
is the **entire** contract between the two halves. There is no renderer API to call,
no draw list to hand over, and no invalidation to remember.

### Why the simulation is *not* reactive

A 384 × 128 world is ~49 000 tiles, and mining, liquid flow and projectile collision
mutate them thousands of times per second. A dependency edge per cell would cost more
than the rendering it saved. So tile writes accumulate into a **dirty chunk set**
(`TileStore.takeDirtyChunks()`), and that set is the one place the reactive layer
listens.

Upstream, the same three steps are spread across a chunk cache, a lighting engine and
every call site that has to remember to invalidate the right thing. Here:

```
TileStore.set()  →  dirty chunk set  →  bakeAll()  →  worldRevision += 1
                                                       ↑ the tile layer's only dep
```

### The layers, back to front

| # | Layer | Space | How it is drawn |
|---|-------|-------|-----------------|
| 1 | Sky gradient | screen | `skyLayer` — custom node (`fillStyle` cannot take a CSS gradient) |
| 2 | Clouds | screen, self-drifting | `cloudLayer` — custom node, 3 parallax bands |
| 3 | Hills | screen, camera-fractional | `parallaxLayer` — custom node, 3 sine bands as one path |
| 4 | Background walls | world | `ChunkBaker.blitWalls` — baked |
| 5 | Terrain | world | `ChunkBaker.blitTiles` — baked, autotiled |
| 6 | Cursor highlight | world | `tileHighlight` — custom node (dashed double stroke) |
| 7 | Entities | world | plain `each(world.slots, …)` with declarative nodes |
| 8 | Lighting | screen | `lightingLayer` — custom node, `globalCompositeOperation = 'multiply'` |
| 9 | HUD | screen | shared widgets → `canvasUiHost` |
| 10 | Interface panels | screen | **the same widgets** → `domUiHost` |

Layers 1–3 and 8 are screen space, so they never pan. Layer 9–10 sit outside the
camera group for the same reason the world sits inside it.

---

## Three things this slice demonstrates

### 1. Reactivity replaces hand-rolled invalidation

`TileStore` keeps a `Set` of dirty chunk indices. A write on a chunk seam also
invalidates the seam neighbour, because the neighbouring bake draws an edge against
this tile. Every one of those rules lives in **one place** — `TileStore.set` — instead
of being repeated at each call site.

### 2. One widget, two render targets

This is the payoff. `src/ui/widgets.ts` is written against a four-primitive host
interface and never imports the DOM or the canvas:

```ts
export interface UiHost<Node> {
  box(spec: BoxSpec): Mountable<Node>
  label(spec: LabelSpec): Mountable<Node>
  stack(spec: StackSpec<Node>): Mountable<Node>
  icon(spec: IconSpec): Mountable<Node>
}
```

`kit-canvas.ts` implements it with `rect`/`text`/`group`/`sprite`; `kit-dom.ts`
implements it with `div`/`span`. Then the *same call* renders into both:

```ts
itemSlot(canvasUiHost, { stack, geometry })   // in-world hotbar
itemSlot(domUiHost,    { stack, geometry })   // the DOM satchel panel
```

`itemSlot`, `tooltip`, `bar`, `recipeRow`, `keycap` and `readout` are each
implemented **once**. Upstream the equivalent split is a hand-ported XNA widget tree
in `src/vui/` *plus* ~30 DOM panels in `src/ui/`, with an item slot and a tooltip
existing separately in each and no shared code between them.

Try it: hover a tile and both tooltips update, because they read the same signals.

### 3. Baked terrain, because the redraw model requires it

`@rasenjs/canvas-2d` v1 redraws the whole canvas whenever anything is dirty. Even with
per-node dirty regions, drawing tiles individually is 49 000 draw calls per frame.
Baking converts "how many tiles are visible" into "how many chunk-sized blits are
visible", which is a constant:

| | |
|---|---|
| Chunk | 32 × 32 tiles = 512 px |
| Overlap | 2 tiles per side, so decorations are not clipped at a seam |
| Autotile | 16 neighbourhood shapes × 2 noise variants per tile, pre-rendered |
| Cost | ~1.3 ms to rebake two chunks; ~9 chunks visible at a time |

The autotile mask is what makes a dirt wall read as a solid mass with a lit top edge
rather than a grid of identical squares. The noise variant is hashed from the tile's
world coordinate and deliberately **excludes** the mask, so mining a neighbour changes
the edge without re-scrambling this tile's speckles.

---

## Layout

```
src/
  main.tsx              assembly, the frame loop, the two post-mount wiring steps
  input.ts              browser events → simulation intent; world picking lives here
  core/
    constants.ts        every tunable number
    rng.ts              mulberry32, value noise, fbm — the whole determinism story
    tile-defs.ts        the tile registry (declarative, deliberately not reactive)
    tile-store.ts       SoA planes + the dirty-set invalidation edge
    worldgen.ts         deterministic generation, in the order terrain forms
    collision.ts        axis-separated sweep
    lighting.ts         BFS flood, lightmap painting, the day/night curves
    world.ts            the simulation, and the frame-boundary bridge
  render/
    atlas.ts            procedural pixel art, autotiled into 16 shapes per tile
    bake.ts             chunk baking; one drawImage per tile
    nodes.ts            the six custom scene nodes, and why each one exists
  ui/
    kit.ts              the UiHost contract, the palette, `read()`
    kit-canvas.ts       UiHost<CanvasNode>
    kit-dom.ts          UiHost<HTMLElement>
    widgets.ts          itemSlot / tooltip / bar / recipeRow / keycap / readout
    scene.tsx           the one JSX tree
    hud-canvas.ts       the canvas HUD
    hud-dom.ts          the DOM interface, from the same widgets
```

---

## Known limitations, honestly

These are real and deliberately left visible rather than papered over.

**No worker for the bake or the lighting pass.** Open-Terraria runs its bake kernel on
the main thread *and* in `BakeWorker` by injecting an environment, and the same split
applies here — `blitTiles` touches only the store's typed planes and the atlas, never
the DOM, so it is already worker-safe as written. It is left out because it doubles the
surface area of the example without changing anything you can see.

**Lighting is throttled and recomputed in full.** A pass walks every tile in the world
and is O(tiles) regardless of how much changed, so `main.tsx` runs it at most once
every three frames. Mining one tile therefore costs the same as mining a hundred. The
honest fix is a dirty *rectangle* rather than a dirty flag, plus an incremental
re-flood; ~9 ms for a full pass is the number that makes the case.

**Picking is done in the simulation, not by the renderer.** `@rasenjs/canvas-2d` hit-tests
node bounds in screen space, and the tile layer's bounds are in world space inside a
zoomed camera group. Routing picks through the tree would mean two coordinate
authorities that have to agree, so `input.ts` uses the same `screenToWorld` the camera
does. See the note in `render/nodes.ts`.

**Canvas2D `'multiply'` is not XNA's vertex-colour multiply.** It implements PDF blend
semantics, so a semi-transparent backdrop picks up a `(1 - αd)·Cs` wash. The lightmap
works around this by writing `α = 0` in sky cells so the backdrop passes through
untouched, and by only ever compositing over an opaque world. If a translucent overlay
ever lands *under* the lighting node, that assumption breaks and the fix is a WebGL2
shader pass — which is exactly what upstream's `GLWorldLight` is.

**The art is procedural, and it is the largest gap from the original.** See
[ASSETS.md](./ASSETS.md): Terraria's sprites are © Re-Logic and cannot be redistributed
with a port, so every pixel here is generated from the tile registry's colour data plus
the autotile edge pass. It is deliberately readable and consistent, and it is not
Terraria's art.

**No world size reduction for larger worlds.** Baked surfaces are never evicted, so a
world much larger than this one would grow memory without bound. The world here is
chosen so that 48 chunks is the whole of it.

---

## Benchmarking

The scene is laid out so it can be driven by the canvas-2d harness
(`benchmark/canvas2d`), which measures with a `window.__bench` API and a fixed
1280 × 720 surface:

- `create(n)` → generate a world, bake it, wait one frame
- `updateEvery10th()` → mine 1/10 of the tiles on screen and wait one frame
- `clear()` → unbake
- `animate(ms)` → hold the camera moving
- `debugStep(n)` → deterministic frames for pixel-equivalence checking

`TileStore.set` is the mutation entry point a driver should use; going through it is
what exercises the invalidation path rather than bypassing it.
