/**
 * Runtime arm of `@rasenjs/react-native`'s `jsx-runtime` subpath.
 *
 * The Rasen RN pipeline eliminates JSX in Babel (`src/babel/index.ts` runs
 * `eliminateJsxFromFile`), so a compiled module contains no JSX and emits no
 * `react/jsx-runtime` import at all. This module exists for the two cases that
 * still resolve it: Metro's redirect of `react/jsx-runtime` (see `src/metro`),
 * and a project that has not added the rasen Babel plugin yet. Importing is
 * harmless; calling reports the fix.
 */
export {
  jsx,
  jsxs,
  jsxDEV,
  NO_JSX_RUNTIME_MESSAGE,
} from '@rasenjs/core/jsx-runtime-stub'
