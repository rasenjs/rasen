/**
 * SSR entry point
 */
import { useReactiveRuntime } from '@rasenjs/reactive-vue'
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'
import { createApp } from './App'

// Setup reactive runtime for SSR (needed for com() wrapper)
useReactiveRuntime()

export function render(url: string) {
  const history = createMemoryHistory(url)
  const App = createApp(history)
  const appHtml = renderToString(App())
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rasen SSR Example</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
    .app { min-height: 100vh; display: flex; flex-direction: column; }
    .navbar { display: flex; gap: 1rem; padding: 1rem; background: #f5f5f5; border-bottom: 1px solid #ddd; }
    .nav-link { padding: 0.5rem 1rem; text-decoration: none; color: #333; border-radius: 4px; }
    .nav-link[data-active="true"] { background: #007bff; color: white; }
    .content { flex: 1; padding: 2rem; max-width: 800px; margin: 0 auto; }
    .footer { padding: 1rem; text-align: center; background: #f5f5f5; border-top: 1px solid #ddd; }
    h1 { margin-bottom: 1rem; }
    p { margin-bottom: 0.5rem; }
    ul { margin-left: 1.5rem; margin-top: 1rem; }
    li { margin-bottom: 0.5rem; }
    button { padding: 0.5rem 1rem; cursor: pointer; }
  </style>
  <script type="module" src="/src/client.ts"></script>
</head>
<body>
  <div id="app">${appHtml}</div>
</body>
</html>`
}
