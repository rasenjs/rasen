/**
 * Design tokens for the viewer.
 *
 * Every value is taken from the browser viewer so the native build reads as the
 * same product: `brand` from `examples/nikke-viewer/unocss.config.ts`, and the
 * `neutral-*` ramp plus the `white/N` overlay shades from UnoCSS's own palette.
 *
 * ── Why overlays are pre-blended ──────────────────────────────────────────
 * The browser expresses elevation as translucent white over a panel
 * (`bg-white/5`, `hover:bg-white/10`). Those look right because the browser
 * composites them over whatever is behind. A native widget's background is its
 * own layer, so passing the same alpha would either composite correctly or fall
 * back to opaque black depending on the view's backing — a difference that is
 * invisible in code review and obvious on screen.
 *
 * So each overlay is resolved against the surface it actually sits on and stored
 * as an opaque colour. The arithmetic is written out beside each value, which
 * makes the intent reviewable instead of hidden in a screenshot comparison.
 */

/** Accent ramp — `unocss.config.ts`. */
export const BRAND = {
  s400: "#818cf8",
  s500: "#6366f1",
  s600: "#4f46e5",
  s700: "#4338ca",
} as const;

/** UnoCSS `neutral` ramp, the shades the viewer uses. */
export const N = {
  s950: "#0a0a0a",
  s900: "#171717",
  s800: "#262626",
  s700: "#404040",
  s600: "#525252",
  s500: "#737373",
  s400: "#a3a3a3",
  s300: "#d4d4d4",
  s200: "#e5e5e5",
  s100: "#f5f5f5",
} as const;

/** `white/5` over `base`: 0.05*255 + 0.95*base. */
function over5(base: number): string {
  return blend(base, 0.05);
}
/** `white/10` over `base`. */
function over10(base: number): string {
  return blend(base, 0.1);
}

function blend(base: number, whiteAmount: number): string {
  const v = Math.round(whiteAmount * 255 + (1 - whiteAmount) * base);
  const hex = v.toString(16).padStart(2, "0");
  return "#" + hex + hex + hex;
}

/**
 * Surface colours, resolved for the panel each one sits on.
 *
 * Two families because a chip inside the sidebar sits on the panel, not on the
 * window: the same 5% white reads differently against 0x17 and 0x0a.
 */
export const SURFACE = {
  /** Window background — `bg-neutral-950`. */
  window: N.s950,
  /** Sidebar and control panel — `bg-neutral-900`. */
  panel: N.s900,

  /** `bg-white/5` on the panel. */
  chipOnPanel: over5(0x17),
  /** `bg-white/10` on the panel (hover). */
  chipOnPanelHover: over10(0x17),
  /** `bg-white/5` on the window background. */
  chipOnWindow: over5(0x0a),
  /** `bg-white/10` on the window background. */
  chipOnWindowHover: over10(0x0a),

  /** Row at rest — the panel colour, i.e. transparent over the panel. */
  row: N.s900,
  /** Selected row — `bg-brand-600` in the browser. */
  rowActive: BRAND.s600,
  /** A group header row, lifted a step so the two levels read apart. */
  rowGroup: over5(0x17),

  /** Hairline border — `border-white/10` on the panel. */
  hairline: over10(0x17),
  /** Fainter hairline — `border-white/5` on the panel. */
  hairlineFaint: over5(0x17),
  /** The variant indent rule — `border-white/10` on the panel. */
  indentRule: over10(0x17),

  /** A faint inset block, e.g. the tech-info list. */
  inset: over5(0x0a),
} as const;

/** Type sizes, in points. The browser's rem sizes scaled to the native grid. */
export const TEXT = {
  /** `text-[15px]` — the app name. */
  appName: 15,
  /** `text-lg` — the TopBar title. */
  title: 16,
  /** `text-sm` — row names, buttons. */
  body: 14,
  /** `text-xs` — row ids, helper text. */
  small: 12,
  /** `text-[11px]` — uppercase section headings. */
  tiny: 11,
  /** `text-[10px]` — counters in the footer. */
  micro: 10,
} as const;

/** Background presets — the viewer's original set. */
export const BG_PRESETS: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Dark", color: "#0b1020" },
  { name: "Black", color: "#000000" },
  { name: "White", color: "#f5f5f5" },
  { name: "Navy", color: "#0f1e3d" },
  { name: "Green", color: "#0c2a1e" },
];
