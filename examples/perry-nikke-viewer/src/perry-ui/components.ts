/**
 * rasen components over `perry/ui` native widgets.
 *
 * These are ordinary rasen `Mountable`s: each takes props, returns
 * `(parent, hooks) => unmount`, and gets its reactivity from whatever runtime
 * `setReactiveRuntime` installed. Nothing here is Perry-specific beyond the
 * widget calls, and nothing here is a new component model — `children` are
 * `Mountable<PerryNode>[]`, so `each`, `when` and user components nest freely.
 *
 * ── Reactive props ────────────────────────────────────────────────────────
 * A `PropValue<T>` prop is applied once, then re-applied through
 * `getReactiveRuntime().subscribe(...)`. Per the runtime contract a source that
 * collects no dependencies is dropped after its first read, so a plain value
 * costs one application and no subscription — writing `text({ content: "fixed" })`
 * and `text({ content: () => count() })` needs no distinction at the call site.
 */
import { com, getReactiveRuntime, toValue, type Mountable, type PropValue } from "@rasenjs/core";
import {
  createNode,
  insertNode,
  detachNode,
  setNodeContent,
  patchProps,
  wrapWidget,
  perryHooks,
  type PerryNode,
  type PerryProps,
} from "./node";
import {
  App,
  Image as ImageWidget,
  LazyVStack,
  TextField as TextFieldWidget,
  imageSetSize,
  lazyvstackSetRowHeight,
  lazyvstackUpdate,
  scrollviewSetChild,
  type Widget,
} from "perry/ui";

/** Style props every component accepts. Sizes are points, not pixels. */
export interface StyleProps {
  width?: PropValue<number>;
  height?: PropValue<number>;
  opacity?: PropValue<number>;
  hidden?: PropValue<boolean>;
  disabled?: PropValue<boolean>;
  padding?: PropValue<number>;
  cornerRadius?: PropValue<number>;
  /** `#rgb` / `#rrggbb` / `#rrggbbaa`. */
  backgroundColor?: PropValue<string>;
  /** Hairline outline (points) and its colour. */
  borderWidth?: PropValue<number>;
  borderColor?: PropValue<string>;
  /** Distribute a stack's slack: lower values stretch, higher values hug. */
  hugging?: PropValue<number>;
  /**
   * Make a container clickable.
   *
   * A list row is a stack of a thumbnail and two labels, so the row's whole hit
   * target only exists on the outermost widget — which is a stack, not a button.
   */
  onPress?: () => void;
}

// ── binding helpers ───────────────────────────────────────────────────────

/**
 * Apply `prop` now and again whenever its source changes.
 *
 * Returns the unsubscribe function, or `undefined` when the source is static —
 * the runtime reports that by never calling back, so the caller can hold the
 * result without branching.
 */
function bind<T>(
  prop: PropValue<T> | undefined,
  apply: (value: T) => void,
): (() => void) | undefined {
  if (prop === undefined) return undefined;
  apply(toValue(prop));
  return getReactiveRuntime().subscribe(
    function (): T {
      return toValue(prop as PropValue<T>);
    },
    apply,
  );
}

/**
 * Resolve the style props to a plain `PerryProps`.
 *
 * Only the static value is taken here; reactive style props are bound
 * individually below so an update rewrites one native property instead of
 * re-applying the whole set.
 */
function styleOf(style: StyleProps | undefined): PerryProps {
  const out: PerryProps = {};
  if (!style) return out;
  if (style.width !== undefined) out.width = toValue(style.width);
  if (style.height !== undefined) out.height = toValue(style.height);
  if (style.opacity !== undefined) out.opacity = toValue(style.opacity);
  if (style.hidden !== undefined) out.hidden = toValue(style.hidden);
  if (style.disabled !== undefined) out.disabled = toValue(style.disabled);
  if (style.padding !== undefined) out.padding = toValue(style.padding);
  if (style.cornerRadius !== undefined) out.cornerRadius = toValue(style.cornerRadius);
  if (style.backgroundColor !== undefined) {
    out.backgroundColor = toValue(style.backgroundColor);
  }
  if (style.borderWidth !== undefined) out.borderWidth = toValue(style.borderWidth);
  if (style.borderColor !== undefined) out.borderColor = toValue(style.borderColor);
  if (style.hugging !== undefined) out.hugging = toValue(style.hugging);
  if (style.onPress !== undefined) out.onPress = style.onPress;
  return out;
}

/**
 * Bind the reactive style props of `style` onto `node`.
 *
 * Collected into one function so every component closes over the same logic;
 * `undefined` props are skipped by `bind`. Each write goes through `patchProps`
 * so only the changed native property is touched.
 */
function bindStyle(
  node: PerryNode,
  style: StyleProps | undefined,
): (() => void)[] {
  if (!style) return [];
  const stops: (() => void)[] = [];
  const add = (s: (() => void) | undefined): void => {
    if (s) stops.push(s);
  };
  add(bind(style.width, function (v): void {
    patchProps(node, { width: v });
  }));
  add(bind(style.height, function (v): void {
    patchProps(node, { height: v });
  }));
  add(bind(style.opacity, function (v): void {
    patchProps(node, { opacity: v });
  }));
  add(bind(style.hidden, function (v): void {
    patchProps(node, { hidden: v });
  }));
  add(bind(style.disabled, function (v): void {
    patchProps(node, { disabled: v });
  }));
  add(bind(style.padding, function (v): void {
    patchProps(node, { padding: v });
  }));
  add(bind(style.cornerRadius, function (v): void {
    patchProps(node, { cornerRadius: v });
  }));
  add(bind(style.backgroundColor, function (v): void {
    patchProps(node, { backgroundColor: v });
  }));
  add(bind(style.borderWidth, function (v): void {
    patchProps(node, { borderWidth: v });
  }));
  add(bind(style.borderColor, function (v): void {
    patchProps(node, { borderColor: v });
  }));
  add(bind(style.hugging, function (v): void {
    patchProps(node, { hugging: v });
  }));
  return stops;
}

/** Mount a list of children into `parent`, returning one combined unmount. */
function mountChildren(
  parent: PerryNode,
  children: Mountable<PerryNode>[] | undefined,
): () => void {
  if (!children) return function (): void { /* nothing */ };
  const unmounts: (() => void)[] = [];
  for (const child of children) {
    const unmount = child(parent, perryHooks);
    if (unmount) unmounts.push(unmount);
  }
  return function (): void {
    for (const unmount of unmounts) {
      try {
        unmount();
      } catch (_e) {
        // One child failing to unmount must not strand its siblings.
      }
    }
  };
}

// ── components ────────────────────────────────────────────────────────────

export interface StackProps extends StyleProps {
  /**
   * Stacking axis. `column` is a VStack, `row` an HStack.
   *
   * Read once at mount: swapping the axis means a different native widget, so it
   * is a structural choice rather than a reactive one.
   */
  direction?: "column" | "row";
  /** Gap between children in points. Also mount-time only. */
  spacing?: number;
  children?: Mountable<PerryNode>[];
}

/**
 * A vertical or horizontal stack — the layout primitive everything sits in.
 *
 * ```ts
 * stack({ direction: "row", spacing: 0, children: [ sidebar, stage ] })
 * ```
 */
export const stack = com(function (props: StackProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    // `spacing` is read by createNode's widget constructor; passing it through
    // PerryProps is what makes the two-argument perry/ui overload get used.
    const node = createNode(
      props.direction === "row" ? "HStack" : "VStack",
      props.spacing !== undefined
        ? { ...styleOf(props), spacing: props.spacing }
        : styleOf(props),
    );
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    const unmountChildren = mountChildren(node, props.children);
    return function (): void {
      unmountChildren();
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export interface TextProps extends StyleProps {
  content: PropValue<string | number>;
  fontSize?: PropValue<number>;
  /** `#rgb` / `#rrggbb` label colour. */
  color?: PropValue<string>;
}

/** A single line of native text. */
export const text = com(function (props: TextProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("Text", styleOf(props));
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    const stopContent = bind(props.content, function (v): void {
      setNodeContent(node, String(v));
    });
    const stopFont = bind(props.fontSize, function (v): void {
      patchProps(node, { fontSize: v });
    });
    const stopColor = bind(props.color, function (v): void {
      patchProps(node, { color: v });
    });
    return function (): void {
      if (stopContent) stopContent();
      if (stopFont) stopFont();
      if (stopColor) stopColor();
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export interface ButtonProps extends StyleProps {
  label: PropValue<string>;
  onPress?: () => void;
  /** Native button chrome. Off makes it read as a clickable label. */
  bordered?: boolean;
  textColor?: PropValue<string>;
}

/** A native button. `onPress` is a plain callback, not a `PropValue`. */
export const button = com(function (props: ButtonProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("Button", {
      ...styleOf(props),
      onPress: props.onPress,
      bordered: props.bordered,
    });
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    const stopLabel = bind(props.label, function (v): void {
      setNodeContent(node, String(v));
    });
    const stopColor = bind(props.textColor, function (v): void {
      patchProps(node, { color: v });
    });
    return function (): void {
      if (stopLabel) stopLabel();
      if (stopColor) stopColor();
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export interface ScrollProps extends StyleProps {
  children?: Mountable<PerryNode>[];
}

/**
 * A native scroll container.
 *
 * perry/ui does not let a `ScrollView` take children directly — it takes exactly
 * ONE child through `scrollviewSetChild`. So this creates the scroll view plus an
 * inner column, and hands the column to the children. That also means structural
 * components racing a scroll get the column as their parent, which is what they
 * want: appending to the scrollable content rather than to the viewport.
 */
export const scroll = com(function (props: ScrollProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("ScrollView", styleOf(props));
    // The scrollable content. Spacing 0 because rows manage their own height.
    const content = createNode("VStack", { spacing: 0 });
    scrollviewSetChild(node.widget, content.widget);
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    // Children go into `content`, so it mirrors the tree they are appended to.
    const unmountChildren = mountChildren(content, props.children);
    return function (): void {
      unmountChildren();
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export interface ImageProps extends StyleProps {
  /** http(s) URL or local file path. perry/ui fetches remote images itself. */
  url: PropValue<string>;
  alt?: string;
}

/**
 * A native image.
 *
 * The URL is mount-time only: changing it would need a new widget because
 * perry/ui's `Image` takes its source in the constructor. Re-mount instead.
 */
export const image = com(function (props: ImageProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    // Options-object form, NOT `ImageWidget(url, alt)`.
    //
    // The positional overload is declared and compiles, but returns
    // `undefined` on this Perry build (measured on 0.5.1654 with
    // `src/imgprobe.ts`: `typeof Image(url)` and `typeof Image(url, alt)` are
    // both "undefined", while `Image({url, alt})` yields a live widget). An
    // `undefined` child crosses the FFI as handle 1, which the native layer
    // resolves to the FIRST registered widget — here the embedded GPU view —
    // and re-parents it into this row.
    const widget = ImageWidget({
      url: toValue(props.url),
      alt: props.alt,
    });
    // `Image` builds a 64x64 view; a thumbnail is smaller, and the setter also
    // pins the intrinsic size so the surrounding stack lays out correctly.
    const w = props.width !== undefined ? toValue(props.width) : undefined;
    const h = props.height !== undefined ? toValue(props.height) : undefined;
    if (w !== undefined && h !== undefined) imageSetSize(widget, w, h);
    const node = wrapWidget(widget, "#raw", styleOf(props));
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    return function (): void {
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export interface SpacerProps {
  /** Fixed length along the parent's axis; omit to let it take the slack. */
  length?: number;
}

/** Flexible empty space. */
export const spacer = com(function (props: SpacerProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("Spacer", props.length !== undefined ? { width: props.length } : {});
    insertNode(parent, node, null);
    return function (): void {
      detachNode(node);
    };
  };
});

export interface TextFieldProps extends StyleProps {
  placeholder?: string;
  /**
   * Called on every edit. perry/ui owns the native control's editing state, so
   * this is a plain callback rather than a `PropValue` — there is nothing to
   * write back to.
   */
  onChange: (value: string) => void;
}

/**
 * A native single-line text field.
 *
 * Mount-time only for `placeholder` and `onChange`: perry/ui's `TextField` takes
 * both in its constructor and exposes no setter, so changing either means
 * re-mounting the component.
 */
export const textField = com(function (
  props: TextFieldProps,
): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = wrapWidget(
      TextFieldWidget(
        props.placeholder !== undefined ? props.placeholder : "",
        props.onChange,
      ),
      "#raw",
      styleOf(props),
    );
    insertNode(parent, node, null);
    const stops = bindStyle(node, props);
    return function (): void {
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

/** A 1px rule. */
export const divider = com(function (): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("Divider", {});
    insertNode(parent, node, null);
    return function (): void {
      detachNode(node);
    };
  };
});

/**
 * Adopt an externally created widget (a `BloomView`, say) as a tree node.
 *
 * The widget is not destroyed on unmount — whoever built it owns its lifetime,
 * and for a GPU surface that means releasing the device and swapchain
 * deliberately rather than as a side effect of removing a view.
 */
export function hostWidget(
  widget: Widget,
  style?: StyleProps,
): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = wrapWidget(widget, "#raw", styleOf(style));
    insertNode(parent, node, null);
    return function (): void {
      detachNode(node);
    };
  };
}

/** A 1pt vertical rule, for the variant indent marker. */
export interface RuleProps {
  height: number;
  color?: string;
  width?: number;
}

export const rule = com(function (props: RuleProps): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    const node = createNode("Spacer", {
      width: props.width !== undefined ? props.width : 1,
      height: props.height,
      backgroundColor: props.color !== undefined ? props.color : "#2e2e2e",
    });
    insertNode(parent, node, null);
    return function (): void {
      detachNode(node);
    };
  };
});

// ── virtual list ──────────────────────────────────────────────────────────

export interface VirtualListProps extends StyleProps {
  /** Row count, re-read whenever `version` changes. */
  count: () => number;
  /**
   * Bump this to rebuild the visible rows.
   *
   * `LazyVStack` re-realizes a row only when the table reloads, and it offers no
   * per-row update path — so a row's appearance is decided at build time and a
   * change of anything it displays is expressed as a new version.
   */
  version: () => number;
  /** Uniform row height. Variable heights would defeat the virtualization. */
  rowHeight: number;
  /** Build row `index`. Called only for rows near the visible rect. */
  render: (index: number) => Mountable<PerryNode>;
}

/**
 * A vertically scrolling list that only materializes visible rows.
 *
 * This exists because a plain `each` mounts every row, and every row here carries
 * a thumbnail that each spawns a download. 350 eager rows would mean 350
 * concurrent fetches and 350 image views; `LazyVStack` is backed by
 * `NSTableView`, whose row recycling keeps that bounded to what is on screen.
 *
 * Rows are deliberately built with PLAIN values — no reactive getters. A
 * `LazyVStack` row has no "went away" callback, so a subscription created inside
 * `render` could never be released; rebuilding on a `version` change keeps the
 * row set leak-free at the cost of re-realizing the visible rows, which is cheap
 * and only happens on a click.
 */
export const virtualList = com(function (
  props: VirtualListProps,
): Mountable<PerryNode> {
  return function (parent: PerryNode): () => void {
    // One detached container per realized row, which the table adopts as the row
    // view. The container is what the row's components mount into.
    const buildRow = function (index: number): Widget {
      const container = createNode("VStack", { spacing: 0 });
      const mount = props.render(index);
      mount(container, perryHooks);
      return container.widget;
    };

    const widget = LazyVStack(props.count(), buildRow);
    lazyvstackSetRowHeight(widget, props.rowHeight);
    const node = wrapWidget(widget, "#raw", styleOf(props));
    insertNode(parent, node, null);

    const stops = bindStyle(node, props);
    const stopVersion = bind(props.version, function (): void {
      lazyvstackUpdate(widget, props.count());
    });

    return function (): void {
      if (stopVersion) stopVersion();
      for (const stop of stops) stop();
      detachNode(node);
    };
  };
});

export type { PerryNode, PerryProps };
export { perryHooks } from "./node";

// ── application entry ─────────────────────────────────────────────────────

export interface AppProps {
  title: string;
  width: number;
  height: number;
  /** Paint the window body. Defaults to the viewer's dark background. */
  backgroundColor?: string;
}

/**
 * Mount a component tree as a Perry application window.
 *
 * This exists because `App({ body })` takes a native `Widget`, while every
 * component here returns a `Mountable` — a function. Passing the function
 * straight to `App` compiles, runs, and renders an EMPTY window, because nothing
 * ever mounted the tree. This helper is the one place that knows a host node has
 * to be created and the mountable invoked against it.
 */
export function mountApp(props: AppProps, root: Mountable<PerryNode>): void {
  const body = createNode("#root", props.backgroundColor !== undefined
    ? { backgroundColor: props.backgroundColor }
    : {});
  root(body, perryHooks);
  App({
    title: props.title,
    width: props.width,
    height: props.height,
    body: body.widget,
  });
}
