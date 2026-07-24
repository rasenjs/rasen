/**
 * Type declarations for React Native internal modules used by dependencies
 */

declare module 'react-native/Libraries/ReactPrivate/ReactNativePrivateInterface' {
  export type Props = Record<string, unknown>
  
  export const ReactNativeViewConfigRegistry: {
    get: (name: string) => {
      validAttributes: Record<string, unknown>
    }
  }
  
  export function createAttributePayload(
    props: Props,
    validAttributes: Record<string, unknown>
  ): Props
  
  const ReactNativePrivateInterface: {
    ReactNativeViewConfigRegistry: typeof ReactNativeViewConfigRegistry
    createAttributePayload: typeof createAttributePayload
  }
  
  export default ReactNativePrivateInterface
}
