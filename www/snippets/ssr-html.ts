import { renderToString, div, p, ul, li } from '@rasenjs/html'

// No reactive runtime needed for SSR!
const html = renderToString(
  div(
    { class: 'container' },
    p({ class: 'title' }, 'Hello from SSR!'),
    ul({ class: 'list' }, li('Item 1'), li('Item 2'), li('Item 3'))
  )
)

console.log(html)
// Output: <div class="container"><p class="title">Hello from SSR!</p><ul class="list"><li>Item 1</li>...</ul></div>
