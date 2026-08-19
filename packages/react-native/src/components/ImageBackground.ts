/**
 * ImageBackground — RN ImageBackground equivalent for Rasen.
 *
 * RN's ImageBackground is a pure JS composite component (no dedicated native
 * ViewManager):
 *   <View style={style}>
 *     <Image style={StyleSheet.absoluteFill} {...imageProps} />
 *     {children}
 *   </View>
 * rn-dom's Image forbids children, so the background image is an absolute-fill
 * Image with children layered on top. API matches RN.
 */

import type { Mountable } from '@rasenjs/core'
import type { RNNode } from '@rasenjs/rn-dom'
import { element, type Child } from '../element'

/** RN StyleSheet.absoluteFill. */
const absoluteFill = { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }

export interface ImageBackgroundProps {
  source?: unknown
  resizeMode?: string
  /** @platform ios */
  blurRadius?: number
  onLoadStart?: (e?: unknown) => void
  onLoad?: (e?: unknown) => void
  onLoadEnd?: (e?: unknown) => void
  onError?: (e?: unknown) => void
  tintColor?: string
  accessibilityLabel?: string
  testID?: string
  style?: Record<string, unknown> | Array<Record<string, unknown>> | (() => Record<string, unknown>)
  /** Extra style passed to the background Image. */
  imageStyle?: Record<string, unknown> | Array<Record<string, unknown>>
  children?: Child | Child[]
  [key: string]: unknown
}

export function ImageBackground(props: ImageBackgroundProps): Mountable<RNNode> {
  const {
    source,
    resizeMode,
    blurRadius,
    onLoadStart,
    onLoad,
    onLoadEnd,
    onError,
    tintColor,
    accessibilityLabel,
    testID,
    style,
    imageStyle,
    children,
    ...rest
  } = props

  return element('View', {
    ...rest,
    style,
    children: [
      element('Image', {
        source,
        resizeMode,
        blurRadius,
        onLoadStart,
        onLoad,
        onLoadEnd,
        onError,
        tintColor,
        accessibilityLabel,
        testID,
        style: [
          absoluteFill,
          ...(Array.isArray(imageStyle) ? imageStyle : imageStyle ? [imageStyle] : []),
        ],
      }),
      ...(Array.isArray(children) ? children : [children]),
    ],
  })
}