/// <reference types="@rasenjs/jsx-runtime/jsx" />

/**
 * SSR entry point
 */
import { configureTags } from '@rasenjs/jsx-runtime'
import * as htmlTags from '@rasenjs/html'
import { createMemoryHistory } from '@rasenjs/router'
import { renderToString } from '@rasenjs/html'
import { createApp } from './App'

// Configure JSX to use HTML components for SSR
configureTags({ '': htmlTags })

// Import CSS content (in production, this would be extracted)
import styleContent from './style.css?inline'

export function render(url: string) {
  const history = createMemoryHistory(url)
  const App = createApp(history)
  const appHtml = renderToString(App())
  
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
