# Rasen Spine 性能优化方案

> **Moved.** The authoritative record now lives in
> [`docs/SPINE-PERF.md`](../../docs/SPINE-PERF.md) — current status, methodology,
> every disproven hypothesis, and the probe tooling.

## Status of the plan that used to be here

This file held the 2026-09-07 plan, written against a **100× baseline** (rasen
0.34 ms vs official 0.0034 ms per frame at 10 instances). That baseline is long
obsolete — the campaign now sits at **~1.00× on the frame** (pose 1.15–1.18×,
render 0.92×) at 200 instances.

Every item in that plan is resolved, and one of them taught the campaign's most
important lesson:

| item | outcome |
|---|---|
| A1. Flatten timelines at compile time | done — the compiled channel structures |
| A2. Binary search instead of a linear scan in the sampler | done |
| A3. Eliminate the full `setToSetupPose` reset | done, but **not** by pre-recording per-channel setup values — that premise was wrong. Official writes `bone.data.*` inside each timeline, and our reset only needs to happen when the animation changes or the clock rewinds. |
| A4. Replace the `{update: () => …}` closures in `_updateCache` with tag dispatch | done |
| A5. Precompute the bone list instead of `Object.keys` per frame | done |

See `docs/SPINE-PERF.md` §4 for the structural ideas that were measured and
**rejected**, so they are not re-attempted.
