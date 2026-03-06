/**
 * HTML when component for SSR
 */
import { when as coreWhen, type WhenConfig, type Mountable } from '@rasenjs/core'
import { whenHostHooks } from '../host-hooks'
import type { StringHost } from '../types'

/**
 * when - conditional rendering for SSR
 */
export function when<Host extends StringHost = StringHost>(
  config: Omit<WhenConfig<Host>, keyof typeof whenHostHooks>
): Mountable<Host> {
  return coreWhen({
    ...config,
    ...whenHostHooks
  } as any)
}
