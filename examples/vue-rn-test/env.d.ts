/// <reference path="node_modules/@rasenjs/vue-rn/tags.d.ts" />

/**
 * Type declarations for .vue SFC files.
 * Allows TypeScript to import *.vue modules without errors.
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
