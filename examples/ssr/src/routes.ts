/**
 * Shared route definitions
 * Works identically in SSR and client
 */
import { route, tpl } from '@rasenjs/router'
import { z } from 'zod'

export const routes = {
  home: route('/'),
  about: route('/about'),
  user: tpl`/user/${{ id: z.string() }}`
}
