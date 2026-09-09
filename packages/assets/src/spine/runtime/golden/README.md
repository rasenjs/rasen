# Spine Runtime Golden Gate

Performance-optimization safety net for `@rasenjs/assets` spine runtime.

## What this locks down

The ONLY stable contracts across the optimization work are:

1. **The data face that renderers consume.** `@rasenjs/gfx` and
   `@rasenjs/canvas-2d` spine components read, per posed frame:
   - `skeleton.drawOrder` (slot sequence)
   - `slot.attachment` / `slot.color` / `slot.deform`
   - per-bone world matrix (`a b c d worldX worldY`)
   - attachment world geometry (`world` verts, `uvs`, `triangles`)

   The golden files store exactly this data for fixed (asset, animation,
   time) tuples, captured from a KNOWN-GOOD runtime build (one that passed
   all unit tests AND the pixel-level verify-render comparison).

2. **The renderer component public API** (`spine` export of both packages).

## What is deliberately NOT locked down

- Internal class shapes, `Bone`/`Slot` field layout, `_updateCache` structure
- `AnimationState` internal scheduling
- Timeline object shapes (may become Float32Array / typed structures)
- Any helper signature (`computeAttachmentWorld` may be renamed/inlined)

If an optimization changes internals, update the small `extractPose()`
adapter in `golden-gate.test.ts` — the golden VALUES must still match.

## Files

- `spine-gate.json` — golden data (generated, committed to git)
- `generate-golden.mjs` — regenerates the golden file from the built dist:
  `node generate-golden.mjs` (run from this directory, requires `yarn build` first)
- `../golden-gate.test.ts` — the gate test (runs in `yarn test`)

## When the gate fails

A diff means the optimization changed observable rendering output. Either:
- fix the optimization (geometry must not drift), or
- if the change is intentional+correct (rare — e.g. bugfix confirmed by
  verify-render pixel comparison AND unit tests), regenerate the golden file
  and record WHY in the commit message.
