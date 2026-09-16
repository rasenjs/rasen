/**
 * SSR entry point
 */
import { useReactiveRuntime } from '@rasenjs/reactive-signals'
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'
import { createApp } from './App'

// Install the signals runtime before anything reads a signal. The framework's
// built-in runtime only understands its own callable refs, so the adapter that
// knows about TC39 signals has to be registered first.
useReactiveRuntime()

// Import CSS content (in production, this would be extracted)
import styleContent from './style.css?inline'

export function render(url: string) {
  const history = createMemoryHistory(url)
  const appHtml = renderToString(createApp(history))
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/logo.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rasen App</title>
  <style>${styleContent}</style>
  <script type="module" src="/src/entry-client.tsx"></script>
</head>
<body>
  <div id="app">${appHtml}</div>
</body>
</html>`
}
