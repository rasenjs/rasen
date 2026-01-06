import { div, h1, p } from '@rasenjs/web'

export const HomeView = () => div(
  { class: 'home-view' },
  h1('Welcome to Rasen SSR'),
  p('This page is rendered on the server and hydrated on the client.'),
  p('Try navigating using the links above - the same code runs on both sides!')
)
