# HTML Rendering (SSR/SSG)

Server-side rendering and static site generation with `@rasenjs/html`.

## Overview

The HTML package renders components to strings — perfect for servers:

```typescript
import { renderToString, div, p, h1 } from '@rasenjs/html'

const html = renderToString(
  div(
    h1('Hello Server!'),
    p('This was rendered on the server.')
  )
)
```

## No Reactive Runtime Needed

Unlike client-side rendering, SSR doesn't need reactivity:

```typescript
// Works without setReactiveRuntime()!
import { renderToString, div, p } from '@rasenjs/html'

const html = renderToString(div(p('Static content')))
```

## Basic Usage

```typescript
import { renderToString, div, p, ul, li, a } from '@rasenjs/html'

const page = renderToString(
  div(
    { class: 'container' },
    p({ class: 'intro' }, 'Welcome to my site!'),
    ul(
      { class: 'nav' },
      li(a({ href: '/' }, 'Home')),
      li(a({ href: '/about' }, 'About')),
      li(a({ href: '/contact' }, 'Contact'))
    )
  )
)

console.log(page)
// <div class="container"><p class="intro">Welcome to my site!</p>...</div>
```

## Document shell

`@rasenjs/html` renders the *content* elements. There are no `html` / `head` /
`body` / `title` / `meta` / `link` exports, because the document shell is not a
component tree — it is a string, assembled once per response:

```typescript
import { renderToString } from '@rasenjs/html'

const appHtml = renderToString(App())

const page = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Page</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <div id="app">${appHtml}</div>
  </body>
</html>`
```

If a shell tag really has to come from the component tree, the generic factory
takes any tag name:

```typescript
import { element } from '@rasenjs/html'

// <title>My Page</title>
element({ tag: 'title', children: 'My Page' })
```

## Express.js example

```typescript
import express from 'express'
import { renderToString, div, h1, p } from '@rasenjs/html'

const app = express()

app.get('/', (_req, res) => {
  const appHtml = renderToString(
    div({ class: 'container' }, h1('Welcome!'), p('Server-rendered.'))
  )

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Home</title></head>
  <body><div id="app">${appHtml}</div></body>
</html>`)
})

app.listen(3000)
```

## Utilities

```typescript
import { escapeHtml, escapeAttr, isVoidElement } from '@rasenjs/html'

// Escape HTML content
escapeHtml('<script>alert("xss")</script>')
// &lt;script&gt;alert("xss")&lt;/script&gt;

// Check void elements
isVoidElement('img')   // true
isVoidElement('div')   // false
```

## Hydration

For client-side hydration, render the same component tree:

```typescript
// Server
const html = renderToString(App({ data }))

// Client  
import { mount } from '@rasenjs/dom'
mount(App({ data }), document.getElementById('app')!)
```

::: tip Future Feature
Automatic hydration support is planned for a future release.
:::
