/**
 * React Native 渲染上下文
 *
 * 管理原生视图树的创建、更新和销毁
 * 直接调用 Fabric UIManager API
 */

import type {
  NativeHandle,
  FabricUIManager,
  RNHostContext,
  ChildSet
} from './types'

// 全局视图标签计数器
let nextTag = 1

/**
 * 生成唯一的视图标签
 */
export function generateTag(): number {
  return nextTag++
}

/**
 * 重置标签计数器（仅用于测试）
 */
export function resetTagCounter(): void {
  nextTag = 1
}

/**
 * Fabric UIManager 获取器
 * React Native 的 UIManager 是通过 NativeModules 暴露的
 */
let fabricUIManager: FabricUIManager | null = null

/**
 * 设置 Fabric UIManager
 * 需要在应用启动时调用
 */
export function setFabricUIManager(manager: FabricUIManager): void {
  fabricUIManager = manager
}

/**
 * 获取 Fabric UIManager
 */
export function getFabricUIManager(): FabricUIManager {
  if (!fabricUIManager) {
    // 尝试从 React Native 运行时获取
    try {
      // React Native 0.72+ 新架构
      // 使用动态导入来避免编译时依赖
      const globalRequire = (globalThis as unknown as { require?: (id: string) => unknown }).require
      const ReactNative = globalRequire?.('react-native') as {
        TurboModuleRegistry?: { get: (name: string) => unknown }
        UIManager?: LegacyUIManager
      } | undefined
      
      if (ReactNative?.TurboModuleRegistry) {
        const nativeFabric = ReactNative.TurboModuleRegistry.get('FabricUIManager')
        if (nativeFabric) {
          fabricUIManager = nativeFabric as FabricUIManager
        }
      }
      // 降级到旧的 UIManager
      if (!fabricUIManager && ReactNative?.UIManager) {
        fabricUIManager = createUIManagerAdapter(ReactNative.UIManager)
      }
    } catch {
      // 可能在非 RN 环境中运行
    }
  }

  if (!fabricUIManager) {
    throw new Error(
      'FabricUIManager not available. Please call setFabricUIManager() first or ensure React Native is properly initialized.'
    )
  }

  return fabricUIManager
}

/**
 * Legacy UIManager 接口
 */
interface LegacyUIManager {
  createView(tag: number, viewType: string, rootTag: number, props: Record<string, unknown>): void
  updateView(tag: number, viewType: string, props: Record<string, unknown>): void
  setChildren(tag: number, childTags: number[]): void
}

/**
 * 创建 UIManager 适配器
 * 将旧版 UIManager API 适配为 Fabric API
 */
function createUIManagerAdapter(legacyUIManager: LegacyUIManager): FabricUIManager {
  return {
    createNode(
      tag: number,
      viewType: string,
      rootTag: number,
      props: Record<string, unknown>,
      _instanceHandle: object
    ): NativeHandle {
      legacyUIManager.createView(
        tag,
        viewType,
        rootTag,
        flattenStyle(props)
      )
      return { _nativeTag: tag, _viewType: viewType }
    },

    cloneNodeWithNewProps(
      node: NativeHandle,
      newProps: Record<string, unknown>
    ): NativeHandle {
      legacyUIManager.updateView(
        node._nativeTag,
        node._viewType,
        flattenStyle(newProps)
      )
      return node
    },

    cloneNodeWithNewChildren(node: NativeHandle): NativeHandle {
      return node
    },

    appendChild(parent: NativeHandle, child: NativeHandle): void {
      legacyUIManager.setChildren(parent._nativeTag, [child._nativeTag])
    },

    createChildSet(_rootTag: number): ChildSet {
      return { _children: [] }
    },

    appendChildToSet(childSet: ChildSet, child: NativeHandle): void {
      ;(childSet._children as NativeHandle[]).push(child)
    },

    completeRoot(rootTag: number, childSet: ChildSet): void {
      const childTags = childSet._children.map((c) => c._nativeTag)
      legacyUIManager.setChildren(rootTag, childTags)
    },

    getRootHostContext(rootTag: number) {
      return { rootTag }
    }
  }
}

/**
 * 扁平化样式对象
 */
function flattenStyle(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...props }

  if (props.style && typeof props.style === 'object') {
    const style = props.style as Record<string, unknown>
    for (const [key, value] of Object.entries(style)) {
      result[key] = value
    }
    delete result.style
  }

  return result
}

/**
 * 渲染上下文实现
 */
export class RNRenderContext implements RNHostContext {
  private children: NativeHandle[] = []
  private uiManagerInstance: FabricUIManager

  constructor(
    public readonly parentHandle: NativeHandle | null,
    public readonly rootTag: number
  ) {
    this.uiManagerInstance = getFabricUIManager()
  }

  get uiManager(): FabricUIManager {
    return this.uiManagerInstance
  }

  /**
   * 创建原生视图
   */
  createView(viewType: string, props: Record<string, unknown>): NativeHandle {
    const tag = generateTag()
    const handle = this.uiManagerInstance.createNode(
      tag,
      viewType,
      this.rootTag,
      flattenStyle(props),
      {} // instanceHandle
    )
    return handle
  }

  /**
   * 追加子视图
   */
  appendChild(child: NativeHandle): void {
    this.children.push(child)

    if (this.parentHandle) {
      this.uiManagerInstance.appendChild(this.parentHandle, child)
    }
  }

  /**
   * 移除子视图
   */
  removeChild(child: NativeHandle): void {
    const index = this.children.findIndex(
      (c) => c._nativeTag === child._nativeTag
    )
    if (index !== -1) {
      this.children.splice(index, 1)
    }

    // 在 Fabric 中，移除是通过重新设置子节点集合实现的
    if (this.parentHandle) {
      const childSet = this.uiManagerInstance.createChildSet(this.rootTag)
      for (const c of this.children) {
        this.uiManagerInstance.appendChildToSet(childSet, c)
      }
      // 注意：这需要更新父节点的子节点列表
      // 在实际实现中可能需要更复杂的处理
    }
  }

  /**
   * 更新视图属性
   */
  updateProps(handle: NativeHandle, props: Record<string, unknown>): void {
    this.uiManagerInstance.cloneNodeWithNewProps(handle, flattenStyle(props))
  }

  /**
   * 创建子上下文
   */
  createChildContext(parentHandle: NativeHandle): RNRenderContext {
    return new RNRenderContext(parentHandle, this.rootTag)
  }

  /**
   * 提交所有子视图到根节点
   */
  commitToRoot(): void {
    const childSet = this.uiManagerInstance.createChildSet(this.rootTag)
    for (const child of this.children) {
      this.uiManagerInstance.appendChildToSet(childSet, child)
    }
    this.uiManagerInstance.completeRoot(this.rootTag, childSet)
  }

  /**
   * 获取所有子视图
   */
  getChildren(): NativeHandle[] {
    return [...this.children]
  }
}

/**
 * 根上下文存储
 */
const rootContextMap = new Map<number, RNRenderContext>()

/**
 * 创建根渲染上下文
 */
export function createRootContext(rootTag: number): RNRenderContext {
  const context = new RNRenderContext(null, rootTag)
  rootContextMap.set(rootTag, context)
  return context
}

/**
 * 获取根渲染上下文
 */
export function getRootContext(rootTag: number): RNRenderContext | undefined {
  return rootContextMap.get(rootTag)
}

/**
 * 移除根渲染上下文
 */
export function removeRootContext(rootTag: number): void {
  rootContextMap.delete(rootTag)
}
