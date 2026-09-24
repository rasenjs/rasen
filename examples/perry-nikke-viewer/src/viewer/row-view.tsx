/**
 * The catalogue row, written as TSX.
 *
 * This is the first block of the viewer's UI moved from nested `stack({...})`
 * object literals to JSX, and it is deliberately the one with the most shape:
 * a conditional indent marker, a conditional thumbnail slot, a two-line label
 * and a trailing spacer — so it exercises single children, arrays, conditionals
 * and a component several levels deep.
 *
 * ## Why the `jsx` import looks unused
 *
 * Perry's JSX lowering emits a call to `jsx`/`jsxs` and resolves it against
 * whatever binding the module has (`hasextern` guard in
 * `crates/perry-codegen/src/lower_call/extern_func.rs`). With no binding the
 * call lands in Perry's built-in adapter, which renders an HTML STRING — the
 * element never mounts. Importing these two names is what routes the element
 * into `@rasenjs/core`'s runtime, where it becomes a `Mountable` like any other
 * component. Removing the import silently breaks every element in this file.
 *
 * Verified equivalent to the call form by `src/tsxcheck.tsx` (both forms mount
 * to the same tree shape).
 */
import { jsx, jsxs } from "../perry-ui/jsx-runtime";
import {
  Stack,
  Text,
  Image,
  Spacer,
  Rule,
} from "../perry-ui/jsx-runtime";
import { N, SURFACE, TEXT } from "./theme";

/**
 * One row of the catalogue list.
 *
 * Structurally identical to app.tsx's `DisplayRow`; duplicated rather than
 * imported because app.tsx is the composition root and importing from it here
 * would make the two modules circular. If this file is extracted further, the
 * type should move to a shared module and both sides should import it.
 */
export interface RowViewData {
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

/** The row's own background: selected wins, then the group tint. */
function rowBackground(row: RowViewData): string {
  if (row.active) return SURFACE.rowActive;
  return row.kind === "group" ? SURFACE.rowGroup : SURFACE.row;
}

/**
 * One catalogue row: thumbnail, name over id, then a trailing tag.
 *
 * Built with plain values — the virtual list rebuilds rows on a version change
 * rather than subscribing per row, so a prop written as a function here would
 * be re-evaluated every frame for every realized row.
 */
export function RowView(props: {
  row: RowViewData;
  rowHeight: number;
  onPress: (row: RowViewData) => void;
}): ReturnType<typeof Stack> {
  const row = props.row;
  const h = props.rowHeight;
  return (
    <Stack
      direction="row"
      spacing={10}
      height={h}
      padding={6}
      cornerRadius={8}
      backgroundColor={rowBackground(row)}
      onPress={() => props.onPress(row)}
    >
      {row.depth > 0 ? (
        // The variant indent marker: `ml-6 pl-3 border-l border-white/10`.
        <Stack direction="row" spacing={0} width={13}>
          <Rule height={h - 16} color={SURFACE.indentRule} />
        </Stack>
      ) : null}

      {row.thumb ? (
        <Stack
          direction="row"
          spacing={0}
          width={36}
          height={36}
          cornerRadius={18}
          backgroundColor={SURFACE.chipOnPanel}
        >
          <Image url={row.thumb} width={36} height={36} cornerRadius={18} />
        </Stack>
      ) : (
        // No thumbnail yet (an unexpanded group): keep the label aligned by
        // reserving the same slot.
        <Stack
          direction="row"
          spacing={0}
          width={36}
          height={36}
          cornerRadius={18}
          backgroundColor={SURFACE.chipOnPanelHover}
        />
      )}

      <Stack direction="column" spacing={0}>
        <Text
          content={row.name}
          fontSize={TEXT.body}
          color={row.active ? N.s100 : N.s200}
        />
        <Text
          content={row.sub}
          fontSize={TEXT.small}
          color={row.active ? N.s300 : N.s500}
        />
      </Stack>

      <Spacer />
    </Stack>
  );
}
