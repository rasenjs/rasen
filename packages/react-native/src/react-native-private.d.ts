/**
 * Type declarations for React Native private interface
 */

declare module 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface' {
  export interface ReactNativeViewConfigRegistry {
    get: (name: string) => {
      uiViewClassName: string
      validAttributes: Record<string, unknown>
      bubblingEventTypes?: Record<string, unknown>
      directEventTypes?: Record<string, unknown>
    }
  }

  export interface ReactNativePrivateInterface {
    ReactNativeViewConfigRegistry: ReactNativeViewConfigRegistry
    createPublicInstance: (
      tag: number,
      viewConfig: {
        uiViewClassName: string
        validAttributes: Record<string, unknown>
      },
      internalInstanceHandle: object
    ) => unknown
    createPublicTextInstance: (internalInstanceHandle: object) => unknown
    createAttributePayload: (
      props: Record<string, unknown>,
      validAttributes: Record<string, unknown>
    ) => Record<string, unknown>
    diffAttributePayloads: (
      oldProps: Record<string, unknown> | null,
      newProps: Record<string, unknown>,
      validAttributes: Record<string, unknown>
    ) => Record<string, unknown> | null
  }

  const ReactNativePrivateInterface: ReactNativePrivateInterface
  export default ReactNativePrivateInterface
}
