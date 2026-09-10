# ⚡ Spine Performance — Record & Methodology

How the Rasen spine runtime and WebGL component went from **1.60× to ~1.00×
official spine-ts**, and — more importantly — **how to measure this workload** so
that the next change is a decision instead of a guess.

Companion to [`benchmark/spine/README.md`](../benchmark/spine/README.md) (how to
run the bench) and [`DESIGN.md`](./DESIGN.md).

---

## 1. Where we stand

200 instances, WebGL (`HWGL=1`), against `@esotericsoftware/spine-core` 4.1.56.
Measured with `probe-frame-split.mjs`, same browser session, interleaved rounds.

| scope | ratio | note |
|---|---|---|
| **frame, min** | **1.001×** | best case is parity |
| **frame, mean** | **1.038×** | what a user actually experiences |
| frame, p95 | 1.042× | |
| frame, max | **0.885×** | our worst frame is *better* than theirs |
| jank | 0.2% vs 0.5% | we stutter less |
| pose (`packages/assets`) | **1.15–1.18×** | we are **slower**, +0.95 ms |
| render (`packages/gfx`) | **0.92×** | we are **faster**, −0.94 ms |

The two nearly cancel. That is the single most important thing to know about this
workload:

> **Our spine runtime is slower than official's; our renderer is faster than
> theirs; the frame is a tie.** Optimising "the spine runtime" is therefore not
> the same as optimising what the user sees.

pose is ~37% of our frame and render+rest ~63%, so **1 ms off either one is worth
~1 ms of frame** (~6% of the ratio). The renderer is the bigger absolute pot
(10.4 ms vs 6.3 ms) but we are already ahead there.

### Session trajectory

| stage | frame | pose |
|---|---|---|
| start of campaign | 1.60× | — |
| after the batch fast lane + runtime work | 1.20× | — |
| after sharing compiled channel data | 1.07× | 1.364× |
| + applier slot resolution, reset removal | **1.00–1.04×** | **1.15–1.18×** |

---

## 2. Measurement methodology

This section exists because **most of the time in this campaign went into
discovering that the instruments were lying**, not into optimising. Read it
before trusting any number here.

### 2.1 Instruments, and what each can resolve

| tool | measures | resolution | use it for |
|---|---|---|---|
| `ab-anim.mjs` | whole frame, both runtimes | **±0.5 ms — unusable for micro-work** | final sanity check only |
| `probe-ab-pose.mjs` | `poseOnly`, both runtimes | ~±0.1–0.3 ms | **primary instrument for CPU work** |
| `probe-frame-split.mjs` | pose *and* frame, same session | ~±0.3 ms | deciding *which side* to attack |
| `probe-n-sweep.mjs` | per-instance cost vs N | trend only | instruction- vs cache-bound |
| `probe-map-probes.mjs` | actual lookup counts | **exact** | verifying a lookup/branch removal |
| `probe-timeline-bisect.mjs` | per-applier cost | **±0.4 ms per row** | finding *which applier* to look at |
| `probe-pose-split.mjs` | pose stage split | ±0.4 ms per row | same, plus the aggregate |

### 2.2 The four rules that came out of the failures

**1. `ab-anim.mjs` cannot resolve sub-millisecond differences.** It launches a
separate browser per target per run and averages 4-second `avgFrameMs` windows,
which are vsync-quantised — a CPU saving shows up as an occasional missed vsync,
not as a smaller average. Eight back-to-back runs of *one unchanged build* gave
ratios from **1.07× to 1.49×**.

`probe-ab-pose.mjs` replaces it: **one browser** for the whole measurement, rounds
**interleaved** official/rasen so slow drift hits both sides equally, `poseOnly`
(no render, no vsync coupling), reporting **min and median, never the mean**.

**2. Per-row split numbers have ±0.4 ms resolution — they are for finding the
right *place*, not for before/after claims.** Two runs of the same build moved
the deform row 0.722 → 1.088 ms and the slots row −0.086 → +0.378 ms, in both
directions.

**3. Verify lookup/branch removals by COUNTING, not timing.** Zero noise,
deterministic, and it survives a noisy machine. `probe-map-probes.mjs` wraps the
live `Map` and counts: this is how the applier fix was proven
(`slotMap.get` 21/tick → **0**).

**4. Subtraction attribution is unsound, because the stages are coupled.** The
telescoping split (`probe-pose-split.mjs`) is the only additive form, and even it
biases once a change alters the interaction: after the setup-reset removal the
`uwt` row *grew* by +0.5 ms because the reset's writes had been warming exactly
what `uwt` reads. The split still balances and will not warn you.

### 2.3 The measurement traps that cost real time

- **"Official is 28× faster at `setToSetupPose`."** It is 0×, i.e. official never
  calls it per frame. Patch-and-count (`probe-setup-calls.mjs`) showed official
  at 0 calls/tick and us at 200. The split row was measuring our work against
  their nothing.
- **"Shrinking the per-instance object graph will speed up traversal."** False.
  Adding **192 MB** of cold memory moved `poseOnly` by −2.1% (noise), so the cost
  is not sensitive to memory volume. This killed a planned cross-package
  `colorN: Float32Array(4)` → 4 scalars refactor *before* it was written; that
  field is 240 B/slot, 19% of the graph.
  *Limitation, stated honestly:* the ballast is never accessed, so it only rules
  out memory **volume**, not the hot loop's cache footprint. The N sweep covers
  the latter, and shows the cost is **flat** (official +6.5%, rasen +6.9% from
  N=8 to N=200, and the ratio is already 1.36× at N=1).
- **"The setup reset merely relocates the work downstream (memory-traffic
  conservation)."** I wrote this as the reason for reverting the reset removal.
  It was wrong: the observation behind it came from the ±0.4 ms split rows. Re-done
  with `probe-ab-pose.mjs` the change is worth **−0.69 ms**.
- **An invalid N sweep.** `createInstances` only ever grows, so replaying
  increasing N against an already-grown list measures N=200 every time. Fixed in
  `probe-n-sweep.mjs`.
- **Micro-benchmarks must carry a shared-vs-distinct control.** Every early
  micro-benchmark built *one* channel set and looped it, which stays L1-resident
  where layout does not matter — "our sampler is 53% faster per call than
  official's shape" was measured that way and did not extrapolate. The corrected
  probe carries three variants (ours shared, ours unshared, official) and shows
  the real ordering.
- **Once a workload is shown to be instruction-bound, plain micro-benchmarks
  become representative.** That is the inverse of the previous trap, and it is
  what made `probe-transform-dispatch.mjs` cheap and trustworthy.

### 2.4 The methodology rule that keeps you honest

> Verify the **mechanism** with a different method than the one that produced the
> hypothesis. Timing tells you *that* something moved; a count tells you *why*.
> If the mechanism and the timing disagree, believe the count and re-measure the
> timing with a better instrument.

---

## 3. What landed

Ordered by measured impact. Details in the squashed commit message and in the
per-commit messages preserved under the tag `pre-squash-spine-optimization`.

### 3.1 Sharing compiled channel data across skeletons — frame −2.2 ms

`compileCache` was `WeakMap<AnimationData, Map<skeleton, CompiledAnim>>` and
`compile1D`/`compile2D` had **no cache of their own**, so `compileAnim` rebuilt
every channel's times/values/types/curves/tables **once per skeleton**: 200
private copies of immutable animation data. Official keeps its frames on the
shared `Animation` and passes the skeleton into `apply()` — the same two-layer
split.

The extractor was a per-call closure, which made the result uncacheable; it is now
a small mode enum (`CH_ROTATE`/`CH_X0`/`CH_X1`/`CH_Y0`/`CH_Y1`), so `compile1D`
can cache by `(source keyframes, mode)`. Four call sites changed, no applier did.

Also fixed in passing: the inner map held skeletons **strongly**, pinning every
instance alive for as long as the animation stayed reachable.

### 3.2 Removing the per-frame setup reset — pose −0.69 ms

Official calls `setToSetupPose` **0 times per tick**; each of its timelines writes
`bone.data.*` itself when the time precedes its first keyframe. We reset the whole
skeleton every frame (204 bones × 7 fields + 181 slots + a draw-order refill).

Now the reset happens only when a **different animation** is driving (the new one
may not cover properties the old one moved) or when the **clock went backwards**
(loop wrap / seek). While one animation plays forward the appliers rewrite every
property it covers, unconditionally, each apply — a gate miss writes the setup
value rather than skipping, so the untouched remainder is still exactly what the
previous reset left. Any backwards movement forces a reset, so a gate miss can
only ever leave a value that came from that reset. `applyDeformTimelines` writes
`slot.deform` for all 23 of its slots every apply, so it needs no reset either.

Verified: `setToSetupPose` calls **40000 → 200** per 200 ticks (the 200 are loop
wraps).

### 3.3 Resolving applier slots once — pose −0.56 ms

`CompiledBone`/`CompiledSlot` store **object references**; `CompiledDeform` stored
a slot *name* and called `slotMap.get(name)` per frame, and
`applySequenceTimelines` called `slotMap.get(name)` **and**
`findAttachment(slot/name, attachment)` per driven slot per apply — the latter
walks the skin chain.

Both now resolve during compile / on driven-set change. The sequence side could
**not** be cached on `SeqSlotNames`, which is keyed per (animation, skin) and
shared between skeletons — it lives on the skeleton, next to the existing
`seqDriven` sentinel.

Verified by counting: `slotMap.get` **21/tick → 0**.

*Correction worth recording:* c310's `action` drives **23 deform slots and 21
sequence slots**, not the "1 each" I had written down. The error: `deform obj
keys 1` in an early dump counts the **skin name**, not the slots. That misreading
is why these two appliers looked cheap and were never examined for a whole
session; bisecting `timelines+glue` by stripping timeline groups is what surfaced
them.

### 3.4 The rest

- typed mesh vertex data (`readVertices` → `Float32Array`) + monomorphic
  `unweightedWorldVertices`/`weightedWorldVertices`/`…Deform` specializations
  with a hoisted write cursor
- per-attachment submission cache + staging-copy skips in `components/spine.ts`
- batch fast lane: A1 item pool + numeric group key, A2 mesh writer +
  `drawSealedRun`; packed RGBA8 colour stream (**7 MB/frame** upload saved)
- bezier curve tables (34.6 → 30.8 ms @200)
- numeric colour side-channel (`slot.colorN`) so renderers stop re-parsing hex
- sequence-slot and constraint-key caching in the compile step
- correctness fixes found by the pixel gates: sealed-run drawing (element offset,
  exclusive end, **texture split**), sealed-marker keying, `drawGroup` scratch
  isolation, 270°-rotated atlas UVs
- five dead `Bone` fields removed (`worldRotation`/`worldScaleX`/`worldScaleY`/
  `tx`/`ty`, no reader anywhere in the repo): −3.1% per-instance footprint
- new gates: c233 multi-page regression test, sealed-run contract tests

---

## 4. What did NOT work (do not retry these)

Every one of these was a plausible structural idea. The list is the most valuable
part of this document.

| idea | outcome |
|---|---|
| Flat per-channel records replacing per-bone nullable slots | **2.3%** apart once instances are distinct. Not worth it. An earlier L1-resident run said 20.5% — that was the trap. |
| Bezier table flatten + shrink (512 → 64, per-channel) | **+0.76 ms REGRESSION.** It destroyed `curveTableCache` sharing (worth 76.5%), and drifted the pose golden ~3 ppm. Reverted. |
| `flatBones` prefetch | Pessimisation. Reverted. |
| Map-based staging ledger | ~0, measured by deleting the bookkeeping entirely. |
| String `switch (bone.transform)` → numeric `TransformMode` enum | **0.14 ns/bone** = 0.006 ms/frame. V8 pointer-compares interned literals. Not worth it. |
| Shrinking the per-instance graph (`colorN` → 4 scalars) | Dead: pose is insensitive to memory volume. |
| "Tune for cache pressure" as a general rule | Wrong for this workload — it is **instruction-bound** (flat vs N). |
| Removing the per-frame reset *and expecting it to be neutral* | Also wrong — but the *opposite* way: it is worth −0.69 ms. My first revert came from a harness that could not see it. |
| Blaming `updateWorldTransform` | Inverted: ratio is **1.165× with** uwt patched in and **1.202× with it patched out**, so uwt is relatively our strength. |

---

## 5. Tooling

All under `benchmark/spine/`. Each answers exactly one question.

| probe | question |
|---|---|
| `probe-ab-pose.mjs` | how do we compare on the CPU pose solve? (**primary**) |
| `probe-frame-split.mjs` | is the remaining gap in pose or in render? |
| `probe-n-sweep.mjs` | instruction-bound or cache-bound? |
| `probe-map-probes.mjs` | are the per-frame lookups actually gone? (counts) |
| `probe-setup-calls.mjs` | does each runtime reset the pose per frame? (counts) |
| `probe-timeline-bisect.mjs` | which applier costs what? |
| `probe-pose-split.mjs` | pose stage breakdown (aggregate reliable, rows ±0.4 ms) |
| `probe-layout-cache.mjs` | data layout, with a shared-vs-distinct control |
| `probe-transform-dispatch.mjs` | string vs numeric dispatch |
| `probe-workset-sensitivity.mjs` | does memory volume matter at all? (no) |
| `probe-mem-attribution.mjs` | where does the per-instance footprint go? |
| `probe-object-shape.mjs` | V8 field-count behaviour (no cliff) |
| `probe-instance-scaling.mjs` | heap + per-instance cost vs N |
| `probe-compile-footprint.mjs`, `probe-footprint-breakdown.mjs` | exact per-instance footprint (Node `--expose-gc`) |
| `probe-applier-loop.mjs` | container shape for the bone applier loop |
| `probe-channel-layout.mjs` | sampler data layout, isolated |

---

## 6. Gates

Every change must keep all of these green:

```bash
npx vitest --run packages/assets packages/gfx packages/canvas-2d   # 348 tests
cd benchmark/gfx && node golden.mjs        # 0.0000% pixels differ (≤0.4% allowed)
cd benchmark/spine && node verify-c233.mjs # c233 t=30: 0.00% differing
cd benchmark/spine && node verify-render.mjs
#   rasen-webgl t0 0.60% / anim 1.67%   rasen-canvas t0 1.69% / anim 2.93%
```

`verify-render` compares against official spine-ts and is the strongest
equivalence check; treat its exact percentages as the baseline rather than
"under the threshold". Any change to interpolated values will drift the pose
golden — verify visually through c233 / verify-render **first**, then regenerate.

Build order matters: `@rasenjs/assets` → `@rasenjs/gfx` → `benchmark/spine`.

---

## 7. Where to go next

1. **Pose, 0.95 ms available.** Instruction-bound, so the wins are in work
   removed/deduplicated, not in layout. The measured shape now: bones applier
   ~1.24 ms, deform ~0.7 ms (after the fix), slots/sequence ~0. Official spends
   1.98 ms on `timelines+glue` and we spend ~2.4 ms.
2. **Render, 10.4 ms, already 0.92×.** The bigger pot, but it is a *general*
   renderer optimisation by the project's layering rule, and official is already
   behind us. Start by measuring per-instance draw calls and per-frame upload
   bytes at 200 instances before touching anything.
3. **Keep the instrument honest.** Any claim under ~0.3 ms needs either a count or
   a `probe-ab-pose.mjs` run with enough rounds; `ab-anim` cannot support it.
