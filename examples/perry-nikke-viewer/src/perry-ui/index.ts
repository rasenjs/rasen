/**
 * The Perry UI layer, as consumed by the viewer.
 *
 * Kept as an explicit barrel rather than a package: everything under
 * `src/perry-ui/` is the candidate for extraction into a `@rasenjs/perry`
 * binding, and this file is the seam that extraction would move.
 */
export {
  createNode,
  wrapWidget,
  insertNode,
  detachNode,
  appendChild,
  patchProps,
  applyProps,
  setNodeContent,
  parseHex,
  perryHooks,
  reorderChild,
  type PerryNode,
  type PerryKind,
  type PerryProps,
} from "./node";

export {
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
  hostWidget,
  mountApp,
  type StackProps,
  type TextProps,
  type ButtonProps,
  type ScrollProps,
  type ImageProps,
  type SpacerProps,
  type RuleProps,
  type TextFieldProps,
  type VirtualListProps,
  type StyleProps,
  type AppProps,
} from "./components";
