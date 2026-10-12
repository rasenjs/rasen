import { renderToString, div, p, ul, li } from '@rasenjs/html'

// No DOM and no reactive runtime required: the string host renders once.
const html = renderToString(
  div(
    { class: 'container' },
    p({ class: 'title' }, 'Hello from SSR!'),
    ul({ class: 'list' }, li('Item 1'), li('Item 2'), li('Item 3'))
  )
)

console.log(html)
// <div class="container"><p class="title">Hello from SSR!</p><ul class="list"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul></div>
