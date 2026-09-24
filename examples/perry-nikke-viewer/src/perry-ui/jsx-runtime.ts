/**
 * JSX runtime for the Perry UI layer.
 *
 * TSX in this directory compiles through Perry's JSX lowering, which emits
 * `jsx(type, props)` / `jsxs(type, props)` calls. Perry resolves those two ways
 * (`crates/perry-codegen/src/lower_call/extern_func.rs`):
 *
 *   * no local binding named `jsx`/`jsxs` → Perry's built-in `js_jsx` adapter,
 *     which renders to an HTML STRING (its hono/SSR path). Wrong for native
 *     widgets: the element becomes a string and nothing mounts.
 *   * the module IMPORTS `jsx`/`jsxs` → the imported implementation is called.
 *
 * That second arm is what this module supplies: every `.tsx` file imports
 * `jsx`/`jsxs` from here so Perry routes the calls into `@rasenjs/core`'s JSX
 * runtime, where an element is a `Mountable` — the same thing the function-call
 * form (`Stack({ ... })`) produces.
 *
 * ```tsx
 * import { jsx, jsxs } from "../perry-ui/jsx-runtime";
 * import { Stack, Text } from "../perry-ui/jsx-runtime";
 *
 * function Greeting(props: { name: string }) {
 *   return (
 *     <Stack direction="row" spacing={10}>
 *       <Text content={"hi " + props.name} />
 *     </Stack>
 *   );
 * }
 * ```
 *
 * The `import { jsx, jsxs }` line looks unused and is not: Perry's lowering
 * needs the binding to exist in the module. Removing it silently reverts that
 * file to the HTML adapter — see the note above.
 *
 * ── Only PascalCase is exported ───────────────────────────────────────────
 * `Stack`, not `stack`. Perry keeps a capitalised JSX name as a real reference
 * and turns a lowercase one into an HTML-ish string literal, so only the
 * capitalised spelling survives to the runtime — and a component that can be
 * written `<Stack>` should have exactly one name. The non-JSX helpers
 * (`mountApp`, `hostWidget`) stay on the `../perry-ui` barrel, which is where a
 * caller looking for a function rather than an element will go.
 */
import { jsx, jsxs, Fragment as coreFragment } from "@rasenjs/core";
import type { Mountable } from "@rasenjs/core";
import { each } from "@rasenjs/core/components";
import type { EachProps } from "@rasenjs/core/components";
import {
  stack,
  text,
  button,
  scroll,
  image,
  spacer,
  divider,
  rule,
  textField,
  virtualList,
} from "./components";
import type { PerryNode } from "./node";

export { jsx, jsxs };
export { jsx as jsxDEV };

/**
 * `Fragment` re-typed to this tree's node type.
 *
 * `@rasenjs/core`'s Fragment is `Mountable<unknown>` because core cannot know
 * what a host mounts into. A JSX child position here is `Mountable<PerryNode>`,
 * so the alias is what keeps `<Fragment>` usable without a cast at every site.
 */
export const Fragment = coreFragment as unknown as (props: {
  children?: unknown;
}) => Mountable<PerryNode>;

/**
 * `children` is widened to `unknown` on every alias below.
 *
 * The components type it as `Mountable<PerryNode>[]` because that is what their
 * implementation consumes, but JSX hands them whatever the element body was: a
 * single child, an array, `null` from a ternary, `false` from a guard. The
 * runtime already normalises all of those (`processChildren` in `@rasenjs/core`
 * flattens arrays and drops `null`/`undefined`/booleans), so the narrowing here
 * would only reject code that works. Every other prop keeps its real type.
 */
type JsxProps<T> = Omit<T, "children"> & { children?: unknown };

export const Stack = stack as unknown as (
  props: JsxProps<import("./components").StackProps>,
) => Mountable<PerryNode>;
export const Text = text as unknown as (
  props: JsxProps<import("./components").TextProps>,
) => Mountable<PerryNode>;
export const Button = button as unknown as (
  props: JsxProps<import("./components").ButtonProps>,
) => Mountable<PerryNode>;
export const Scroll = scroll as unknown as (
  props: JsxProps<import("./components").ScrollProps>,
) => Mountable<PerryNode>;
export const Image = image as unknown as (
  props: JsxProps<import("./components").ImageProps>,
) => Mountable<PerryNode>;
export const Spacer = spacer as unknown as (
  props: JsxProps<import("./components").SpacerProps>,
) => Mountable<PerryNode>;
export const Divider = divider as unknown as (
  props: JsxProps<import("./components").SpacerProps>,
) => Mountable<PerryNode>;
export const Rule = rule as unknown as (
  props: JsxProps<import("./components").RuleProps>,
) => Mountable<PerryNode>;
export const TextField = textField as unknown as (
  props: JsxProps<import("./components").TextFieldProps>,
) => Mountable<PerryNode>;
export const VirtualList = virtualList as unknown as (
  props: JsxProps<import("./components").VirtualListProps>,
) => Mountable<PerryNode>;

/**
 * `Each` — the list component.
 *
 * Lists are built with `Each`, never with `.map()`. A mapped array of elements
 * is a fresh batch of `Mountable`s on every render: nothing reconciles, every
 * item is torn down and rebuilt, and the resulting tree has no key to move.
 * `Each` diffs instead — it tracks an instance per item by object reference
 * (`WeakMap` inside `@rasenjs/core`'s `each`) and reorders the existing nodes.
 *
 * ── Why this wrapper exists ───────────────────────────────────────────────
 * `each` wants `children` to BE the render function:
 *
 * ```ts
 * each({ of: items, children: (item) => <Row item={item} /> })
 * ```
 *
 * JSX cannot deliver that. `@rasenjs/core`'s `processChildren` classifies a
 * function child as a mountable and collects it into an array, so
 * `<Each of={items}>{(item) => …}</Each>` arrives as `children: [fn]`. Passing
 * that through unchanged would hand `each` an array where it expects a
 * function. Unwrapping the single-element array here is the whole job of this
 * adapter; everything else is `each`'s own behaviour.
 *
 * ```tsx
 * <Each of={POSE_BUTTONS}>{(p) => <Pill label={p.label} />}</Each>
 * ```
 *
 * ── Items must be objects ─────────────────────────────────────────────────
 * Instance tracking is a `WeakMap` keyed on the item, so items have to be
 * objects: a `WeakMap` rejects a string or number key with a `TypeError`.
 * A list of labels is therefore `[{ label: "2b" }, …]`, not `["2b", …]` — the
 * same shape `src/smoke.ts` uses.
 *
 * The list is static here. For a reactive list pass a getter — `of={() => rows()}`
 * — and `Each` re-diffs whenever it re-reads.
 */
export function Each<T extends object>(
  props: Omit<EachProps<T, PerryNode>, "children"> & { children?: unknown },
): Mountable<PerryNode> {
  const raw = props.children;
  const render = (
    Array.isArray(raw) ? raw[0] : raw
  ) as (item: T, index: number) => Mountable<PerryNode>;
  return each<T, PerryNode>({ of: props.of, children: render });
}

/**
 * The component prop types, re-exported so a TSX file can annotate a helper
 * that builds one of these without reaching past the JSX entry point.
 */
export type {
  StackProps,
  TextProps,
  ButtonProps,
  ScrollProps,
  ImageProps,
  SpacerProps,
  RuleProps,
  TextFieldProps,
  VirtualListProps,
  StyleProps,
  AppProps,
} from "./components";

/** The node type components mount into — from the node layer, not `./components`. */
export type { PerryNode } from "./node";

/**
 * A view function: props in, `Mountable` out.
 *
 * Components written for this tree should return this type, which is what makes
 * `<Sidebar />` typecheck — `JSX.Element` is the same alias.
 */
export type Component<P = unknown> = (props: P) => Mountable<PerryNode>;

/**
 * TypeScript's view of the JSX in this tree.
 *
 * There is no `IntrinsicElements` on purpose. Every element is a PascalCase
 * component, so TypeScript checks it against the component's own props through
 * the exports above — stricter and less to keep in sync than a parallel tag
 * table. A lowercase tag (`<stack>`) is therefore a compile error, which also
 * matches what Perry does with it at runtime (`lower_jsx_element_name` treats a
 * lowercase name as an HTML-ish string literal).
 */
export namespace JSX {
  export type Element = Mountable<PerryNode>;

  export interface ElementChildrenAttribute {
    children: unknown;
  }

  export interface IntrinsicAttributes {
    key?: string | number;
  }
}
