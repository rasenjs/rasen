# Perry pitfalls

Patterns that are correct JavaScript but **misbehave on Perry**, with the
measurement that established each one. Every entry says what to write instead.

Read this before writing hot-loop or native-boundary code that has to run on a
Perry target. Nothing here is a style preference — each item cost a debugging
session and, in three cases, an apparently "frozen" application.

**Which Perry version each entry applies to matters.** The project pins a Perry
commit rather than an npm release (§1), and several entries below describe bugs
that are FIXED on the pinned commit. Each section says so explicitly. The
defensive code that used to exist for them has been removed — if a section tells
you a bug is fixed, do not reintroduce a workaround for it without a fresh
measurement.

---

## 1. Never latch `.length` into a loop bound — FIXED on the pinned commit

> **Status: the corruption this section describes does not reproduce on Perry
> 0.5.1654, the commit this project pins.** It is kept because the failure mode
> is worth recognising (it is silent, persistent, and looks like a hang), and
> because reaching the fix required pinning a commit, not a version — see
> "Upstream" below. **Do not add new guards for it.**

The guard family that used to exist for this (`usableLength`/`MAX_DENSE` in
`@rasenjs/assets`, plus `reportBadLength`/`pendingRecompile` in
`runtime/animation.ts`, `Renderer.healBatch` in `@rasenjs/gfx`, and the whole of
`runtime/dense.ts`) was **removed**: every trace on 0.5.1654 showed **0 hits**,
and much of that code path was dead. The remaining `.length`-related change in
the tree is a genuine off-by-one in `applyDrawOrder` that is unrelated to Perry
(Spine's own `while (originalIndex != slotIndex)` cannot terminate on a
descending offset pair).

```ts
// FRAGILE on Perry ≤ 0.5.1520 — one bad read was a permanent hang.
for (let i = 0, n = arr.length; i < n; i++) { ... }
```

Perry's array `length` read could return garbage. Measured on an array that was
built once and only ever read afterwards:

| Observation | Value |
| --- | --- |
| Normal | `bones.length` = **301**, for 106 consecutive frames |
| The freeze | `bones.length` = **1,269,798,432** |
| Another run | **194,708,552** |
| Another run | **620,078,168** |
| Another run | **2,742,851,360**, constant for 19000 consecutive frames |
| Elsewhere | a sibling array's `length` read **`undefined`** for several hundred frames |

`undefined` is harmless (the loop simply does not run), but a **huge** value is
not: the bound was copied into `n` before the loop started, so the loop keeps
spinning after `length` recovers on the next frame. Measured outcome: 100% CPU
with no output, the trace stopping mid-frame — indistinguishable from a frozen
application. It reproduces as "runs for a few seconds, then hangs", because a
sporadic bad read only has to happen once.

### The corruption is PERSISTENT, and skipping is not a fix

Counting the hits rather than reporting once showed **19000 hits in 90 seconds**,
i.e. every frame, with `length` pinned at a **constant** 2,742,851,360
(`0xA37C9720`) for the rest of the run. `Array.isArray(arr)` was still `true`, so
the array object was valid — it was its `length` field that had been overwritten,
with a **pointer-sized value** (its neighbours in the same run were
`0xA378F9D8`, 236872 bytes away).

Consequences for how you handle it:

* **A guard that skips the work turns a hang into a frozen animation.** Once the
  length is corrupt, every frame skips, the pose never updates again, and the
  picture is static. That is a worse bug than the one it replaced, because it is
  silent.
* **Rebuild the object instead of skipping its use.** For a cached, recomputable
  object this is both cheap and effective — the animation resumes. See
  `getCompiled` in `runtime/animation.ts`, which validates the cached
  `CompiledAnim` and recompiles it, counting the rebuilds.
* For an object that cannot be rebuilt (the skeleton's own arrays), skipping is
  all that is available, so it must at least be counted and reported.

**Write instead** — bound by a cap and stop at the first absent element, so a
dishonest `length` cannot extend the loop:

```ts
for (let i = 0; i < MAX_DENSE; i++) {
  const e = arr[i]
  if (e === undefined) break
  ...
}
```

`MAX_DENSE` is a sanity ceiling far above any legitimate array in this codebase
and far below the observed garbage, so it never truncates real data. Indexing
past the end returns `undefined` on Perry (verified — see §2), which is what makes
the early `break` a reliable terminator.

Use `usableLength()` from `@rasenjs/assets` when an applier would rather skip a
frame than iterate at all: the pose is rebuilt from scratch next frame, so
skipping is strictly better than hanging.

Where it is applied today: `applyBoneTimelines`, `applySlotTimelines`,
`applyDeformTimelines`, `applyDrawOrder` (all of `runtime/animation.ts`),
`Skeleton.updateWorldTransform`, and the per-layout vertex/index counts in
`@rasenjs/gfx`'s spine component. Every other latched bound in the codebase is
still exposed — search for the pattern before adding one.

### Not yet explained

Something writes a pointer into an array header's `length` field, and it is
intermittent — a 4-minute run can be completely clean while another shows the
corruption within seconds. Ruled out by direct measurement: WeakMap values being
collected while their key lives; multiple `[]` literals aliasing (in class fields,
in locals, and across classes); `arr.length = 0` as the trigger (that is a
separate, independently verified failure — see §3).

The shape of the evidence (a valid array object whose header word holds a
plausible heap pointer, affecting several arrays whose values sit ~200 KB apart)
points at a **moving collection** relocating an object while a reference to it is
still in use — after which the stale reference reads from-space memory.

### Upstream: fixed in a version newer than npm

Perry's own `CHANGELOG.md` documents this exact family, as already-fixed P0s:

> Every callback-looping array method … hoisted `elements_ptr` before the loop …
> across user callbacks that can trigger a **MOVING collection**. Elements live
> inline after the header, so **a moved array left the hoisted pointer reading
> from-space garbage**; a moved result array took writes through a stale pointer.

> Three GC P0s … **a minor GC swept or moved them and the next property read
> invoked freed memory**; PROPERTY_DESCRIPTORS owner keys **went stale on
> evacuation**.

Also documented: an arena "unmapped at worker exit (use-after-free)", and a
nursery collection "returning freed bytes".

**The version matters.** npm's newest release is `@perryts/perry@0.5.1520`, but
the repository's `main` is at **v0.5.1647** — roughly 2000 commits ahead, with no
npm release and no tags after `v0.5.1520`. So `npm i` cannot reach any of these
fixes, and neither can a tag checkout.

**Consequence for how this project is pinned**: `scripts/build-perry-libs.sh`
pins a commit rather than a version, which is what makes a newer commit
selectable. Before assuming a runtime bug is unfixable, check whether a newer
commit exists (`git log --oneline <pinned>..origin/main`) — the answer here was
"yes, ~2000 commits".

### Upgrading past `v0.5.1520` currently costs more than it gains

Measured against the same viewer, built two ways:

| | `v0.5.1520` + the two patches here | `v0.5.1647` (unpatched) |
| --- | --- | --- |
| Array-header corruption | Present; **1 hit → 1 rebuild → recovered** (see below) | Gone |
| Catalogue fetch | Works | **Never resolves** (a previous run looked like it worked because the asset cache was already populated — see below) |
| Model fetch (`.skel` + `.atlas`) | Works | **Never resolves**; no `then`, no `catch`, and its own 30 s deadline does not fire |
| Frame loop | ~100 fps | ~120 fps, but drawing nothing |
| Net result | Model loads and renders | **Nothing loads** |

So `v0.5.1647` fixes the GC corruption and regresses the async path in a UI
application: the load never completes and produces no error, which on screen is
"the model never arrives".

**Why, precisely.** `v0.5.1647` replaced the event loop with a thread-local
turnloop per JS agent. Their own `docs/turnloop/p0-report.md` states the
consequence:

> One `turnloop::Loop` per JS agent, thread-local. It is created by the primary
> agent's **first real park** …

> A second thread acting for the primary agent (**a host pump thread**) is
> **declined too**; exactly one thread owns the route.

A UI program's main thread never performs that park — it sits in the AppKit run
loop — and the UI's own pump thread is a "second thread", so it is declined and
falls back to the legacy condvar park, which does not advance the agent's async
work. `crates/perry-ui-macos/src/app.rs` on `v0.5.1647` contains no turnloop
integration at all (only the older timer pump), so the UI host has not been
adapted to the new model. This is not reachable from application code.

**Attempted fix, measured, and it does NOT work — do not repeat it.** The
obvious patch is to drive the wait driver from the process-wide pump boundary,
which is where every UI host already calls in:

```rust
// crates/perry-runtime/src/event_pump.rs — make it reachable
pub(crate) fn invoke_wait_driver_fast() { … }

// crates/perry-runtime/src/lib.rs, inside js_run_stdlib_pump()
crate::event_pump::invoke_wait_driver_fast();
crate::promise::js_native_async_process_pending();
```

`invoke_wait_driver_fast` is reachable ONLY from inside `js_wait_for_event`'s
park path (two call sites, both there), which is exactly the hole — so this looks
like the fix. Built and tested with a **fresh asset cache**: still `rows=3`, no
cache written, no model. The patch was verified present in the binary (the link
used the rebuilt archive), so this is a real negative, not a stale build.

Why it is not enough: `fetch`'s transport is chosen per request —
`perry-stdlib/src/fetch/mod.rs` "prefers [the turnloop engine] when the agent
owns a loop [and] keeps its reqwest future only when it declines". Their
`fetch/turnloop_bridge.rs` says the only remaining decline case is "no loop for
this agent at all". A UI host never creates one, so the request takes the reqwest
fallback, and driving the legacy wait driver does not advance it. **The missing
piece is agent-loop ownership in the host, not a missing tick.**

**Verify any upgrade by the observable, not by the changelog**: the check below
must reach the model's animations, and a fresh asset cache must be used, because
a populated cache makes a broken `fetch` look like a working one (that mistake was
made here once — the run "loaded 352 rows" from cache, so fetch was never
exercised).

```sh
rm -f /tmp/probe-cache.json
NIKKE_CACHE=/tmp/probe-cache.json PERRY_RUNTIME_DIR=<new libs> <new perry> \
  compile src/main.ts -o app && ./app
# required: the cache file is written, the catalogue shows its full row count,
# and the model reaches "animations[N]". A run with a small row count means
# fetch never completed.
```

### Mitigating the corruption in application code — no longer needed

This subsection is historical. It described a "detect and rebuild" scheme
(`reportBadLength` → `pendingRecompile`, `Renderer.healBatch`) built because a
guard that merely *skipped* the work left the animation frozen instead of
hanging — detect-and-rebuild was the only shape that recovered. Measured at the
time: 1 hit, 1 rebuild, 0 further errors over 300 s, versus 27000 hits and a
permanently frozen animation before.

On 0.5.1654 the corruption does not occur, so all of it was deleted. Recovering
from a corrupted array header is not a thing application code should have to do;
if you see this symptom again, the answer is to check which commit the runtime
libraries were built from, not to reinstate the guards.

## 2. Out-of-bounds reads return `undefined`, like a browser

```ts
new Float32Array([1,2,3])[3]   // undefined
new Int32Array([1,2,3])[3]     // undefined
[1,2,3][3]                     // undefined
```

Verified in all three cases. This is worth stating because several loops in the
Spine port (`path-solver.ts`) end via `for (;;)` and rely on an out-of-bounds
`undefined` failing a `>` comparison — they are correct on Perry for the same
reason they are correct in a browser.

## 3. `arr.length = 0` is unreliable — assign a new array

```ts
// FRAGILE on Perry.
this.batchItems.length = 0

// Correct.
this.batchItems = []
```

Three distinct failure modes were measured on the same write:

| Symptom | Evidence |
| --- | --- |
| Silently does nothing | The array kept the previous frame's 128 entries and the next frame's 128 were added on top: `len=256 pushed=128`. |
| Leaves the array unusable | `.length` read `undefined`, `for...of` walked zero elements, and `push` stored nothing — while the caller's own push counter climbed to **113,729**. |
| Still works | The common case, which is why this stayed hidden. |

Consequence on screen: the renderer's `if (batch.length > 0) flush()` guard failed,
so most frames drew nothing and presented a cleared frame — the character
blinked off and on. A second consequence outlived the flicker: the skipped frames
also skipped the flush that resets the staging watermarks, so the staging arrays
grew by 1.5x per request and the frame rate fell from ~100 fps to ~30 **and
stayed there**.

Assigning a fresh array is an ordinary store and has none of these failure
modes. Where a fresh array per call would allocate too much, carry the count in a
separate variable and bound reads by it (see §1).

## 4. Typed arrays cross the FFI as ELEMENT COUNT — intermittently

```ts
const f = new Float32Array(6447)          // 25788 bytes
// Sometimes the native side receives 25788. Sometimes it receives 6447.
```

**Intermittent, which is what makes it dangerous.** `js_value_buffer_or_typedarray_data`
has two arms: the Buffer-like arm reports the header's `length` (ELEMENTS) while
returning a BYTE pointer, and which arm answers depends on how the collector
registered the receiver. Measured on the same `Float32Array`, across frames:
usually 25788 bytes, occasionally 6447 elements. 6447 is not 4-aligned, so wgpu
refused the copy and those frames lost their geometry — `777` dropped from 120
fps to **31** while `c010` was unaffected.

`Uint8Array` masks this (elements == bytes), which is why every call site that
already passed bytes worked and the bug stayed hidden for so long.

**Hand a byte view across the boundary — but do not stop there, because the
reading is not trustworthy:**

```ts
new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
```

A caller that has to be correct on every frame must not depend on which arm
answers. The working shape is to normalise whatever arrives: `writeBytes` in
`@rasenjs/perry-wgpu` rebuilds any view with `BYTES_PER_ELEMENT !== 1` as a
`Uint8Array` — the one type where both readings coincide. (The wrapper used to be
avoided because allocating during a transfer tripped the moving-GC bug in §1;
that is fixed on 0.5.1654, and *not* wrapping is what breaks.)

**Testing lesson:** a probe that only ever uses `Uint8Array`, or that runs the
copy once, cannot detect this. Vary the element size, and run enough frames to
see both arms.

## 5. Argument forms that silently return `undefined`

```ts
Image(url)              // undefined
Image(url, alt)         // undefined
Image({ url, alt })     // a live widget
```

The type declarations advertise all three, and `perry-ui`'s own codegen
suggests both are supported — but on the pinned build only the **options object**
produces a widget. This is worse than a missing value, because **`undefined`
marshals into the native layer as handle `1`** — the first registered widget.
perry-ui resolved it and `addView:`ed that widget into every row that triggered
it: the GPU render view was physically re-parented into a 36x36 thumbnail cell,
the 1704x1628 swapchain presented into a 72x72 layer, and the picture came out
squashed with every API call reporting success.

Guard the boundary: reject an `undefined` widget where the offending node is
still identifiable, rather than letting it cross as handle 1. The viewer does
this in `src/perry-ui/node.ts` — `insertNode` throws with the child's `kind` and
the parent's, which turns "the picture is subtly wrong" into a located failure.

**Write the options object, always**, even when the positional form compiles.

## 6. `surfaceConfigure` takes PHYSICAL pixels, and the layer must match

wgpu-hal sizes the `CAMetalLayer` drawable to exactly the configured extent with
`kCAGravityTopLeft` and **no stretching**. If that disagrees with the view's real
backing size, CoreAnimation scales the presented frame — non-uniformly when the
aspect ratios differ — and reports nothing.

Read the size from the view; never assume it. `viewBackingSize()` exists for
this.

## 7. macOS FIFO swapchain deadlocks at frame latency > 1

`desired_maximum_frame_latency: 2` with a JS pump slower than the GPU deadlocks
the FIFO swapchain. Keep it at 1 unless the host presents off the main thread.

Also: a wgpu surface holds its swapchain image until every view derived from it is
dropped, and the pool holds ~3 images. One unreleased per-frame view exhausts the
pool and the next `surfacePresent` blocks forever. Destroy the frame's views right
after presenting.

## 8. A nested `with_handle` self-deadlocks

`perry_ffi`'s `with_handle` holds a DashMap shard read-lock for the duration of
the closure. A closure that registers another handle needs that same shard's
write lock, so it hangs forever — with **0% CPU**, parked in `__psynch_cvwait`,
at a random FFI call.

Release the borrow before the closure:

```rust
with_handle_unlocked::<T, _, _>(handle, |v| { /* may register handles */ })
```

Two sites were missed by a scripted pass because they registered through a local
closure rather than calling `register_handle` directly — check both.

## 9. Native-async completion drops object pointers

A Promise resolved through Perry's native-async channel hands the JS side `null`
even though the Rust side produced a real value. Add a **synchronous** entry point
instead of crossing that channel (see `patches/README.md`).

## 10. Toolchain: read LLVM objects with LLVM's `nm`, not Xcode's

Xcode's `nm` cannot read objects produced by newer LLVM nightlies
(`Unknown attribute kind (102)`) and **silently skips members** — an archive can
appear to contain zero symbols. That produced two false negatives.

```sh
/opt/homebrew/opt/llvm@22/bin/llvm-nm archive.a
```

Pin the toolchain in the build script. A different nightly changes the object
format, and a *different Perry version* changes behaviour: this project is
validated against the pinned commit in `scripts/build-perry-libs.sh`, and a local
build embeds that commit rather than whatever a package manager installed.

---

## Method notes

Two habits that would have saved most of the time spent on the items above.

**Verify the instrument before trusting the measurement.** A logger that silently
swallows its own write failure turns "the trace stopped" into "the app froze" —
they look identical. Report instrumentation failure loudly; that is why
`stage.ts`'s `trace()` counts failures instead of discarding them.

**Make the failure loud at the boundary.** An invalid widget crossing the FFI, a
non-object in a typed pool, a `length` that cannot be a count — each is cheap to
detect where it happens and expensive to diagnose afterwards. This is also why
`js_webgpu_queue_write_buffer` rejects a non-4-aligned length with a diagnostic
instead of letting wgpu abort the process.
