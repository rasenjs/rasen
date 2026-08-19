/**
 * StatusBar — RN StatusBar equivalent for Rasen.
 *
 * RN's StatusBar is a configurator component backed by a static stack API
 * (pushStackEntry / replaceStackEntry / popStackEntry). As a Rasen component
 * it pushes an entry on mount and pops it on unmount, rendering no node.
 */

import { StatusBar as RNStatusBar } from 'react-native'
import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'

export interface StatusBarProps {
  animated?: boolean
  backgroundColor?: string
  barStyle?: 'default' | 'light-content' | 'dark-content'
  hidden?: boolean
  translucent?: boolean
  networkActivityIndicatorVisible?: boolean
  showHideTransition?: 'fade' | 'slide' | 'none'
  [key: string]: unknown
}

export function StatusBar(props: StatusBarProps): Mountable<RNNode> {
  return () => {
    const entry = RNStatusBar.pushStackEntry(props)
    return () => {
      RNStatusBar.popStackEntry(entry)
    }
  }
}