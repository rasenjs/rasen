# NIKKE Viewer on Perry

A NIKKE character viewer running as a **native macOS application** — no browser,
no WebView. UI is built from rasen components, rendering goes through
`@rasenjs/gfx`'s WebGPU backend, and assets stream from the public Nikke-db
repository.

This is the validation target for Perry as a rasen render target: if the same
component code and the same spine renderer work here as in the browser, the
abstraction holds.

```sh
yarn perry:build          # compiles src/main.ts to dist/perry-nikke-viewer
./dist/perry-nikke-viewer # or: yarn perry:run
```

## What it does

- **Catalogue sidebar.** 725 models from Nikke-db, classified into four tabs the
  same way the reference site does (by id shape: `c\d+(_\d+)?` → characters,
  `smol_` → chibi, `story` → story, everything else → scenes). Characters are
  grouped two levels deep — a base id owns its costume variants — and groups
  expand in place.
- **Live search** over names and ids.
- **Three poses** per character: full-body idle, plus the two crouch poses
  (`cover`, `aim`) which live in subdirectories and are separate skeletons. The
  buttons enable themselves only for poses that actually exist, checked with a
  `HEAD` probe.
- **Animation switching** across every animation in the loaded skeleton.
- **Background presets**, applied without rebuilding the renderer.
- **Camera fit** computed from the rig's setup pose.

## Architecture

```
src/
  main.ts              entry: import order is the program (see below)
  bootstrap.ts         installs the reactive runtime — must be the FIRST import
  perry-ui/            rasen components over perry/ui native widgets
    node.ts            the retained widget tree + the rasen HostHooks impl
    components.ts      stack / text / button / scroll / image / spacer / ...
    index.ts           barrel — the seam a `@rasenjs/perry` package would move
  host/                Perry-specific plumbing
    png.ts             PNG decode (see the duplication note below)
    gfx-host.ts        Perry surface -> gfx `GpuCanvasContext`
    gfx-webgpu.ts      flat FFI -> spec-shaped GPU objects
  data/
    catalogue.ts       Nikke-db listing, classification, grouping, search
    spine-assets.ts    fetch .skel/.atlas/.png and decode atlas pages
  viewer/
    stage.ts           the GPU stage: surface, renderer, spine component
    app.ts             the UI, state and interactions
    smoke.ts           regression check for the perry-ui layer
    sweep.ts           multi-model stability sweep
```

### Import order is load-bearing

`main.ts` imports `./bootstrap` before `./viewer/app`. That is not stylistic.
`getReactiveRuntime()` silently falls back to a built-in runtime when nothing was
installed, and a ref created under one runtime but subscribed under another
collects no dependencies — so the subscription is dropped as a static source and
every bound value freezes at its first render, with **no error**. ES imports run
in source order while statements do not, so a `setReactiveRuntime(...)` call
written above the import would run too late.

### `mountApp` exists because of a silent failure

`App({ body })` takes a native `Widget`. Every component here returns a
`Mountable` — a function. Passing one straight to `App` compiles, runs, and
renders an **empty window**, because nothing ever mounted the tree. `mountApp`
is the single place that knows a host node must be created and the mountable
invoked against it.

Similarly, anything after the `mountApp(...)` call never runs: `App()` blocks on
the native run loop. Async work must be *started* before it (see `sweep.ts`,
which mounts last for exactly this reason).

### Native widgets have no sibling API

`perry/ui` lets you attach, reorder within, and detach from a parent — but not
query siblings or children. rasen's `HostHooks` contract and its structural
components (`each`, `when`) assume a node space where "where is this node among
its siblings" is answerable, so `perry-ui/node.ts` keeps a mirrored tree in
TypeScript (`parent`, `children`, `indexOf`).

That host deliberately implements only `insert` and `detach`, not the marker
trio. `HostHooks` documents that a host whose children are real native controls
should not pretend to have an interleavable text sequence, and `each` honours it
by falling back to sequential append — correct out of the box, losing only the
move fast-path.

## Verification

```sh
yarn tsc -p .                       # typecheck (Perry erases types, so this matters)
./dist/perry-nikke-viewer-smoke     # perry-ui layer: components, reactivity, each/when
NIKKE_SWEEP=12 ./dist/perry-nikke-viewer-sweep   # 12 models back to back
```

Screenshots can be captured programmatically, which is how the UI was verified
without a human at the keyboard:

```sh
PERRY_UI_TEST_MODE=1 PERRY_UI_SCREENSHOT_PATH=/tmp/shot.png \
PERRY_UI_TEST_EXIT_AFTER_MS=14000 ./dist/perry-nikke-viewer
```

Environment overrides for automation: `NIKKE_MODEL=<id>`, `NIKKE_POSE=fb|cover|aim`,
`NIKKE_SWEEP=<n>`, `SPINE_TRACE_FILE=<path>` (unbuffered trace; survives a kill).

### Measured

- 60 fps at 12.5 ms draw, c010 with a 2048x2048 atlas.
- Catalogue: 725 entries in ~4 s (characters 553, scenes 122, chibi 24, story 26;
  350 character groups).
- Sweep: 12/12 models load and render, including the subdirectory `cover` pose,
  chibi, story and scene rigs. RSS rises then stabilises as GC reclaims
  (632 MB -> 575 MB -> 588 MB), with no upward trend.
- Row list: 350 rows in the model, **26 realized**. The list is virtualized
  because every row carries a thumbnail and each thumbnail is its own remote
  fetch — an unvirtualized list would allocate 350 image views and start 350
  downloads. `trace` reports `realized=` on every interval so this stays
  measured rather than assumed.

## Requires a patched Perry

This example does **not** run on the released `perry` 0.5.1537. Two fixes are
required, both found while building it and both unrelated to this repository:

### 1. `fetch` never settles inside a GUI app

`perry-stdlib`'s tokio runtime is `new_current_thread()`, so its reactor only
advances while the main thread is inside `block_on`. The headless entry drives it
via `js_wait_for_event`; **the macOS AppKit run loop never calls that** — it pumps
`js_promise_run_microtasks` / `js_frame_pump_default` / `js_run_stdlib_pump`
instead. So every spawned native task (fetch's reqwest send, its h2 connection
driver, net/ws servers, db drivers) was never polled at all.

The visible symptom was misleading: JS timers kept firing and the frame pump kept
its heartbeat, so the app appeared healthy while `await fetch(...)` silently never
resolved. Measured before the fix: the same `fetch` completed in ~2.8 s headless
and had still not settled after 50 s and 60 000 ticks inside `App()`.

Fixed by driving the wait driver from `js_run_stdlib_pump`'s outer boundary
(guarded by the existing `outermost` test, because the driver parks via
`block_on` and must never nest). Affects **every** GUI backend, not just macOS.

### 2. `TextField` / `SecureField` rendered a constant `"Field"`

`install_text_field_cell` replaced the field's cell with a freshly allocated one
that has **no defined string value**. `setCell:` adopts the cell's content as the
field's, so the field rendered uninitialized memory — the constant `"Field"` — in
every text field, and because that content is non-empty AppKit never drew the
placeholder either. The placeholder argument was arriving intact at the native
boundary the whole time; it was being hidden, not lost.

Perry's own `docs/examples/ui/gallery.ts` reproduces it
(`TextField("type here", …)` showed `Field`). Fixed by resetting the field to an
empty string after the cell swap.

### 3. `Image(url)` compiled to nothing

The positional form of `Image` was lowered by neither code path that could
handle it, so the call produced no widget and the expression that should have
held its handle held a stale value instead.

The two lowering branches are `include!`d in a fixed order:

1. the generic `perry_ui_table` lookup, guarded by `method != "Image"` so the
   option-bag handler below gets its turn first;
2. the `Image({ url, alt, systemName })` option-bag handler.

The guard in (1) is right, but (2) only matched an **object literal**. A
positional call reached neither, and the catch-all's `bail!` did not fire either
— `Image` is excluded from that too — so it failed silently.

How it presented: in `VStack(8, [Text(...), Image(url)])` the array's second
element was wrong, so the stack inserted **itself** as its own child. That cycle
made AppKit recurse forever in `NSViewGetTransformToAncestor` and the process
hung at 100% of a core inside `App()`, before the run loop started.

`ImageSymbol(name)` — also an `NSImageView`, but routed straight through the
table — was fine, which is what pointed at the lowering rather than the widget.
`Image` is in the table (as `perry_ui_image_create_url`), so the option-bag
branch now forwards the positional form to that row, and the existing
omitted-trailing-`Str` padding covers `Image(url)` as well as `Image(url, alt)`.

Verified with a five-way bisect (no image / image as the window body / in a
VStack / in an HStack / empty URL): every shape hung except those that never
built a widget, and none logged a call into `perry_ui_image_create_url`. All
shapes render a remote image inside a stack after the fix.

Both fixes live in the local Perry checkout, with a changelog entry for the
second. Until they land upstream, build this example against that checkout.

## Dependencies on a patched `@perryts/webgpu`

`@perryts/webgpu@0.3.0` needs three additions that are **not upstream**, because
Perry's native-async completion channel drops object pointers — which makes
WebGPU unusable (`adapterRequestDevice()` resolves `{device, queue}` and both
arrive as `null`). See [`../../patches/README.md`](../../patches/README.md) for
the full explanation, the patch file, and how to apply it after a
`yarn install`.

## Known duplication

`host/png.ts` is byte-for-byte `examples/perry-spine/src/platform.ts`'s decoder.
The logic is subtle (PNG filters, Paeth) and both examples need exactly it.
Extracting a package now would mean inventing a `@rasenjs/perry` boundary before
the UI layer has settled, which is the abstraction this stage deliberately
defers. **Any change must be mirrored in both files** until that extraction
happens.

## Not done

- Zoom and pan. The camera is fit-only; there is no pointer handling wired to it.
- A loading indicator with progress. The status line reports the current step but
  a 2048×2048 decode is a visible pause with no percentage.
- Window resize. The swapchain is configured once at the size passed to `Stage`.
