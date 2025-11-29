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

## Full Page

```typescript
import { 
  renderToString, 
  html, head, body, title, meta, link, 
  div, h1, p 
} from '@rasenjs/html'

const page = renderToString(
  html(
    head(
      meta({ charset: 'utf-8' }),
      meta({ name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      title('My Page'),
      link({ rel: 'stylesheet', href: '/styles.css' })
    ),
    body(
      div(
        { class: 'app' },
        h1('Welcome'),
        p('Server-rendered content.')
      )
    )
  )
)

// Add doctype
const fullHtml = '<!DOCTYPE html>' + page
```

## Element Syntax

```typescript
// Props + children
div({ class: 'container', id: 'main' }, 'Content')

// Children only
p('Simple paragraph')

// Nested children
ul(
  li('Item 1'),
  li('Item 2'),
  li('Item 3')
)

// Self-closing
img({ src: '/logo.png', alt: 'Logo' })
br()
hr()
```

## Dynamic Content

Pass data to generate dynamic HTML:

```typescript
interface User {
  name: string
  email: string
}

function renderUserCard(user: User) {
  return renderToString(
    div(
      { class: 'user-card' },
      h2(user.name),
      p(user.email)
    )
  )
}

const users = await fetchUsers()
const cards = users.map(renderUserCard).join('')
```

## Lists

```typescript
const items = ['Apple', 'Banana', 'Cherry']

const list = renderToString(
  ul(
    { class: 'fruit-list' },
    ...items.map(item => li(item))
  )
)
```

## Express.js Example

```typescript
import express from 'express'
import { renderToString, html, head, body, title, div, h1 } from '@rasenjs/html'

const app = express()

app.get('/', (req, res) => {
  const page = '<!DOCTYPE html>' + renderToString(
    html(
      head(title('Home')),
      body(
        div(
          { class: 'container' },
          h1('Welcome!')
        )
      )
    )
  )
  
  res.send(page)
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
mount(App({ data }), document.getElementById('app'))
```

::: tip Future Feature
Automatic hydration support is planned for a future release.
:::
