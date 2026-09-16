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
import {
  button,
  hostWidget,
  image,
  mountApp,
  rule,
  spacer,
  stack,
  text,
  textField,
  virtualList,
} from "../perry-ui";
import { Stage } from "./stage";
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

// ── shared element helpers ────────────────────────────────────────────────

/** A pill-shaped toggle, the viewer's one button idiom. */
function pill(opts: {
  label: PropValue<string>;
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
}): ReturnType<typeof button> {
  return button({
    label: opts.label,
    bordered: false,
    // `rounded-full` in the browser; a radius past half the height is equivalent.
    cornerRadius: 999,
    padding: 6,
    width: opts.width,
    backgroundColor: function (): string {
      if (opts.enabled && !opts.enabled()) return SURFACE.chipOnPanel;
      return opts.active && opts.active() ? BRAND.s600 : SURFACE.chipOnPanel;
    },
    textColor: function (): string {
      if (opts.enabled && !opts.enabled()) return N.s700;
      return opts.active && opts.active() ? N.s100 : N.s300;
    },
    onPress: opts.onPress,
  });
}

/** A small uppercase section heading, as in the browser's control panel. */
function sectionLabel(label: string): ReturnType<typeof text> {
  return text({ content: label.toUpperCase(), fontSize: TEXT.tiny, color: N.s500 });
}

/** A flat action button (`bg-white/5`, rounded-lg). */
function actionButton(
  label: string,
  onPress: () => void,
  opts?: { active?: () => boolean },
): ReturnType<typeof button> {
  return button({
    label: label,
    bordered: false,
    cornerRadius: 8,
    padding: 8,
    backgroundColor: function (): string {
      return opts && opts.active && opts.active() ? BRAND.s600 : SURFACE.chipOnPanel;
    },
    textColor: function (): string {
      return opts && opts.active && opts.active() ? N.s100 : N.s200;
    },
    onPress: onPress,
  });
}

// ── sidebar ───────────────────────────────────────────────────────────────

/** Width of one tab pill, so two of them plus the gap fill the sidebar inner width. */
const TAB_PILL_W = 132;

/**
 * The four category tabs, two per row.
 *
 * Two rows rather than one: at 12pt the labels plus their counts run to roughly
 * 300pt, and the sidebar's inner width is 276 — an `NSStackView` distributes
 * slack instead of shrinking children, so a single row simply pushed `Story` off
 * the edge. Counts are read through a getter so they populate once the catalogue
 * lands.
 */
const tabRows = stack({
  direction: "column",
  spacing: 6,
  children: [
    stack({
      direction: "row",
      spacing: 6,
      children: TABS.slice(0, 2).map(function (t): ReturnType<typeof button> {
        return tabPill(t);
      }),
    }),
    stack({
      direction: "row",
      spacing: 6,
      children: TABS.slice(2).map(function (t): ReturnType<typeof button> {
        return tabPill(t);
      }),
    }),
  ],
});

function tabPill(t: { tab: Tab; label: string }): ReturnType<typeof button> {
  return pill({
    label: function (): string {
      const counts = tabCounts();
      const n = counts[t.tab] !== undefined ? counts[t.tab] : 0;
      return t.label + "  (" + n + ")";
    },
    width: TAB_PILL_W,
    active: function (): boolean { return tab() === t.tab; },
    onPress: function (): void {
      tab(t.tab);
      expanded("");
      refreshRows();
    },
  });
}

const QUICK_SEARCH = ["2b", "a2", "c01", "777"];

const quickSearchRow = stack({
  direction: "row",
  spacing: 6,
  children: QUICK_SEARCH.map(function (q): ReturnType<typeof button> {
    return pill({
      label: q,
      onPress: function (): void {
        search(q);
        refreshRows();
      },
    });
  }),
});

/**
 * One catalogue row: thumbnail, name over id, then a trailing tag.
 *
 * Built with plain values — the virtual list rebuilds rows on a version change
 * rather than subscribing per row.
 */
function rowView(row: DisplayRow): ReturnType<typeof stack> {
  const children: ReturnType<typeof stack>[] = [];

  if (row.depth > 0) {
    // The variant indent marker: `ml-6 pl-3 border-l border-white/10`.
    children.push(stack({
      direction: "row",
      spacing: 0,
      width: 13,
      children: [rule({ height: ROW_H - 16, color: SURFACE.indentRule })],
    }) as ReturnType<typeof stack>);
  }

  if (row.thumb) {
    children.push(stack({
      direction: "row",
      spacing: 0,
      width: 36,
      height: 36,
      cornerRadius: 18,
      backgroundColor: SURFACE.chipOnPanel,
      children: [image({ url: row.thumb, width: 36, height: 36, cornerRadius: 18 })],
    }) as ReturnType<typeof stack>);
  } else {
    // No thumbnail yet (an unexpanded group): keep the label aligned by
    // reserving the same slot.
    children.push(stack({
      direction: "row",
      spacing: 0,
      width: 36,
      height: 36,
      cornerRadius: 18,
      backgroundColor: SURFACE.chipOnPanelHover,
      children: [],
    }) as ReturnType<typeof stack>);
  }

  children.push(stack({
    direction: "column",
    spacing: 0,
    children: [
      text({
        content: row.name,
        fontSize: TEXT.body,
        color: row.active ? N.s100 : N.s200,
      }),
      text({
        content: row.sub,
        fontSize: TEXT.small,
        color: row.active ? N.s300 : N.s500,
      }),
    ],
  }) as ReturnType<typeof stack>);

  children.push(spacer({}) as ReturnType<typeof stack>);

  return stack({
    direction: "row",
    spacing: 10,
    height: ROW_H,
    padding: 6,
    cornerRadius: 8,
    backgroundColor: row.active ? SURFACE.rowActive
      : (row.kind === "group" ? SURFACE.rowGroup : SURFACE.row),
    onPress: function (): void { onRow(row); },
    children: children,
  });
}

/**
 * How many rows the list has asked us to build.
 *
 * This is the virtualization budget: the list is 350 rows, and a correct
 * virtual list realizes a screenful (plus the table's overscan), not all 350.
 * Counted rather than inferred because the failure mode is silent — an
 * unvirtualized list simply allocates 350 widgets and 350 thumbnail downloads,
 * which looks fine until it is measured.
 */
let rowsRealized = 0;

const list = virtualList({
  count: function (): number { return displayRows().length; },
  version: function (): number { return listVersion(); },
  rowHeight: ROW_H,
  render: function (index: number): ReturnType<typeof stack> {
    rowsRealized = rowsRealized + 1;
    const rowsNow = displayRows();
    const row = index < rowsNow.length ? rowsNow[index] : null;
    // A row realized past the end (the table can ask during a reload) gets an
    // empty placeholder rather than a crash.
    if (!row) return stack({ direction: "row", spacing: 0, height: ROW_H, children: [] });
    return rowView(row);
  },
});

const sidebar = stack({
  direction: "column",
  spacing: 0,
  width: SIDEBAR_W,
  backgroundColor: SURFACE.panel,
  children: [
    // Header: mark, app name, product name.
    stack({
      direction: "row",
      spacing: 12,
      padding: 16,
      children: [
        stack({
          direction: "row",
          spacing: 0,
          width: 36,
          height: 36,
          cornerRadius: 10,
          backgroundColor: BRAND.s600,
          hugging: 499,
          children: [
            // A letter rather than the product's logo image: the native build has
            // no bundle to load `/nikke-logo.png` from, and an empty coloured
            // square reads as a placeholder rather than a mark.
            text({ content: "R", fontSize: 18, color: N.s100 }),
          ],
        }),
        stack({
          direction: "column",
          spacing: 0,
          children: [
            text({ content: "Rasen", fontSize: TEXT.appName, color: N.s100 }),
            text({ content: "NIKKE Viewer", fontSize: TEXT.small, color: N.s400 }),
          ],
        }),
        spacer({}),
      ],
    }),
    stack({
      direction: "column",
      spacing: 8,
      padding: 12,
      children: [
        textField({
          placeholder: "Search characters…",
          onChange: function (value: string): void {
            search(value);
            refreshRows();
          },
        }),
        quickSearchRow,
        tabRows,
      ],
    }),
    list,
    stack({
      direction: "column",
      spacing: 4,
      padding: 12,
      children: [
        text({
          content: function (): string {
            return (busy() ? "Loading — " : "") + status();
          },
          fontSize: TEXT.tiny,
          color: function (): string { return busy() ? BRAND.s400 : N.s500; },
        }),
        text({
          content: function (): string {
            return entries().length + " models · " + displayRows().length + " rows";
          },
          fontSize: TEXT.micro,
          color: N.s600,
        }),
      ],
    }),
  ],
});

// ── top bar ───────────────────────────────────────────────────────────────

const topBar = stack({
  direction: "row",
  spacing: 12,
  padding: 14,
  backgroundColor: SURFACE.window,
  children: [
    stack({
      direction: "column",
      spacing: 0,
      children: [
        text({ content: "Character Viewer", fontSize: TEXT.title, color: N.s100 }),
        text({
          content: function (): string {
            return selectedName() ? selectedName() : "No character selected";
          },
          fontSize: TEXT.small,
          color: N.s400,
        }),
      ],
    }),
    spacer({}),
    text({
      content: function (): string {
        return fps() > 0
          ? fps().toFixed(0) + " fps  ·  " + drawMs().toFixed(1) + " ms"
          : "";
      },
      fontSize: TEXT.tiny,
      color: N.s500,
    }),
    actionButton("Re-fit", function (): void {
      void select(selected(), pose());
    }),
  ],
});

// ── stage ─────────────────────────────────────────────────────────────────

const stageArea = stack({
  direction: "column",
  spacing: 0,
  backgroundColor: function (): string { return bg(); },
  onPress: function (): void { /* the click target is the canvas itself */ },
  children: [
    hostWidget(stage.widget),
    // Empty state, shown until the first model lands. The browser shows a
    // dimmed hint in the middle of the stage.
    stack({
      direction: "column",
      spacing: 6,
      padding: 12,
      backgroundColor: function (): string {
        return loaded() ? bg() : SURFACE.chipOnWindow;
      },
      children: [
        text({
          content: function (): string {
            return loaded() ? "" : (status() || "Select a character to begin");
          },
          fontSize: TEXT.small,
          color: N.s400,
        }),
      ],
    }),
  ],
});

// ── control panel ─────────────────────────────────────────────────────────

const POSE_BUTTONS: Array<{ pose: PoseKind; label: string }> = [
  { pose: "fb", label: "FB" },
  { pose: "cover", label: "Cover" },
  { pose: "aim", label: "Aim" },
];

const poseSection = stack({
  direction: "column",
  spacing: 8,
  children: [
    sectionLabel("Pose"),
    stack({
      direction: "row",
      spacing: 8,
      children: POSE_BUTTONS.map(function (p): ReturnType<typeof button> {
        return pill({
          label: p.label,
          // Three equal pills across the panel: (288 - 2*18 padding - 2*8
          // spacing) / 3. Spelled out because the stack will not shrink them.
          width: 78,
          active: function (): boolean { return pose() === p.pose; },
          enabled: function (): boolean {
            return p.pose === "fb" || poseAvail()[p.pose];
          },
          onPress: function (): void { setPose(p.pose); },
        });
      }),
    }),
    text({
      content: function (): string {
        if (!selectedName()) return "Select a costume to load its poses";
        return "Cover available: " + (poseAvail().cover ? "yes" : "no")
          + " · Aim available: " + (poseAvail().aim ? "yes" : "no");
      },
      fontSize: TEXT.small,
      color: N.s500,
    }),
  ],
});

/**
 * The animation picker.
 *
 * One row per animation in a virtual list — the native equivalent of the
 * browser's `flex-wrap` inside an `overflow-y-auto` panel. Virtualizing it
 * matters here: a rig can carry hundreds (c310 has 189), and the rows are
 * rebuilt only when a model loads, so this stays bounded without a cap.
 * `virtualList` already owns its own scroll view, so it is not wrapped in one.
 */
const animSection = stack({
  direction: "column",
  spacing: 8,
  children: [
    sectionLabel("Animation"),
    text({
      content: function (): string {
        const n = animNames();
        if (!n.length) return "no animations";
        const i = animIndex();
        return n[i] + "   (" + (i + 1) + "/" + n.length + ")";
      },
      fontSize: TEXT.small,
      color: BRAND.s400,
    }),
    virtualList({
      height: ANIM_LIST_H,
      backgroundColor: SURFACE.chipOnWindow,
      cornerRadius: 8,
      count: function (): number { return animNames().length; },
      version: function (): number { return animVersion(); },
      rowHeight: 26,
      render: function (index: number): ReturnType<typeof button> {
        const names = animNames();
        const name = index < names.length ? names[index] : "";
        return button({
          label: name,
          bordered: false,
          cornerRadius: 6,
          padding: 3,
          backgroundColor: function (): string {
            return animIndex() === index ? BRAND.s600 : SURFACE.chipOnWindow;
          },
          textColor: function (): string {
            return animIndex() === index ? N.s100 : N.s300;
          },
          onPress: function (): void { setAnimation(index); },
        });
      },
    }),
  ],
});

const bgSection = stack({
  direction: "column",
  spacing: 8,
  children: [
    sectionLabel("Background"),
    stack({
      direction: "row",
      spacing: 8,
      children: (function (): Array<ReturnType<typeof stack>> {
        const out: Array<ReturnType<typeof stack>> = BG_PRESETS.map(
          function (p): ReturnType<typeof stack> {
            return stack({
              direction: "row",
              spacing: 0,
              width: 30,
              height: 30,
              cornerRadius: 8,
              backgroundColor: p.color,
              borderWidth: function (): number { return bg() === p.color ? 2 : 1; },
              borderColor: function (): string {
                return bg() === p.color ? BRAND.s400 : SURFACE.hairline;
              },
              onPress: function (): void { applyBg(p.color); },
              children: [],
            });
          },
        );
        out.push(spacer({}));
        return out;
      })(),
    }),
  ],
});

const viewSection = stack({
  direction: "column",
  spacing: 8,
  children: [
    sectionLabel("View"),
    actionButton("Re-fit to model", function (): void {
      void select(selected(), pose());
    }),
    actionButton("Reset selection", function (): void {
      expanded("");
      refreshRows();
      status("Selection cleared");
    }),
  ],
});

const controlPanel = stack({
  direction: "column",
  spacing: 20,
  width: PANEL_W,
  padding: 18,
  backgroundColor: SURFACE.panel,
  children: [poseSection, animSection, bgSection, viewSection],
});

// ── root ──────────────────────────────────────────────────────────────────

const root = stack({
  direction: "row",
  spacing: 0,
  backgroundColor: SURFACE.window,
  children: [
    sidebar,
    stack({
      direction: "column",
      spacing: 0,
      children: [topBar, stageArea],
    }),
    controlPanel,
  ],
});

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
/** Latched so a repeatedly failing frame reports once instead of every tick. */
let frameFailed = false;

function tick(): void {
  ticks = ticks + 1;
  const now = Date.now();
  // Clamp so a slow decode or a debugger pause does not teleport the animation
  // forward when the loop resumes.
  let dt = (now - lastMs) / 1000;
  lastMs = now;
  if (dt > 0.05) dt = 0.05;

  if (!frameFailed) {
    try {
      stage.tick(dt);
    } catch (e: unknown) {
      frameFailed = true;
      const err = e as { message?: string; stack?: string };
      const message = err && err.message ? err.message : String(e);
      status("Frame error: " + message);
      trace("FRAME ERROR: " + message);
      if (err && err.stack) trace("  " + err.stack);
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
mountApp(
  { title: "NIKKE Viewer — Perry · rasen · gfx", width: WINDOW_W, height: WINDOW_H },
  root,
);
