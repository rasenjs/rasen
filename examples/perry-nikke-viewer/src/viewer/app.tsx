/**
 * The viewer UI.
 *
 * Three columns, matching the browser viewer:
 *
 *   [ Sidebar 300 ]  [ TopBar / Stage ]  [ Control panel 288 ]
 *
 * State lives in alien-signals refs, which are CALLABLES: read `x()`, write
 * `x(v)`. Two rules matter and both fail silently when broken:
 *
 *   1. `setReactiveRuntime` must have run first (see `../bootstrap`). Otherwise
 *      the refs are not tracked and every bound value freezes at first render.
 *   2. A value the UI re-reads has to BE a signal. A getter over a plain
 *      variable reads nothing reactive, so it is correctly classified as a
 *      static source and never updates.
 *
 * ── The two update models in this file ────────────────────────────────────
 * Most of the UI is bound: props are getters, and a change writes the affected
 * native property. The row list is not — it is rebuild-on-change via
 * `virtualList`'s `version`, because a virtualized row has no unmount hook to
 * release a subscription from. See `perry-ui/components.ts`.
 *
 * ── Why this is .tsx ──────────────────────────────────────────────────────
 * The view functions below return JSX. `jsx`/`jsxs` are imported from
 * `../perry-ui/jsx-runtime` for the reason documented there: Perry's lowering
 * routes JSX through whatever binding the module has, and without one it lands
 * in Perry's HTML-string adapter instead of building Mountables. Removing that
 * import does not fail loudly — every element in this file silently becomes a
 * string. Components are PascalCase (`<Stack>`); `hostWidget` is a call rather
 * than a tag because it takes the widget itself, not a props object.
 *
 * `sidebarView()` / `topBarView()` / … are functions rather than module-level
 * constants because a constant would jump above the `ref`s it closes over and
 * read them before they exist (see rule 1 above).
 */
import { onFrame } from "perry/ui";
import { ref } from "@rasenjs/reactive-alien-signals";
import type { PropValue } from "@rasenjs/core";
import * as fs from "fs";
import {
  TABS,
  buildRows,
  classify,
  defaultSelection,
  loadCatalogue,
  spriteUrl,
  variantLabel,
  type L2dEntry,
  type Row,
  type Tab,
} from "../data/catalogue";
import { loadSpine, poseExists, type PoseKind } from "../data/spine-assets";
// `jsx`/`jsxs` are what Perry's JSX lowering resolves against — importing them
// is what routes every element in this file into @rasenjs/core's runtime
// instead of Perry's HTML-string adapter. See perry-ui/jsx-runtime.ts.
import { jsx, jsxs } from "../perry-ui/jsx-runtime";
import {
  Stack,
  Text,
  Button,
  Each,
  Image,
  Spacer,
  Rule,
  TextField,
  VirtualList,
  type PerryNode,
} from "../perry-ui/jsx-runtime";
// Non-JSX helpers stay on the layer's own barrel: they are functions, not
// components, so they have no JSX spelling (`hostWidget` takes the widget
// itself; `mountApp` takes an element and a window).
import { hostWidget, mountApp } from "../perry-ui";
import type { Mountable } from "@rasenjs/core";
import { Stage } from "./stage";
import { RowView } from "./row-view";
import { BG_PRESETS, BRAND, N, SURFACE, TEXT } from "./theme";

/** How tall the animation list is allowed to grow before it scrolls. */
const ANIM_LIST_H = 150;

// ── geometry ──────────────────────────────────────────────────────────────

const WINDOW_W = 1440;
const WINDOW_H = 900;
const SIDEBAR_W = 300;
const PANEL_W = 288;
const STAGE_W = WINDOW_W - SIDEBAR_W - PANEL_W;
const STAGE_H = WINDOW_H - 86;
const ROW_H = 52;

// ── reactive state ────────────────────────────────────────────────────────

const status = ref("Starting…");
const busy = ref(false);
const entries = ref<L2dEntry[]>([]);
const tab = ref<Tab>("characters");
const search = ref("");
const expanded = ref("");
const selected = ref("");
const selectedName = ref("");
const rows = ref<Row[]>([]);
const pose = ref<PoseKind>("fb");
const poseAvail = ref<{ cover: boolean; aim: boolean }>({ cover: false, aim: false });
const animNames = ref<string[]>([]);
const animIndex = ref(0);
/** Bumped when the animation list changes, to rebuild its virtual rows. */
const animVersion = ref(0);
const bg = ref(BG_PRESETS[0].color);
const fps = ref(0);
const drawMs = ref(0);
const loaded = ref(false);

/**
 * Bumped whenever the row list must be rebuilt.
 *
 * The only signal the virtual list watches: it drives both the row count and
 * every row's appearance, because rows are built from current state rather than
 * subscribing to it.
 */
const listVersion = ref(0);

/** A row as the list renders it — a group, a scene entry, or a variant. */
interface DisplayRow {
  kind: "group" | "entry" | "variant";
  id: string;
  name: string;
  /** The id line under the name; for a group it is the variant count. */
  sub: string;
  /** Thumbnail URL, or empty for a row that shows a chevron instead. */
  thumb: string;
  /** Indent depth, 0 or 1. */
  depth: number;
  /** Selected when this row's id matches. */
  active: boolean;
}

/** Flat rows for the current tab, query and expansion. */
const displayRows = ref<DisplayRow[]>([]);

/** Tab counts, shown as `Characters (553)`. */
const tabCounts = ref<Record<string, number>>({});

// ── list derivation ───────────────────────────────────────────────────────

/** Rebuild the flat row list from the grouped rows and current state. */
function refreshRows(): void {
  rows(buildRows(entries(), tab(), search()));
  const counts: Record<string, number> = {};
  for (let i = 0; i < TABS.length; i++) counts[TABS[i].tab] = 0;
  const all = entries();
  for (let i = 0; i < all.length; i++) counts[classify(all[i].id)] += 1;
  tabCounts(counts);

  const open = expanded();
  const sel = selected();
  const out: DisplayRow[] = [];
  const list = rows();
  for (let i = 0; i < list.length; i++) {
    const row = list[i];
    if (row.kind === "entry") {
      out.push({
        kind: "entry",
        id: row.id,
        name: row.name,
        sub: row.id,
        thumb: spriteUrl(row.id),
        depth: 0,
        active: sel === row.id,
      });
      continue;
    }
    const isOpen = open === row.id;
    out.push({
      kind: "group",
      id: row.id,
      name: row.name,
      // Matches the browser: a group with a single variant is not worth
      // announcing, so it shows the model id instead of "1 variants".
      sub: row.variants.length > 1
        ? row.variants.length + (isOpen ? " variants  ▾" : " variants  ▸")
        : row.id,
      // The base model's own sprite, exactly as the browser shows it. Showing
      // it only when expanded was wrong: the collapsed list then reads as a
      // column of blank circles, which is most of the sidebar's character.
      thumb: spriteUrl(row.id),
      depth: 0,
      active: sel === row.id,
    });
    if (!isOpen) continue;
    // The first variant is the base model itself and keeps the base name.
    for (let j = 0; j < row.variants.length; j++) {
      const v = row.variants[j];
      out.push({
        kind: "variant",
        id: v.id,
        name: j === 0 ? v.name : variantLabel(row.name, v),
        sub: v.id,
        thumb: spriteUrl(v.id),
        depth: 1,
        active: sel === v.id,
      });
    }
  }
  displayRows(out);
  listVersion(listVersion() + 1);
}

// ── stage ─────────────────────────────────────────────────────────────────

const stage = new Stage({
  widthPt: STAGE_W,
  heightPt: STAGE_H,
  clearColor: BG_PRESETS[0].color,
  onStatus: function (s): void {
    fps(s.fps);
    drawMs(s.drawMs);
    if (s.error) status(s.error);
  },
});

// ── logging ───────────────────────────────────────────────────────────────

const TRACE = process.env.SPINE_TRACE_FILE ? String(process.env.SPINE_TRACE_FILE) : "";
function trace(line: string): void {
  if (!TRACE) return;
  try { fs.appendFileSync(TRACE, line + "\n"); } catch (_e) { /* never fatal */ }
}

// ── model loading ─────────────────────────────────────────────────────────

/**
 * Guards against overlapping loads.
 *
 * A 2048x2048 atlas decode takes over a second and clicking through the list
 * starts several loads, so only the newest may write to the UI or the stage.
 */
let loadToken = 0;

async function select(id: string, nextPose: PoseKind): Promise<void> {
  if (!id) return;
  loadToken = loadToken + 1;
  const token = loadToken;

  busy(true);
  selected(id);
  // Show the name immediately so the header does not lag the click.
  selectedName(nameOf(id));
  pose(nextPose);
  animNames([]);
  animIndex(0);
  refreshRows();

  try {
    const loadedSpine = await loadSpine(id, nextPose, function (m): void {
      if (token === loadToken) status(m);
      // The loader's own progress messages only reached the status line, so a
      // load that never finishes left no trace at all — the run showed a selected
      // model, no `animations[...]`, and no `LOAD FAILED`, which is
      // indistinguishable from "still fetching". Recording each stage is what
      // makes the stuck one identifiable.
      trace("load stage: " + m);
    });
    if (token !== loadToken) return;

    const names = Object.keys(loadedSpine.data.animations);
    stage.setModel({
      spine: loadedSpine,
      animation: names.length ? names[0] : "",
    });
    if (token !== loadToken) return;

    animNames(names);
    animVersion(animVersion() + 1);
    animIndex(0);
    loaded(true);
    trace("animations[" + names.length + "] = " + names.join(", "));
    status("Loaded " + id + (nextPose === "fb" ? "" : " (" + nextPose + ")"));
    refreshRows();

    poseAvail({ cover: false, aim: false });
    void probePoses(id);
  } catch (e: unknown) {
    if (token !== loadToken) return;
    const err = e as { message?: string; stack?: string };
    const message = err && err.message ? err.message : String(e);
    status("Failed: " + message);
    trace("LOAD FAILED " + id + ": " + message);
    if (err && err.stack) trace("  " + err.stack);
  } finally {
    if (token === loadToken) busy(false);
  }
}

/** Display name for an id, from the loaded catalogue or a prettified id. */
function nameOf(id: string): string {
  const all = entries();
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === id) return all[i].name;
  }
  return id;
}

/** Enable the pose buttons for whichever crouch skeletons exist. */
async function probePoses(id: string): Promise<void> {
  const token = loadToken;
  const cover = await poseExists(id, "cover");
  if (token !== loadToken) return;
  const aim = await poseExists(id, "aim");
  if (token !== loadToken) return;
  poseAvail({ cover: cover, aim: aim });
}

// ── actions ───────────────────────────────────────────────────────────────

function onRow(row: DisplayRow): void {
  if (row.kind === "group") {
    // A group's own id is the base model, so tapping expands AND loads; tapping
    // again collapses without reloading.
    expanded(expanded() === row.id ? "" : row.id);
    void select(row.id, "fb");
    return;
  }
  void select(row.id, "fb");
}

function setAnimation(index: number): void {
  const names = animNames();
  if (!names.length) return;
  animIndex(index);
  stage.setAnimation(names[index]);
  status("Animation: " + names[index]);
}

function setPose(next: PoseKind): void {
  if (next === pose()) return;
  if (next !== "fb" && !poseAvail()[next]) return;
  void select(selected(), next);
}

function applyBg(color: string): void {
  bg(color);
  stage.setClearColor(color);
}

// ── shared components ─────────────────────────────────────────────────────

interface PillProps {
  label: PropValue<string>;
  /** Highlighted state, read on every frame. */
  active?: () => boolean;
  /** Defaults to always enabled; a disabled pill dims instead of hiding. */
  enabled?: () => boolean;
  onPress: () => void;
  /**
   * Fixed width in points. `NSStackView` distributes slack rather than sizing to
   * content, so a row whose pills are wider than the panel silently pushes the
   * later ones past the edge instead of shrinking them.
   */
  width?: number;
}

/** A pill-shaped toggle, the viewer's one button idiom. */
function Pill(props: PillProps): Mountable<PerryNode> {
  return (
    <Button
      label={props.label}
      bordered={false}
      // `rounded-full` in the browser; a radius past half the height is equivalent.
      cornerRadius={999}
      padding={6}
      width={props.width}
      backgroundColor={(): string => {
        if (props.enabled && !props.enabled()) return SURFACE.chipOnPanel;
        return props.active && props.active() ? BRAND.s600 : SURFACE.chipOnPanel;
      }}
      textColor={(): string => {
        if (props.enabled && !props.enabled()) return N.s700;
        return props.active && props.active() ? N.s100 : N.s300;
      }}
      onPress={props.onPress}
    />
  );
}

interface SectionLabelProps {
  /** Rendered uppercase. */
  label: string;
}

/** A small uppercase section heading, as in the browser's control panel. */
function SectionLabel(props: SectionLabelProps): Mountable<PerryNode> {
  return (
    <Text content={props.label.toUpperCase()} fontSize={TEXT.tiny} color={N.s500} />
  );
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  /** Highlighted state, read on every frame. */
  active?: () => boolean;
}

/** A flat action button (`bg-white/5`, rounded-lg). */
function ActionButton(props: ActionButtonProps): Mountable<PerryNode> {
  return (
    <Button
      label={props.label}
      bordered={false}
      cornerRadius={8}
      padding={8}
      backgroundColor={(): string =>
        props.active && props.active() ? BRAND.s600 : SURFACE.chipOnPanel}
      textColor={(): string =>
        props.active && props.active() ? N.s100 : N.s200}
      onPress={props.onPress}
    />
  );
}

interface TabPillProps {
  tab: Tab;
  label: string;
}

/** One tab pill, with its live count. */
function TabPill(props: TabPillProps): Mountable<PerryNode> {
  return (
    <Pill
      label={(): string => {
        const counts = tabCounts();
        const n = counts[props.tab] !== undefined ? counts[props.tab] : 0;
        return props.label + "  (" + n + ")";
      }}
      width={TAB_PILL_W}
      active={(): boolean => tab() === props.tab}
      onPress={(): void => {
        tab(props.tab);
        expanded("");
        refreshRows();
      }}
    />
  );
}

interface QuickSearchPillProps {
  query: string;
}

/** A one-shot search pill. */
function QuickSearchPill(props: QuickSearchPillProps): Mountable<PerryNode> {
  return (
    <Pill
      label={props.query}
      onPress={(): void => {
        search(props.query);
        refreshRows();
      }}
    />
  );
}

// ── sidebar ───────────────────────────────────────────────────────────────

/** Width of one tab pill, so two of them plus the gap fill the sidebar inner width. */
const TAB_PILL_W = 132;

/**
 * The quick-search queries.
 *
 * Objects rather than bare strings: the list is built with `Each`, which tracks
 * an instance per item by object reference in a `WeakMap` — and a `WeakMap`
 * rejects a string key. `label` carries the query text.
 */
const QUICK_SEARCH: Array<{ label: string }> = [
  { label: "2b" },
  { label: "a2" },
  { label: "c01" },
  { label: "777" },
];

/**
 * The four category tabs, two per row.
 *
 * Two rows rather than one: at 12pt the labels plus their counts run to roughly
 * 300pt, and the sidebar's inner width is 276 — an `NSStackView` distributes
 * slack instead of shrinking children, so a single row simply pushed `Story` off
 * the edge. Counts are read through a getter so they populate once the catalogue
 * lands.
 */
function TabRows(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={6}>
      <Stack direction="row" spacing={6}>
        <Each of={TABS.slice(0, 2)}>
          {(t: { tab: Tab; label: string }) => (
            <TabPill tab={t.tab} label={t.label} />
          )}
        </Each>
      </Stack>
      <Stack direction="row" spacing={6}>
        <Each of={TABS.slice(2)}>
          {(t: { tab: Tab; label: string }) => (
            <TabPill tab={t.tab} label={t.label} />
          )}
        </Each>
      </Stack>
    </Stack>
  );
}

/** The quick-search row. */
function QuickSearchRow(): Mountable<PerryNode> {
  return (
    <Stack direction="row" spacing={6}>
      <Each of={QUICK_SEARCH}>
        {(q: { label: string }) => <QuickSearchPill query={q.label} />}
      </Each>
    </Stack>
  );
}

/**
 * How many rows the list has asked us to build.
 *
 * The virtualization budget: the list has 352 rows, and a correct virtual list
 * realizes a screenful (plus the table's overscan), not all 352. Counted rather
 * than inferred because the failure mode is silent — an unvirtualized list
 * simply allocates 352 widgets and 352 thumbnail downloads, which looks fine
 * until it is measured.
 */
let rowsRealized = 0;

/**
 * The catalogue list — a component, so nothing is built until it mounts.
 *
 * `<VirtualList>` takes a render callback rather than children (there are 352
 * rows and only a screenful exists at a time), so each row is an element built
 * on demand by `RowView`. `rowsRealized` is what proves that on-demand part is
 * real.
 */
function CatalogueList(): Mountable<PerryNode> {
  return (
    <VirtualList
      count={(): number => displayRows().length}
      version={(): number => listVersion()}
      rowHeight={ROW_H}
      render={(index: number) => {
        rowsRealized = rowsRealized + 1;
        const rowsNow = displayRows();
        const row = index < rowsNow.length ? rowsNow[index] : null;
        // A row realized past the end (the table can ask during a reload) gets a
        // placeholder rather than a crash.
        if (!row) return <Stack direction="row" spacing={0} height={ROW_H} />;
        return <RowView row={row} rowHeight={ROW_H} onPress={onRow} />;
      }}
    />
  );
}

/**
 * The sidebar: brand header, search + tabs, the list, then the status footer.
 *
 * A component rather than a module-level constant: expressed as a constant it
 * would be evaluated while the module loads, which builds the whole tree before
 * the reactive runtime is even installed (see rule 1 in the file header).
 */
function Sidebar(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={0} width={SIDEBAR_W} backgroundColor={SURFACE.panel}>
      {/* Header: mark, app name, product name. */}
      <Stack direction="row" spacing={12} padding={16}>
        <Stack
          direction="row"
          spacing={0}
          width={36}
          height={36}
          cornerRadius={10}
          backgroundColor={BRAND.s600}
          hugging={499}
        >
          {/*
            A letter rather than the product's logo image: the native build has
            no bundle to load `/nikke-logo.png` from, and an empty coloured
            square reads as a placeholder rather than a mark.
          */}
          <Text content="R" fontSize={18} color={N.s100} />
        </Stack>
        <Stack direction="column" spacing={0}>
          <Text content="Rasen" fontSize={TEXT.appName} color={N.s100} />
          <Text content="NIKKE Viewer" fontSize={TEXT.small} color={N.s400} />
        </Stack>
        <Spacer />
      </Stack>

      <Stack direction="column" spacing={8} padding={12}>
        <TextField
          placeholder={"Search characters…"}
          onChange={(value: string): void => {
            search(value);
            refreshRows();
          }}
        />
        <QuickSearchRow />
        <TabRows />
      </Stack>

      <CatalogueList />

      <Stack direction="column" spacing={4} padding={12}>
        <Text
          content={(): string => (busy() ? "Loading — " : "") + status()}
          fontSize={TEXT.tiny}
          color={(): string => (busy() ? BRAND.s400 : N.s500)}
        />
        <Text
          content={(): string =>
            entries().length + " models · " + displayRows().length + " rows"}
          fontSize={TEXT.micro}
          color={N.s600}
        />
      </Stack>
    </Stack>
  );
}

// ── top bar ───────────────────────────────────────────────────────────────

function TopBar(): Mountable<PerryNode> {
  return (
    <Stack
      direction="row"
      spacing={12}
      padding={14}
      backgroundColor={SURFACE.window}
    >
      <Stack direction="column" spacing={0}>
        <Text content="Character Viewer" fontSize={TEXT.title} color={N.s100} />
        <Text
          content={(): string =>
            selectedName() ? selectedName() : "No character selected"}
          fontSize={TEXT.small}
          color={N.s400}
        />
      </Stack>
      <Spacer />
      <Text
        content={(): string =>
          fps() > 0
            ? fps().toFixed(0) + " fps  ·  " + drawMs().toFixed(1) + " ms"
            : ""}
        fontSize={TEXT.tiny}
        color={N.s500}
      />
      <Button
        label="Re-fit"
        bordered={false}
        cornerRadius={8}
        padding={8}
        backgroundColor={SURFACE.chipOnPanel}
        textColor={N.s200}
        onPress={(): void => {
          void select(selected(), pose());
        }}
      />
    </Stack>
  );
}

// ── stage ─────────────────────────────────────────────────────────────────

function StageArea(): Mountable<PerryNode> {
  return (
    <Stack
      direction="column"
      spacing={0}
      /*
       * Stretch: this is the only child of the centre column that should absorb
       * the slack left over by the top bar, and perry-ui has no flex-grow —
       * `hugging` is the whole mechanism (lower stretches, higher hugs).
       */
      hugging={1}
      backgroundColor={(): string => bg()}
      // The click target is the canvas itself.
      onPress={(): void => {}}
    >
      {/*
        Size the GPU view EXPLICITLY. perry-ui has no flex-grow (see the note on
        `hugging` above), and `hugging: 1` alone did not hold: measured with a
        native geometry probe, the `PerryBloomView` starts at the size it was
        constructed with (852x814, i.e. STAGE_W x STAGE_H) and the layout then
        shrinks it to 36x36 points.

        That is what produces the squashed picture. `surfaceConfigure` already
        ran once, at attach time, against the 852x814 point / 1704x1628 pixel
        view — and wgpu-hal sizes the CAMetalLayer's drawable to exactly that,
        with `kCAGravityTopLeft` and no stretching. When the view later becomes
        36x36, CoreAnimation scales the 1704x1628 drawable down into a 72x72
        pixel layer: the render is correct, the presents succeed, and only a
        corner of it is visible. Pinning width/height is what keeps the view at
        the size the swapchain was configured for.

        `hostWidget` is a call, not a tag: it takes the widget itself as its
        first argument rather than a props object.
      */}
      {hostWidget(stage.widget, { width: STAGE_W, height: STAGE_H, hugging: 1 })}
      {/* Empty state, shown until the first model lands. */}
      <Stack
        direction="column"
        spacing={6}
        padding={12}
        // Hug: this is a caption, it must not compete with the viewport for height.
        hugging={499}
        backgroundColor={(): string => (loaded() ? bg() : SURFACE.chipOnWindow)}
      >
        <Text
          content={(): string =>
            loaded() ? "" : status() || "Select a character to begin"}
          fontSize={TEXT.small}
          color={N.s400}
        />
      </Stack>
    </Stack>
  );
}

// ── control panel ─────────────────────────────────────────────────────────

const POSE_BUTTONS: Array<{ pose: PoseKind; label: string }> = [
  { pose: "fb", label: "FB" },
  { pose: "cover", label: "Cover" },
  { pose: "aim", label: "Aim" },
];

function PoseSection(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={8}>
      <SectionLabel label="Pose" />
      <Stack direction="row" spacing={8}>
        <Each of={POSE_BUTTONS}>
          {(p: { pose: PoseKind; label: string }) => (
            <Pill
              label={p.label}
              // Three equal pills across the panel: (288 - 2*18 padding - 2*8
              // spacing) / 3. Spelled out because the stack will not shrink them.
              width={78}
              active={(): boolean => pose() === p.pose}
              enabled={(): boolean => p.pose === "fb" || poseAvail()[p.pose]}
              onPress={(): void => setPose(p.pose)}
            />
          )}
        </Each>
      </Stack>
      <Text
        content={(): string => {
          if (!selectedName()) return "Select a costume to load its poses";
          return "Cover available: " + (poseAvail().cover ? "yes" : "no") +
            " · Aim available: " + (poseAvail().aim ? "yes" : "no");
        }}
        fontSize={TEXT.small}
        color={N.s500}
      />
    </Stack>
  );
}

/**
 * The animation picker.
 *
 * One row per animation in a virtual list — the native equivalent of the
 * browser's `flex-wrap` inside an `overflow-y-auto` panel. Virtualizing it
 * matters here: a rig can carry hundreds (c310 has 189), and the rows are
 * rebuilt only when a model loads, so this stays bounded without a cap.
 * `virtualList` already owns its own scroll view, so it is not wrapped in one.
 */
function AnimSection(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={8}>
      <SectionLabel label="Animation" />
      <Text
        content={(): string => {
          const n = animNames();
          if (!n.length) return "no animations";
          const i = animIndex();
          return n[i] + "   (" + (i + 1) + "/" + n.length + ")";
        }}
        fontSize={TEXT.small}
        color={BRAND.s400}
      />
      <VirtualList
        height={ANIM_LIST_H}
        backgroundColor={SURFACE.chipOnWindow}
        cornerRadius={8}
        count={(): number => animNames().length}
        version={(): number => animVersion()}
        rowHeight={26}
        render={(index: number) => {
          const names = animNames();
          const name = index < names.length ? names[index] : "";
          return (
            <Button
              label={name}
              bordered={false}
              cornerRadius={6}
              padding={3}
              backgroundColor={(): string =>
                animIndex() === index ? BRAND.s600 : SURFACE.chipOnWindow}
              textColor={(): string =>
                animIndex() === index ? N.s100 : N.s300}
              onPress={(): void => setAnimation(index)}
            />
          );
        }}
      />
    </Stack>
  );
}

function BgSection(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={8}>
      <SectionLabel label="Background" />
      <Stack direction="row" spacing={8}>
        <Each of={BG_PRESETS as Array<{ name: string; color: string }>}>
          {(p: { name: string; color: string }) => (
            <Stack
              direction="row"
              spacing={0}
              width={30}
              height={30}
              cornerRadius={8}
              backgroundColor={p.color}
              borderWidth={(): number => (bg() === p.color ? 2 : 1)}
              borderColor={(): string =>
                bg() === p.color ? BRAND.s400 : SURFACE.hairline}
              onPress={(): void => applyBg(p.color)}
            />
          )}
        </Each>
        <Spacer />
      </Stack>
    </Stack>
  );
}

function ViewSection(): Mountable<PerryNode> {
  return (
    <Stack direction="column" spacing={8}>
      <SectionLabel label="View" />
      <ActionButton
        label="Re-fit to model"
        onPress={(): void => {
          void select(selected(), pose());
        }}
      />
      <ActionButton
        label="Reset selection"
        onPress={(): void => {
          expanded("");
          refreshRows();
          status("Selection cleared");
        }}
      />
    </Stack>
  );
}

function ControlPanel(): Mountable<PerryNode> {
  return (
    <Stack
      direction="column"
      spacing={20}
      width={PANEL_W}
      padding={18}
      backgroundColor={SURFACE.panel}
    >
      <PoseSection />
      <AnimSection />
      <BgSection />
      <ViewSection />
    </Stack>
  );
}

// ── root ──────────────────────────────────────────────────────────────────

function Root(): Mountable<PerryNode> {
  return (
    <Stack direction="row" spacing={0} backgroundColor={SURFACE.window}>
      <Sidebar />
      {/*
        The centre column: the top bar keeps its natural height and the stage
        area takes the remainder. Without `hugging` on stageArea the column
        would divide the height evenly between the two instead.
      */}
      <Stack direction="column" spacing={0}>
        <TopBar />
        <StageArea />
      </Stack>
      <ControlPanel />
    </Stack>
  );
}

// ── boot ──────────────────────────────────────────────────────────────────

/**
 * Optional overrides, for automation.
 *
 * `NIKKE_MODEL` and `NIKKE_POSE` seed the selection. They exist because the
 * interesting failure modes — a pose in a subdirectory, a model swap's GPU
 * churn — are otherwise only reachable by clicking, which a headless run cannot
 * do.
 */
const ENV_MODEL = process.env.NIKKE_MODEL ? String(process.env.NIKKE_MODEL) : "";
const ENV_POSE = process.env.NIKKE_POSE ? String(process.env.NIKKE_POSE) : "fb";

async function boot(): Promise<void> {
  const catalogue = await loadCatalogue(function (m): void { status(m); });
  entries(catalogue.entries);
  status(catalogue.offline
    ? "Offline list — " + catalogue.entries.length + " models"
    : "Ready — " + catalogue.entries.length + " models");
  refreshRows();

  const pick = ENV_MODEL ? ENV_MODEL : defaultSelection(catalogue.entries);
  if (ENV_MODEL) {
    tab(classify(ENV_MODEL));
    refreshRows();
  }
  if (pick) {
    await select(pick, ENV_POSE === "cover" || ENV_POSE === "aim" ? ENV_POSE : "fb");
  }
  trace("boot done, selection=" + selected() + " rows=" + displayRows().length);

}

void boot().then(
  function (): void { /* status already reflects the outcome */ },
  function (e: unknown): void {
    const err = e as { message?: string; stack?: string };
    const message = err && err.message ? err.message : String(e);
    status("Boot failed: " + message);
    trace("BOOT FAILED: " + message);
    if (err && err.stack) trace("  " + err.stack);
  },
);

// ── frame loop ────────────────────────────────────────────────────────────

let lastMs = Date.now();
let ticks = 0;
/**
 * How many frame errors have been reported.
 *
 * This used to be a permanent latch: the first throwing frame set `frameFailed`
 * and the render loop never drew again for the rest of the run. On Perry that
 * turned one bad frame into a dead viewer — the spine animation rendered for an
 * instant, one frame threw (e.g. a property write the runtime rejects), and the
 * picture vanished even though the loop kept ticking and the UI stayed live.
 *
 * Report the first few and keep drawing: a renderer that gives up permanently on
 * one frame is worse than one that drops that frame, and the failure stays
 * visible in the trace either way.
 */
let frameErrors = 0;
const MAX_REPORTED_FRAME_ERRORS = 3;

function tick(): void {
  ticks = ticks + 1;
  const now = Date.now();
  // Clamp so a slow decode or a debugger pause does not teleport the animation
  // forward when the loop resumes.
  let dt = (now - lastMs) / 1000;
  lastMs = now;
  if (dt > 0.05) dt = 0.05;

  {
    try {
      stage.tick(dt);
    } catch (e: unknown) {
      frameErrors = frameErrors + 1;
      const err = e as { message?: string; stack?: string };
      const message = err && err.message ? err.message : String(e);
      // Keep the status line current, but only write the (long) trace entry a
      // few times so a per-frame failure cannot flood the file.
      status("Frame error (" + frameErrors + "): " + message);
      if (frameErrors <= MAX_REPORTED_FRAME_ERRORS) {
        trace("FRAME ERROR #" + frameErrors + ": " + message);
        if (err && err.stack) trace("  " + err.stack);
      } else if (frameErrors === MAX_REPORTED_FRAME_ERRORS + 1) {
        trace("FRAME ERROR: further occurrences are not written to the trace " +
          "(the status line still shows the running total)")
      }
    }
  }

  if (ticks % 120 === 0) {
    trace("tick " + ticks + " fps=" + fps().toFixed(1) + " sel=" + selected()
      + " rows=" + displayRows().length + " realized=" + rowsRealized);
  }
  onFrame(tick);
}

// Registered BEFORE App() so the pump is already driving when App blocks.
onFrame(tick);

/*
 * The single element this module builds, and the only place JSX is evaluated at
 * module scope.
 *
 * Everything above this line is a component DECLARATION — nothing runs until
 * something mounts it, which is what `Root` relies on: its body closes over the
 * refs declared in this file, and evaluating it earlier would read them before
 * they exist. `mountApp` takes an element (a `Mountable`), not a component, so
 * the call has to happen here rather than at each component.
 *
 * This is the equivalent of `createRoot(el).render(<App />)` in React — the one
 * line that is allowed to build a tree eagerly, because it is the line that
 * mounts it.
 */
mountApp(
  { title: "NIKKE Viewer — Perry · rasen · gfx", width: WINDOW_W, height: WINDOW_H },
  <Root />,
);
