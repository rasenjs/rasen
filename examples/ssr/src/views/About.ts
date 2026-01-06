import { div, h1, p, ul, li } from '@rasenjs/web'

export const AboutView = () => div(
  { class: 'about-view' },
  h1('About Rasen'),
  p('Rasen is a reactive rendering framework with isomorphic architecture.'),
  ul(
    li('✅ One codebase for SSR and client'),
    li('✅ Memory History for SSR'),
    li('✅ Automatic hydration'),
    li('✅ Type-safe routing')
  )
)
