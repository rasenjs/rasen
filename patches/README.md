# Local patches

## `webgpu-sync-entries.patch` — `@perryts/webgpu` 0.3.0

### What it is

Three additions to the published `@perryts/webgpu@0.3.0`, which is the newest
version on npm (verified: `npm view @perryts/webgpu versions` → `0.1.0, 0.1.1,
0.2.0, 0.3.0`). They were made by hand during the Perry spine work and, until
this file existed, lived **only inside
`examples/perry-spine/node_modules/@perryts/webgpu`** — a mutation of an
installed dependency that `yarn install` would erase and no reviewer could see.

### Why they exist

All three are workarounds for a **Perry runtime defect, not an extension
defect**:

> Perry's native-async completion channel drops object pointers. The FFI call
> returns a successfully-resolved Promise whose value the JS side observes as
> `null`.

`adapterRequestDevice()` is the case that matters: it resolves `{device, queue}`
and both come back null, so no WebGPU work is possible at all. Device creation is
already synchronous internally (`pollster::block_on`), so the extension exposes
synchronous entries that hand back the handle directly.

| Entry | Added | Purpose |
| --- | --- | --- |
| `adapterRequestDeviceSync(adapter)` | Rust + TS | Create a device without crossing the broken async channel. |
| `deviceGetQueueSync(device)` | Rust + TS | Retrieve the device's queue (wgpu 22 has no `Device::queue()`, so the extension stashes it in a side table keyed by device handle when the device is created). |
| `textureViewDestroy(view)` | Rust + TS | Release a texture-view handle. A browser garbage-collects views; a native handle registry does not, so a per-frame `textureCreateView` leaks the view, which keeps the swapchain texture — and therefore the Metal drawable — alive until the drawable pool is exhausted and `surfaceGetCurrentTexture` stalls. |

### Applying it

```sh
# From the repo root, after `yarn install` (which restores pristine 0.3.0).
cd node_modules/@perryts/webgpu          # and/or examples/*/node_modules/@perryts/webgpu
patch -p0 < ../../../patches/webgpu-sync-entries.patch
```

The patch is a plain unified diff over `src/index.ts` and `src/lib.rs` and was
generated against a pristine 0.3.0, so it applies cleanly to a fresh install.

### Rebuilding the native library

Editing `src/lib.rs` is not enough — the crate must be rebuilt, and the resulting
archive is what the compiler links
(`Linking native library: <pkg>/target/release/libperry_ext_perry_wgpu.a`):

```sh
cd node_modules/@perryts/webgpu
cargo build --release            # produces target/release/libperry_ext_perry_wgpu.a
```

### Why this is not fixed upstream yet

The correct fix is in Perry, not here: the async completion channel should not
drop object pointers. Until that lands, every consumer of `@perryts/webgpu`
needs these three entries, so the patch is a *shared* dependency rather than an
example-local detail.

### Where it currently lives

Both `examples/perry-spine` and `examples/perry-nikke-viewer` vendor a patched
copy. The viewer's copy holds only `src/` plus the prebuilt `.a` (the upstream
package's `target/` tree is ~756 MB of intermediate artifacts and is deliberately
not duplicated).

**The real fix** is a tracked fork, or a `patch:`/`portal:` resolution in the
root `package.json` pointing at a vendored copy. That was left undone rather than
half-done: it changes how the whole monorepo resolves this dependency, which is a
decision for the maintainer, not a side effect of building one example.

---

## `perry-0.5.1520-native-task-drive.patch` — Perry runtime (required)

### What it is

Two additions to Perry `v0.5.1520`
(commit `381045a8735ff325621c5dfb26a3bd4f5a8798c5`) that make `fetch` resolve in a
UI application:

| File | Change |
| --- | --- |
| `crates/perry-runtime/src/event_pump.rs` | Adds `perry_drive_native_tasks()` (a re-export of the internal `invoke_wait_driver_fast()`) and calls it from `perry_poll()`. |
| `crates/perry-ui-macos/src/app.rs` | Calls `perry_drive_native_tasks()` from the AppKit pump, before draining the event queue. |

### Why it is needed

Perry 0.5.1520 runs a **single-threaded** async model: the tokio runtime is
advanced only from inside `js_wait_for_event()`'s wait-driver tick. A UI program
never reaches that call — it blocks in the AppKit run loop — so no future ever
completes and **every `fetch` stays pending forever**.

The symptom is easy to misdiagnose as a network or CORS problem: the promise is
created, the request is issued, and the `.then()` simply never runs, with no
error anywhere.

This was confirmed by measurement rather than inference. The same patched
archives in a **non-UI** program return `status=200` for every URL, while the
same program built as a UI app with unpatched archives resolves none of them.

### Consequence

`npm i @perryts/perry` alone is **not** enough to build the viewer. The archives
must come from a patched build — see
[`scripts/build-perry-libs.sh`](../scripts/build-perry-libs.sh), which checks out
the pinned commit, applies the patches and produces the three archives in one
step:

```sh
scripts/build-perry-libs.sh    # -> ~/Projects/perry/libs-0.5.1520
PERRY_RUNTIME_DIR=~/Projects/perry/libs-0.5.1520 perry compile src/main.ts -o app
```

The checkout and archives live in `~/Projects/perry/` (see its `README.md`) rather
than `/tmp`, so a reboot does not take the patches and prebuilt libraries with it.

---

## `perry-0.5.1520-ui-trace.patch` — Perry UI tracing (optional)

Per-widget tracing for `perry-ui-macos`, enabled by `PERRY_UI_TRACE=1` and silent
otherwise: child add/remove, `set_hidden`, lazy-row realization, and BloomView
creation all report a handle, class and size.

It was written to answer "which view is my render target, and is it still in the
window?" — the question behind a squashed viewport (a correct swapchain presented
into a re-parented, far smaller layer). That root cause was found, so this patch
is **diagnostic only** and can be dropped without affecting rendering. It is kept
because the same question recurs whenever a host embeds a native view in a
widget tree.

