# Assets and third-party material

This file draws the same boundary [Open-Terraria's `ASSETS.md`](https://github.com/SandboxWorldOnline/Open-Terraria/blob/main/ASSETS.md)
draws, because this example is a port of ideas from that project and the distinction
matters more than usual.

## 1. What this example does **not** contain

Open-Terraria's MIT licence covers its **engineering code only**. The following are
not MIT, and none of them are present here:

| Excluded | Original location | Rights holder |
|---|---|---|
| Tile / NPC / projectile / UI sprites | `public/sprites/` | © Re-Logic |
| Sound effects and music | `public/sounds/`, `public/audios/` | © Re-Logic |
| Extracted data tables (item stats, drops, frames, recipes) | `src/data/vanilla-*.json` | Derived from Re-Logic's game logic |
| Decompiled C# reference sources | not in that repository | © Re-Logic |

Terraria's assets are extracted from the retail client and distributed upstream for
personal study only, with no licence granted by the rights holder. Copying them into
this repository would not be covered by any licence either project can offer, so it
was not done.

If you are a rights holder and believe something here oversteps, please open an issue.

## 2. What this example **does** contain

### Procedural art — original, MIT

**Every pixel rendered by this example is generated at runtime** from the tile
registry's colour data in `src/core/tile-defs.ts`, by `src/render/atlas.ts`. There is
not a single bitmap file in the project.

The generator composes, per tile:

- a base fill plus 1–3 px speckles drawn from the registry's accent colours
- material-specific detail (ore blobs, wood grain, glass sheen, gem facet, brick bond)
- edge bands on every side whose neighbour is a different material — a pale 1 px lip
  over a darker 2 px band, which is what makes a wall of blocks read as a solid mass
- a surface treatment for exposed tiles: the grass crust, or the lighter lip bare soil
  gets

Background walls get their own flatter treatment in the same sheet, so a mined-out
cave shows masonry instead of sky.

### Engine code — MIT, with attribution

The architecture follows Open-Terraria's engine. What was carried across is
**structure and reasoning**, not source:

| Idea | Upstream | Here |
|---|---|---|
| Struct-of-arrays tile storage, index = `y * w + x` | `src/world/TileStore.ts` | `src/core/tile-store.ts` |
| Chunk baking with per-side overlap | `src/render/ChunkBake.ts`, `ChunkCache.ts` | `src/render/bake.ts` |
| A pure bake kernel over an injected environment | `ChunkBake.ts` | `blitTiles` / `blitWalls` |
| Single dirty-set fan-out for invalidation | `TileStore` listener list | `TileStore.takeDirtyChunks` |
| Exact light compositing because 2D multiply is wrong | `src/render/GLWorldLight.ts` | documented in `render/nodes.ts`, worked around via lightmap alpha |
| Tile registry as an append-only array, id = index | `src/data/tiles.ts` | `src/core/tile-defs.ts` |
| AssemblyScript for hot numeric kernels | `src/wasm/*.as.ts` | not ported (see README) |
| Workerised bake with a shared kernel | `BakeWorker.ts` | not ported (see README) |

Both projects are MIT, so the licence is satisfied by this notice; the attribution is
here because it is the honest thing to do, not because the licence requires this
particular form.

### The `@rasenjs/*` packages

MIT, this repository. See the root `LICENSE`.

### Fonts

None. The interface uses the platform UI stack —
`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` — so there is no font file
to license and no download to fail.

## 3. Reusing this example

Everything here is MIT. If you want a **fully clean** derivative of Open-Terraria
itself, its `ASSETS.md` documents the swap: replace `public/sprites|sounds|audios` and
`src/data/vanilla-*.json` with your own sources and the engineering code still builds.

For this example there is nothing to swap — it has no third-party material in it at
all.
