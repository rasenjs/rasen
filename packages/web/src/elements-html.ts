/**
 * Element factories for the SSR target (the `node` condition).
 *
 * Same surface as `./elements`, resolved to the string renderer instead of the
 * DOM one. A component written against `@rasenjs/web/elements` therefore
 * renders markup on the server and real elements in the browser without
 * knowing which is which.
 */
export * from '@rasenjs/html'
