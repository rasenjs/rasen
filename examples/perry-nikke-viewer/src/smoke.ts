/**
 * Smoke test for the perry-ui layer.
 *
 * Validates the three things the viewer depends on, in one run:
 *   1. rasen components mount as real native widgets.
 *   2. Reactive props (`() => expr`) re-write the native widget on change.
 *   3. `each` and `when` work against the append-only host.
 *
 * Every observation goes to an unbuffered trace file as well as stdout, so a
 * crash still leaves the last completed step on disk.
 */
import { onFrame } from "perry/ui";
import * as fs from "fs";
import { each, when, setReactiveRuntime } from "@rasenjs/core";
import { createReactiveRuntime, ref } from "@rasenjs/reactive-alien-signals";
import { stack, text, button, scroll, divider, spacer, mountApp } from "./perry-ui";

const TRACE = process.env.SPINE_TRACE_FILE ? String(process.env.SPINE_TRACE_FILE) : "";
function log(line: string): void {
  console.log(line);
  if (TRACE) {
    try { fs.appendFileSync(TRACE, line + "\n"); } catch (_e) { /* never fatal */ }
  }
}

// Install reactivity BEFORE any component is created, same as the GPU example.
setReactiveRuntime(createReactiveRuntime());

interface Row {
  id: string;
  label: string;
}

// Refs backed by alien-signals are CALLABLES: read with `count()`, write with
// `count(next)`. See benchmark/rasen-alien for the same idiom.
const count = ref(0);
const rows = ref<Row[]>([
  { id: "a", label: "alpha" },
  { id: "b", label: "beta" },
  { id: "c", label: "gamma" },
]);
const showExtra = ref(false);
const nextId = ref(0);

/**
 * `each` and `when` return `Mountable`s, so they drop straight into `children` —
 * no wrapper component needed. Both fall back to sequential append on this host
 * (no markers), which is why the smoke test also exercises add/remove.
 *
 * `each` keys by object identity, so rows are objects rather than strings, and
 * updates replace the array.
 */
const RowList = each({
  of: () => rows(),
  children: (row: Row) => text({ content: row.label }),
});

const Extra = when({
  condition: () => showExtra(),
  then: () => text({ content: "extra: visible", color: "#8ee" }),
});

const root = stack({
  direction: "column",
  spacing: 8,
  padding: 16,
  backgroundColor: "#101018",
  children: [
    text({ content: "perry-ui smoke", fontSize: 20, color: "#ffffff" }),
    // Reactive content: re-read every time `count` changes.
    text({ content: () => "count = " + count(), color: "#8ee" }),
    stack({
      direction: "row",
      spacing: 8,
      children: [
        button({
          label: "+1",
          onPress: () => { count(count() + 1); },
        }),
        button({
          label: "toggle",
          onPress: () => { showExtra(!showExtra()); },
        }),
        button({
          label: "add row",
          onPress: () => {
            nextId(nextId() + 1);
            rows(rows().concat([
              { id: "n" + nextId(), label: "row-" + nextId() },
            ]));
          },
        }),
        button({
          label: "shrink",
          onPress: () => {
            rows(rows().slice(0, Math.max(0, rows().length - 1)));
          },
        }),
      ],
    }),
    divider(),
    Extra,
    scroll({
      height: 240,
      backgroundColor: "#181828",
      children: [RowList],
    }),
    spacer({}),
  ],
});

log("[smoke] tree built");

let ticks = 0;
function tick(): void {
  ticks = ticks + 1;
  if (ticks % 120 === 0) {
    log("[smoke] tick " + ticks + " count=" + count() +
      " rows=" + rows().length + " extra=" + showExtra());
  }
  onFrame(tick);
}
onFrame(tick);

log("[smoke] entering App()");
mountApp({ title: "perry-ui smoke", width: 560, height: 640 }, root);
log("[smoke] App() returned");
