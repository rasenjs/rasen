/**
 * Global type declarations for Fabric UIManager
 */

export type FabricNode = unknown
export type ChildSet = unknown
export type Props = Record<string, unknown>

export interface FabricUIManager {
  createNode: (
    reactTag: number,
    viewName: string,
    rootTag: number,
    props: Props,
    instanceHandle: object
  ) => FabricNode
  cloneNode: (node: FabricNode) => FabricNode
  cloneNodeWithNewProps: (node: FabricNode, newProps: Props) => FabricNode
  cloneNodeWithNewChildren: (node: FabricNode, childSet: ChildSet) => FabricNode
  cloneNodeWithNewChildrenAndProps: (node: FabricNode, childSet: ChildSet, newProps: Props) => FabricNode
  appendChild: (parentNode: FabricNode, child: FabricNode) => FabricNode
  createChildSet: () => ChildSet
  appendChildToSet: (childSet: ChildSet, child: FabricNode) => void
  completeRoot: (rootTag: number, childSet: ChildSet) => void
  registerEventHandler?: (
    dispatchEvent: (
      instanceHandle: object,
      type: string,
      payload: Record<string, unknown>
    ) => void
  ) => void
  removeChild?: (parentNode: FabricNode, child: FabricNode) => void
  setNativeProps?: (node: FabricNode, props: Props) => void
}

declare global {
  // eslint-disable-next-line no-var
  var nativeFabricUIManager: FabricUIManager | undefined
}
