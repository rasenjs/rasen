/**
 * Rasen Code Snippets
 *
 * This module exports all code snippets as raw strings for use in:
 * - README files
 * - VitePress documentation
 * - Interactive Playground components
 *
 * Usage:
 *   import { counterDom, todoDom } from '@snippets'
 */

// Counter Examples
export { default as counterDom } from './counter-dom.ts?raw'
export { default as counterRn } from './counter-rn.ts?raw'

// Todo Examples
export { default as todoDom } from './todo-dom.ts?raw'

// Canvas Examples
export { default as canvasBasic } from './canvas-basic.ts?raw'
export { default as canvasAnimation } from './canvas-animation.ts?raw'

// Basic Examples
export { default as basicDom } from './basic-dom.ts?raw'

// SSR Examples
export { default as ssrHtml } from './ssr-html.ts?raw'

// JSX Examples
export { default as jsxCounter } from './jsx-counter.tsx?raw'
