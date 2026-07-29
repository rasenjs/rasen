/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'

// Augment React types so our Mountable-based components pass JSX checks
declare global {
  namespace React {
    // Make Mountable compatible with ReactNode
    type ReactNode = Mountable<any> | string | number | boolean | null | undefined
  }
}

declare var React: {
  createElement: (type: any, props: any, ...children: any[]) => Mountable<RNNode>
  Fragment: any
}
