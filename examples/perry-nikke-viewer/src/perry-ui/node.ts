/**
 * Perry widget tree + the rasen `HostHooks` implementation.
 *
 * ── Why a retained TS-side tree ───────────────────────────────────────────
 * `perry/ui` native widgets expose no sibling or child queries: a handle can
 * only be attached to, reordered within, or detached from a parent. rasen's
 * structural components (`each`, `when`) and its `HostHooks` contract are
 * written against a node space where you can ask "where is this node among its
 * siblings", so the answer has to live somewhere. It lives here.
 *
 * Every `PerryNode` therefore carries `parent` and `children` in TypeScript,
 * mirroring the native tree. That makes `indexOf(node)` cheap and lets
 * `insert(parent, node, ref)` translate straight into
 * `widgetAddChildAt(parent, node, index)`.
 *
 * ── Append-only degradation, on purpose ───────────────────────────────────
 * This host deliberately does NOT implement `createMarker` / `nextSibling` /
 * `boundedHost`. `HostHooks` documents that a host whose children are real
 * native controls should not pretend to have an interleavable text sequence,
 * and `each` honours that by falling back to sequential append. So lists are
 * correct out of the box and lose only the move fast-path.
 *
 * Markers ARE implementable on top of this tree (a zero-size `Spacer` would do
 * as an anchor) — deferred until a list is measured slow, because a marker is a
 * real widget that participates in layout, and the append path is the one that
 * has to be right first.
 */
import {
  VStack,
  HStack,
  Text,
  Button,
  Spacer,
  Divider,
  ScrollView,
  TextField,
  LazyVStack,
  lazyvstackUpdate,
  lazyvstackSetRowHeight,
  widgetAddChild,
  widgetAddChildAt,
  widgetRemoveChild,
  widgetReorderChild,
  widgetSetOnClick,
  widgetSetBorderWidth,
  widgetSetBorderColor,
  textSetString,
  textSetFontSize,
  textSetColor,
  buttonSetTitle,
  buttonSetTextColor,
  buttonSetBordered,
  widgetSetWidth,
  widgetSetHeight,
  widgetSetOpacity,
  widgetSetHidden,
  widgetSetEnabled,
  widgetSetHugging,
  widgetSetBackgroundColor,
  setPadding,
  setCornerRadius,
  type Widget,
} from "perry/ui";
import type { HostHooks } from "@rasenjs/core";

/** Widget kinds this host can create. */
export type PerryKind =
  | "VStack"
  | "HStack"
  | "Text"
  | "Button"
  | "Spacer"
  | "Divider"
  | "ScrollView"
  | "TextField"
  /** A widget built elsewhere and adopted via `wrapWidget`. */
  | "#raw"
  | "#root";

/**
 * The widget kinds that can take children through `widgetAddChildAt`.
 *
 * `ScrollView` is deliberately absent: it hosts exactly one child, installed via
 * `scrollviewSetChild`, and the `scroll` component supplies an inner column so
 * children never address the scroll view directly.
 */
const CONTAINER: Record<string, boolean> = {
  VStack: true,
  HStack: true,
  "#root": true,
};

/** A node in the mirrored tree. `widget` is the opaque native handle. */
export interface PerryNode {
  kind: PerryKind;
  widget: Widget;
  parent: PerryNode | null;
  children: PerryNode[];
  /** Props as last applied, so a re-apply can skip unchanged values. */
  props: PerryProps;
  /** Current text/label content, kept so `spansText` nodes can be refreshed. */
  content: string;
}

/**
 * Styling props shared by every widget.
 *
 * Values are already unwrapped (the prop layer turns `PropValue<T>` into `T`),
 * so this struct is plain data.
 */
export interface PerryProps {
  width?: number;
  height?: number;
  opacity?: number;
  hidden?: boolean;
  disabled?: boolean;
  padding?: number;
  cornerRadius?: number;
  /** `#rgb` / `#rrggbb` / `#rrggbbaa`. */
  backgroundColor?: string;
  /** `#rgb` / `#rrggbb` — text and button labels only. */
  color?: string;
  fontSize?: number;
  /** Hairline outline, used for the variant indent rule and pill edges. */
  borderWidth?: number;
  borderColor?: string;
  /**
   * Make a non-button container clickable.
   *
   * A whole-row hit target needs this: a row is a stack of an image and two
   * labels, and only the outermost widget can own the click.
   */
  onPress?: () => void;
  /**
   * Draw the platform's button chrome. Off for a list row that should read as
   * a plain clickable label; on for a commit-style action.
   */
  bordered?: boolean;
  /**
   * Layout priority. Higher hugs its content; a low value lets a sibling take
   * the slack. AppKit calls this compression resistance.
   */
  hugging?: number;
  /**
   * Gap between a stack's children, in points. Constructor-only on both native
   * backends, so a change is a re-mount rather than a property write.
   */
  spacing?: number;
}

/** Create the native widget backing `kind`. Leaves start empty. */
function createWidget(kind: PerryKind, props: PerryProps): Widget {
  switch (kind) {
    case "VStack":
      // Spacing is a constructor argument, and perry/ui's overload takes it
      // only in the two-argument form, so an unspecified gap passes 0 rather
      // than relying on the platform default.
      return VStack(props.spacing !== undefined ? props.spacing : 10, []);
    case "HStack":
      return HStack(props.spacing !== undefined ? props.spacing : 10, []);
    case "Text":
      return Text("");
    case "Button":
      return Button("", props.onPress ? props.onPress : function (): void {});
    case "Spacer":
      return Spacer();
    case "Divider":
      return Divider();
    case "ScrollView":
      return ScrollView();
    case "#raw":
      throw new Error("#raw nodes are created by wrapWidget, not createNode");
    // The App() body container. perry/ui has no "root widget" concept, so the
    // window body is itself a VStack and this kind is an alias for one.
    case "#root":
      return VStack(0, []);
    default:
      // Unreachable for a well-typed caller; kept so an unhandled kind fails
      // loudly instead of returning undefined into the native layer.
      throw new Error("Unsupported Perry widget kind: " + String(kind));
  }
}

/** Allocate a detached node. It joins the tree through `insertNode`. */
export function createNode(kind: PerryKind, props: PerryProps): PerryNode {
  const node: PerryNode = {
    kind: kind,
    widget: createWidget(kind, props),
    parent: null,
    children: [],
    props: props,
    content: "",
  };
  applyProps(node, props);
  return node;
}

/**
 * Adopt an already-created native widget as a node.
 *
 * Some widgets cannot be built from a `PerryKind` alone because they carry
 * constructor arguments that only the caller knows: `BloomView(w, h)` sizes its
 * drawable, `Image(url)` starts a fetch. Wrapping lets those reach the tree
 * without this module having to guess their arguments.
 */
export function wrapWidget(
  widget: Widget,
  kind: PerryKind,
  props?: PerryProps,
): PerryNode {
  return {
    kind: kind,
    widget: widget,
    parent: null,
    children: [],
    props: props ? props : {},
    content: "",
  };
}

// ── colors ────────────────────────────────────────────────────────────────

/**
 * Parse `#rgb` / `#rrggbb` / `#rrggbbaa` into the 0..1 RGBA floats perry/ui
 * takes.
 *
 * Deliberately not a general CSS colour parser: the viewer's palette is defined
 * in this repository, so hex covers it, and an unparseable string becomes
 * opaque black rather than silently reading as transparent.
 */
export function parseHex(css: string): [number, number, number, number] {
  let hex = css.charAt(0) === "#" ? css.substring(1) : css;
  if (hex.length === 3) {
    hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) +
      hex.charAt(2) + hex.charAt(2);
  }
  if (hex.length === 6) hex = hex + "ff";
  if (hex.length !== 8) return [0, 0, 0, 1];
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = parseInt(hex.substring(6, 8), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(a)) return [0, 0, 0, 1];
  return [r / 255, g / 255, b / 255, a / 255];
}

// ── property application ──────────────────────────────────────────────────

/**
 * Push `props` onto `node`'s native widget.
 *
 * `previous` is the prop set already applied, so unchanged values are skipped —
 * a per-frame `backgroundColor` write on every row would otherwise re-enter
 * AppKit's layout. Pass `undefined` on the first application.
 */
export function applyProps(
  node: PerryNode,
  props: PerryProps,
  previous?: PerryProps,
): void {
  const widget = node.widget;
  const prev = previous;

  if (props.width !== undefined && (!prev || prev.width !== props.width)) {
    widgetSetWidth(widget, props.width);
  }
  if (props.height !== undefined && (!prev || prev.height !== props.height)) {
    widgetSetHeight(widget, props.height);
  }
  if (props.opacity !== undefined && (!prev || prev.opacity !== props.opacity)) {
    widgetSetOpacity(widget, props.opacity);
  }
  if (props.hidden !== undefined && (!prev || prev.hidden !== props.hidden)) {
    widgetSetHidden(widget, props.hidden ? 1 : 0);
  }
  if (
    props.disabled !== undefined && (!prev || prev.disabled !== props.disabled)
  ) {
    widgetSetEnabled(widget, props.disabled ? 0 : 1);
  }
  if (props.padding !== undefined && (!prev || prev.padding !== props.padding)) {
    setPadding(widget, props.padding);
  }
  if (
    props.cornerRadius !== undefined &&
    (!prev || prev.cornerRadius !== props.cornerRadius)
  ) {
    setCornerRadius(widget, props.cornerRadius);
  }
  if (
    props.backgroundColor !== undefined &&
    (!prev || prev.backgroundColor !== props.backgroundColor)
  ) {
    const c = parseHex(props.backgroundColor);
    widgetSetBackgroundColor(widget, c[0], c[1], c[2], c[3]);
  }
  if (props.hugging !== undefined && (!prev || prev.hugging !== props.hugging)) {
    widgetSetHugging(widget, props.hugging);
  }
  if (
    props.bordered !== undefined && (!prev || prev.bordered !== props.bordered)
  ) {
    buttonSetBordered(widget, props.bordered ? 1 : 0);
  }
  if (
    props.color !== undefined && (!prev || prev.color !== props.color) &&
    (node.kind === "Text" || node.kind === "Button")
  ) {
    const c = parseHex(props.color);
    if (node.kind === "Text") {
      textSetColor(widget, c[0], c[1], c[2], c[3]);
    } else {
      buttonSetTextColor(widget, c[0], c[1], c[2], c[3]);
    }
  }
  if (
    props.fontSize !== undefined &&
    (!prev || prev.fontSize !== props.fontSize) && node.kind === "Text"
  ) {
    textSetFontSize(widget, props.fontSize);
  }
  if (
    props.borderWidth !== undefined &&
    (!prev || prev.borderWidth !== props.borderWidth)
  ) {
    widgetSetBorderWidth(widget, props.borderWidth);
  }
  if (
    props.borderColor !== undefined &&
    (!prev || prev.borderColor !== props.borderColor)
  ) {
    const c = parseHex(props.borderColor);
    widgetSetBorderColor(widget, c[0], c[1], c[2], c[3]);
  }
  // The click target is a live dispatcher owned by the native widget, so a new
  // callback is installed rather than the old one mutated.
  if (props.onPress !== undefined && (!prev || prev.onPress !== props.onPress)) {
    widgetSetOnClick(widget, props.onPress);
  }

  node.props = props;
}

/**
 * Set a Text node's string, or a Button's title.
 *
 * Kept separate from `applyProps` because content changes are the common
 * per-update case and should not walk the whole style set.
 */
export function setNodeContent(node: PerryNode, content: string): void {
  if (node.content === content) return;
  node.content = content;
  if (node.kind === "Text") textSetString(node.widget, content);
  else if (node.kind === "Button") buttonSetTitle(node.widget, content);
}

/**
 * Merge `patch` into the node's props and push the result.
 *
 * This is what reactive bindings call, so the diff in `applyProps` actually
 * runs: passing the node's previous prop set as `previous` means a one-property
 * update touches exactly one native setter instead of re-writing every style.
 */
export function patchProps(node: PerryNode, patch: PerryProps): void {
  const next: PerryProps = { ...node.props, ...patch };
  applyProps(node, next, node.props);
}

// ── tree operations ───────────────────────────────────────────────────────

/** Index of `child` among `parent`'s children, or -1. */
function indexOf(parent: PerryNode, child: PerryNode): number {
  return parent.children.indexOf(child);
}

/**
 * Attach `child` under `parent`, at `ref`'s position or at the end.
 *
 * Moving an already-attached node is the same call: `insert` is rasen's single
 * positioning primitive (see the `HostHooks` contract), so a reparent or a
 * reorder arrives here too and is handled by detaching first.
 */
export function insertNode(
  parent: PerryNode,
  child: PerryNode,
  ref: PerryNode | null,
): void {
  if (ref === child) return;
  if (ref && ref.parent !== parent) {
    throw new Error("Insertion anchor belongs to another parent");
  }
  if (!CONTAINER[parent.kind]) {
    throw new Error(parent.kind + " cannot contain children");
  }
  // Guard against a cycle: a node may not be inserted into its own subtree.
  for (let a: PerryNode | null = parent; a; a = a.parent) {
    if (a === child) throw new Error("Cannot insert a node into its own subtree");
  }

  // A widget factory that returned nothing must not reach the native layer.
  //
  // `undefined` crosses the FFI as handle 1, and the native side resolves that
  // to the first registered widget — silently re-parenting an unrelated view
  // (in this app the embedded GPU surface) into the offending row. Raising it
  // here is what turns "the picture is subtly wrong" into a located failure.
  if (child.widget === undefined || child.widget === null) {
    throw new Error(
      "Cannot insert a node with no widget (kind=" + child.kind +
      " into " + parent.kind + "). A widget factory returned undefined.",
    );
  }

  const previousParent = child.parent;
  if (previousParent) {
    // Detach from the native parent too, not just the mirror, or the widget
    // stays in two places and reattaching corrupts the layout.
    widgetRemoveChild(previousParent.widget, child.widget);
    const at = indexOf(previousParent, child);
    if (at >= 0) previousParent.children.splice(at, 1);
  }

  const index = ref ? indexOf(parent, ref) : parent.children.length;
  const safeIndex = index < 0 ? parent.children.length : index;
  parent.children.splice(safeIndex, 0, child);
  child.parent = parent;
  widgetAddChildAt(parent.widget, child.widget, safeIndex);
}

/** Detach `node` from its parent. A detached node may be re-inserted. */
export function detachNode(node: PerryNode): void {
  const parent = node.parent;
  if (!parent) return;
  const at = indexOf(parent, node);
  if (at >= 0) parent.children.splice(at, 1);
  node.parent = null;
  widgetRemoveChild(parent.widget, node.widget);
}

/** Append `child` to `parent`. */
export function appendChild(parent: PerryNode, child: PerryNode): void {
  insertNode(parent, child, null);
}

// ── rasen HostHooks ───────────────────────────────────────────────────────

/**
 * Host capabilities for a Perry subtree.
 *
 * `insert` and `detach` are all rasen needs here. The marker trio is
 * intentionally absent — see the module note — which makes `each` and `when`
 * run their sequential-append path.
 */
export const perryHooks: HostHooks<PerryNode> = {
  insert: function (parent: PerryNode, node: PerryNode, ref: PerryNode | null): void {
    insertNode(parent, node, ref);
  },
  detach: function (node: PerryNode): void {
    detachNode(node);
  },
};

/** Re-exported so downstream modules can reorder without reaching for FFI. */
export function reorderChild(parent: PerryNode, from: number, to: number): void {
  widgetReorderChild(parent.widget, from, to);
  const moved = parent.children.splice(from, 1)[0];
  if (moved) parent.children.splice(to, 0, moved);
}

/** Attach a child at the end, bypassing the ref lookup. */
export { widgetAddChild };
