# NIKKE c010 on Perry

NIKKE's `c010` Spine skeleton rendered natively on Perry's AOT runtime, with
geometry uploaded through `@perryts/webgpu`.

Two entry points, in the order they were written:

| Entry | Renderer |
| --- | --- |
| `src/main.ts` | Hand-built triangles (`renderer.ts` + `platform.ts`). The first thing that worked on Perry; kept for isolating GPU-side regressions. |
| `src/main-gfx.ts` | `@rasenjs/gfx`'s own spine component. The real validation target — it reuses the exact component the browser builds run, so the only Perry-specific code left is `gfx-host.ts` (presentation target + raw-pixel upload) and `platform.ts` (fs + PNG decode). |

`examples/perry-nikke-viewer` is the fuller application built on the same seams;
this example is the smaller, faster-to-run harness.

## Assets

`assets/c010/` holds the skeleton, and it is **incomplete in a fresh clone**:

| File | Committed? |
| --- | --- |
| `c010_03_00.skel` | yes |
| `c010_03_00.atlas` | yes |
| `c010_02.png` | **no** — the atlas page, excluded by the repository-wide `*.png` rule (game art is not redistributed here) |

Without the PNG the atlas page cannot be decoded, so the run is not expected to
render the character. Put the atlas page next to the other two, or point
elsewhere with `SPINE_ASSET_DIR`.

## Running

The asset root defaults to an absolute path inside the original author's
checkout, so set `SPINE_ASSET_DIR` when running from anywhere else:

```sh
# Perry toolchain required; see the repository's Perry notes for the
# compile invocation (it needs a specific nightly + LLVM).
SPINE_ASSET_DIR=$PWD/assets/c010 \
  perry compile src/main-gfx.ts -o dist/perry-spine-gfx
SPINE_ASSET_DIR=$PWD/assets/c010 ./dist/perry-spine-gfx
```

`yarn compile` builds `src/main.ts` only.

| Env var | Effect |
| --- | --- |
| `SPINE_ASSET_DIR` | Asset directory. Default: an absolute path in the author's checkout. |
| `SPINE_ANIM` | Animation to play. Default: `action`. |
| `SPINE_TRACE_FILE` | Writes a trace to this path. |

## Requires a patched `@perryts/webgpu`

The published `0.3.0` cannot create a device on Perry: its async completion
channel drops object pointers, so `adapterRequestDevice()` resolves with a null
device. Three additions work around it. They are recorded in
`patches/webgpu-sync-entries.patch` — see `patches/README.md` — and must be
re-applied after `yarn install`.
