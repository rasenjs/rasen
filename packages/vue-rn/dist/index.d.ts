export { computed, h, reactive, ref } from '@vue/runtime-core';
import { RNNode } from '@rasenjs/rn-dom';
export { RNDocument } from '@rasenjs/rn-dom';

/**
 * Vue 3 Custom Renderer for React Native Fabric
 *
 * Replaces @vue/runtime-dom's DOM backend with @rasenjs/rn-dom.
 */

interface VueRNMountable {
    mount(container: RNNode): void;
    unmount(): void;
    use(plugin: any, ...options: any[]): VueRNMountable;
}
declare function createApp(rootComponent: object): VueRNMountable;

export { type VueRNMountable, createApp };

export declare function useCssModule(name?: string): Record<string, unknown>;

/**
 * RN-compatible RouterLink for vue-router.
 *
 * Default: renders touchable View wrapping your slot content.
 * Plain text content is auto-wrapped in <Text>.
 *
 * Usage:
 *   <!-- Simple text link -->
 *   <RouterLink to="/">Home</RouterLink>
 *
 *   <!-- Custom template with active state -->
 *   <RouterLink v-slot="{ isActive }" to="/about" custom>
 *     <Text :style="{ color: isActive ? '#16c79a' : '#e0e0ee' }">About</Text>
 *   </RouterLink>
 */
export declare const RouterLink: import('vue').DefineComponent<{
    to: { type: (StringConstructor | ObjectConstructor)[]; required: true }
    replace: BooleanConstructor
    custom: BooleanConstructor
}>

// ── Vue template tag type declarations ──────────────────────────────────
// IDE IntelliSense for RN built-in elements in .vue <template>.
// TYPE-ONLY — RN tags are custom elements resolved by rn-dom at runtime.
//
// Imported automatically when your env.d.ts references the package:
//   /// <reference types="@rasenjs/vue-rn" />

import type { DefineComponent } from 'vue'

interface _RNEvent { nativeEvent: Record<string, unknown> }
interface _RNStyle { [key: string]: unknown }

declare module 'vue' {
  export interface GlobalComponents {
    View: DefineComponent<Record<string, unknown>>
    SafeAreaView: DefineComponent<Record<string, unknown>>
    Text: DefineComponent<Record<string, unknown>>
    Image: DefineComponent<Record<string, unknown>>
    TextInput: DefineComponent<Record<string, unknown>>
    AndroidTextInput: DefineComponent<Record<string, unknown>>
    ScrollView: DefineComponent<Record<string, unknown>>
    AndroidHorizontalScrollView: DefineComponent<Record<string, unknown>>
    ActivityIndicator: DefineComponent<Record<string, unknown>>
    ProgressBarAndroid: DefineComponent<Record<string, unknown>>
    Switch: DefineComponent<Record<string, unknown>>
    AndroidSwitch: DefineComponent<Record<string, unknown>>
    RefreshControl: DefineComponent<Record<string, unknown>>
    AndroidSwipeRefreshLayout: DefineComponent<Record<string, unknown>>
    Modal: DefineComponent<Record<string, unknown>>
    DrawerLayoutAndroid: DefineComponent<Record<string, unknown>>
    DebuggingOverlay: DefineComponent<Record<string, unknown>>
  }
}
