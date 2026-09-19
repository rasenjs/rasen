/**
 * Element factories for the DOM target (browser / default condition).
 *
 * `@rasenjs/web/elements` is the routing-free half of this package: a
 * component library needs `div`, `span`, `button`, … and nothing else, so it
 * should not have to pull a router into its bundle to be isomorphic.
 */
export * from '@rasenjs/dom'
