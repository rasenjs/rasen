/**
 * React Native Render Context
 *
 * RenderContext 包含了渲染所需的一切：
 * - hostConfig: ReactNativePrivateInterface
 * - rootTag: 根视图标签
 * - hostContext: 当前宿主上下文
 *
 * mount() 函数接收 hostConfig 和 rootTag，创建 RenderContext 并传递给组件。
 */

// ============================================================================
// Types
// ============================================================================

export type Node = unknown
export type Container = number
export type ChildSet = unknown
export type UpdatePayload = Record<string, unknown> | null
export type Props = Record<string, unknown>

export interface ViewConfig {
  uiViewClassName: string
  validAttributes: Record<string, unknown>
  bubblingEventTypes?: Record<string, unknown>
  directEventTypes?: Record<string, unknown>
}

export interface Instance {
  node: Node
  canonical: {
    nativeTag: number
    viewConfig: ViewConfig
    currentProps: Props
    internalInstanceHandle: object
    publicInstance: unknown
  }
  parentTag?: number // 父节点的 nativeTag，用于事件冒泡
}

export interface TextInstance {
  node: Node
  publicInstance?: unknown
  parentTag?: number // 父节点的 nativeTag
}

export interface HostContext {
  isInAParentText: boolean
}

// ============================================================================
// HostConfig Interface
// ============================================================================

export interface HostConfig {
  ReactNativeViewConfigRegistry: {
    get: (name: string) => ViewConfig
  }
  createPublicInstance: (
    tag: number,
    viewConfig: ViewConfig,
    internalInstanceHandle: object
  ) => unknown
  createPublicTextInstance: (internalInstanceHandle: object) => unknown
  createAttributePayload: (
    props: Props,
    validAttributes: Record<string, unknown>
  ) => Props
  diffAttributePayloads: (
    oldProps: Props | null,
    newProps: Props,
    validAttributes: Record<string, unknown>
  ) => Props | null
}

// ============================================================================
// Render Context
// ============================================================================

export interface RenderContext {
  hostConfig: HostConfig
  rootTag: Container
  hostContext: HostContext
}

// ============================================================================
// Fabric UI Manager
// ============================================================================

interface FabricUIManager {
  createNode: (
    reactTag: number,
    viewName: string,
    rootTag: number,
    props: Props,
    instanceHandle: object
  ) => Node
  cloneNodeWithNewProps: (node: Node, newProps: Props) => Node
  createChildSet: (rootTag: number) => ChildSet
  appendChild: (parentNode: Node, child: Node) => Node
  appendChildToSet: (childSet: ChildSet, child: Node) => void
  completeRoot: (rootTag: number, childSet: ChildSet) => void
  registerEventHandler?: (
    dispatchEvent: (
      instanceHandle: object,
      type: string,
      payload: Record<string, unknown>
    ) => void
  ) => void
}

function getFabricUIManager(): FabricUIManager {
  const g = globalThis as { nativeFabricUIManager?: FabricUIManager }
  if (!g.nativeFabricUIManager) {
    throw new Error('[Rasen] nativeFabricUIManager not available')
  }
  return g.nativeFabricUIManager
}

// ============================================================================
// Event Management
// ============================================================================

// 使用全局标志确保只注册一次（即使模块被重新加载）
const RASEN_EVENT_HANDLER_KEY = '__RASEN_EVENT_HANDLER_REGISTERED__'
const RASEN_INSTANCE_MAP_KEY = '__RASEN_INSTANCE_MAP__'

// 获取全局 instance 映射表（tag -> Instance）
export function getInstanceMap(): Map<number, Instance> {
  const g = globalThis as Record<string, unknown>
  if (!g[RASEN_INSTANCE_MAP_KEY]) {
    g[RASEN_INSTANCE_MAP_KEY] = new Map<number, Instance>()
  }
  return g[RASEN_INSTANCE_MAP_KEY] as Map<number, Instance>
}

/**
 * 注册 instance 到全局映射
 */
export function registerInstance(tag: number, instance: Instance): void {
  getInstanceMap().set(tag, instance)
}

/**
 * 注销 instance
 */
export function unregisterInstance(tag: number): void {
  getInstanceMap().delete(tag)
}

/**
 * 获取 instance 的父节点 tag
 */
export function getParentTag(
  instance: Instance | TextInstance
): number | undefined {
  return instance.parentTag
}

/**
 * 事件分发函数 - 实现事件冒泡
 *
 * 类似 React Fiber 的 traverseTwoPhase，但只实现 bubble 阶段
 */
function dispatchEventWithBubble(
  _instanceHandle: object,
  type: string,
  nativeEvent: Record<string, unknown>
): void {
  const target = nativeEvent?.target as number | undefined
  if (!target) return

  const instanceMap = getInstanceMap()
  let currentTag: number | undefined = target

  // 向上冒泡查找事件处理器（类似 React 的 traverseTwoPhase）
  while (currentTag !== undefined) {
    const instance = instanceMap.get(currentTag)

    if (!instance) break

    const props = instance.canonical?.currentProps
    if (props) {
      // 转换事件名（如 topTouchEnd -> onTouchEnd）
      const propName = 'on' + type.replace(/^top/, '')
      const handler = props[propName]

      if (typeof handler === 'function') {
        ;(handler as (event: Record<string, unknown>) => void)(nativeEvent)
        return // 事件已处理，停止冒泡
      }
    }

    // 继续向上冒泡
    currentTag = instance.parentTag
  }
}

/**
 * 初始化事件系统
 *
 * 调用 nativeFabricUIManager.registerEventHandler 注册事件处理器
 */
export function initEventSystem(): void {
  const g = globalThis as Record<string, unknown>

  // 严格检查 - 如果已经注册过，直接返回
  if (g[RASEN_EVENT_HANDLER_KEY] === true) {
    return
  }

  const fabricUIManager = getFabricUIManager()

  if (fabricUIManager.registerEventHandler) {
    fabricUIManager.registerEventHandler(dispatchEventWithBubble)
    g[RASEN_EVENT_HANDLER_KEY] = true
  } else {
    console.warn('[Rasen] registerEventHandler not available')
  }
}

/**
 * @deprecated 使用 initEventSystem 代替
 */
export function initEventListener(_hostConfig: HostConfig): void {
  initEventSystem()
}

// ============================================================================
// Tag Counter
// ============================================================================

let nextReactTag = 2

function allocateTag(): number {
  const tag = nextReactTag
  nextReactTag += 2
  return tag
}

export function resetTagCounter(): void {
  nextReactTag = 2
}

// ============================================================================
// Context Helpers
// ============================================================================

export function createRenderContext(
  hostConfig: HostConfig,
  rootTag: Container
): RenderContext {
  // 初始化事件监听
  initEventListener(hostConfig)

  return {
    hostConfig,
    rootTag,
    hostContext: { isInAParentText: false }
  }
}

export function getChildContext(
  ctx: RenderContext,
  type: string
): RenderContext {
  const isInAParentText =
    type === 'AndroidTextInput' ||
    type === 'RCTMultilineTextInputView' ||
    type === 'RCTSinglelineTextInputView' ||
    type === 'RCTText' ||
    type === 'RCTVirtualText'

  if (ctx.hostContext.isInAParentText !== isInAParentText) {
    return { ...ctx, hostContext: { isInAParentText } }
  }
  return ctx
}

// ============================================================================
// HostConfig Methods
// ============================================================================

export function createInstance(
  ctx: RenderContext,
  type: string,
  props: Props
): Instance {
  const { hostConfig, rootTag } = ctx
  const fabricUIManager = getFabricUIManager()

  const tag = allocateTag()
  const viewConfig = hostConfig.ReactNativeViewConfigRegistry.get(type)
  const updatePayload = hostConfig.createAttributePayload(
    props,
    viewConfig.validAttributes
  )

  const instanceHandle = { tag: 5, stateNode: null as unknown }

  const node = fabricUIManager.createNode(
    tag,
    viewConfig.uiViewClassName,
    rootTag,
    updatePayload,
    instanceHandle
  )

  const publicInstance = hostConfig.createPublicInstance(
    tag,
    viewConfig,
    instanceHandle
  )

  const instance: Instance = {
    node,
    canonical: {
      nativeTag: tag,
      viewConfig,
      currentProps: props,
      internalInstanceHandle: instanceHandle,
      publicInstance
    }
  }

  // 注册 instance 到全局映射，用于事件分发
  registerInstance(tag, instance)

  instanceHandle.stateNode = instance
  return instance
}

export function createTextInstance(
  ctx: RenderContext,
  text: string
): TextInstance {
  const { rootTag, hostContext } = ctx
  const fabricUIManager = getFabricUIManager()

  if (!hostContext.isInAParentText) {
    console.warn(
      '[Rasen] Text strings must be rendered within a <Text> component.'
    )
  }

  const tag = allocateTag()
  const instanceHandle = { tag: 6, stateNode: null as unknown }

  const node = fabricUIManager.createNode(
    tag,
    'RCTRawText',
    rootTag,
    { text },
    instanceHandle
  )

  const textInstance: TextInstance = { node }
  instanceHandle.stateNode = textInstance
  return textInstance
}

export function appendChild(
  parent: Instance,
  child: Instance | TextInstance
): void {
  // 设置父子关系，用于事件冒泡
  child.parentTag = parent.canonical.nativeTag
  getFabricUIManager().appendChild(parent.node, child.node)
}

export function removeChild(
  parent: Instance,
  child: Instance | TextInstance
): void {
  // 如果有 removeChild 方法，调用它
  const uiManager = getFabricUIManager() as unknown as Record<string, unknown>
  if (typeof uiManager['removeChild'] === 'function') {
    ;(uiManager['removeChild'] as (parentNode: Node, child: Node) => void)(
      parent.node,
      child.node
    )
  }

  // 从事件映射中移除
  if ('canonical' in child) {
    unregisterInstance((child as Instance).canonical.nativeTag)
  }

  // 清除父子关系
  child.parentTag = undefined
}

export function commitUpdate(
  instance: Instance,
  updatePayload: UpdatePayload,
  newProps: Props
): void {
  if (!updatePayload) return

  const uiManager = getFabricUIManager()
  const mgr = uiManager as unknown as Record<string, unknown>

  // 使用 setNativeProps 直接更新（Fabric）
  if (typeof mgr['setNativeProps'] === 'function') {
    const setNativeProps = mgr['setNativeProps'] as (
      node: Node,
      props: Props
    ) => void
    setNativeProps(instance.node, updatePayload)
  }

  // 更新内部状态
  instance.node = uiManager.cloneNodeWithNewProps(instance.node, updatePayload)
  instance.canonical.currentProps = newProps
}

export function commitTextUpdate(
  textInstance: TextInstance,
  newText: string
): void {
  const uiManager = getFabricUIManager()
  const mgr = uiManager as unknown as Record<string, unknown>

  // 使用 setNativeProps 直接更新文本（Fabric）
  if (typeof mgr['setNativeProps'] === 'function') {
    const setNativeProps = mgr['setNativeProps'] as (
      node: Node,
      props: Props
    ) => void
    setNativeProps(textInstance.node, { text: newText })
  }

  // 更新内部状态
  textInstance.node = uiManager.cloneNodeWithNewProps(textInstance.node, {
    text: newText
  })
}

// ============================================================================
// Container Operations
// ============================================================================

export function createChildSet(rootTag: Container): ChildSet {
  return getFabricUIManager().createChildSet(rootTag)
}

export function appendChildToSet(
  childSet: ChildSet,
  child: Instance | TextInstance
): void {
  getFabricUIManager().appendChildToSet(childSet, child.node)
}

export function completeRoot(rootTag: Container, childSet: ChildSet): void {
  getFabricUIManager().completeRoot(rootTag, childSet)
}

export function mountToContainer(
  rootTag: Container,
  ...instances: (Instance | TextInstance)[]
): void {
  const childSet = createChildSet(rootTag)
  for (const instance of instances) {
    appendChildToSet(childSet, instance)
  }
  completeRoot(rootTag, childSet)
}
