/**
 * HostContext — 宿主上下文
 *
 * 组件挂载时通过 Mountable 的可选第二参数传入，由 com 托管其生命周期
 * （进入时覆盖、子组件继承、退出时还原）。
 *
 * 这是宿主的"共性槽位"：hooks 是第一种能力，未来可扩展
 * （环境变量、调试信息、数据层、主题等）。
 */

/**
 * 宿主操作钩子
 *
 * 结构性组件（each/when/match/fragment）需要宿主提供节点操作能力。
 * 不同宿主实现不同：
 *  - DOM：Comment 标记 + appendChild/insertBefore
 *  - HTML(SSR)：字符串拼接
 *  - React Native：Fabric 节点操作
 *  - WebGL/Canvas-2D：无需（注册绘制函数，非插入节点）
 */
export interface HostHooks<Host = unknown, Node = unknown> {
  /** 创建文本节点（host 用于获取 ownerDocument，支持 iframe） */
  createTextNode?: (host: Host, text: string) => Node
  /** 追加节点到宿主 */
  appendNode?: (host: Host, node: Node) => void
  /** 更新文本节点内容 */
  updateTextNode?: (node: Node, text: string) => void
  /** 移除节点 */
  removeNode?: (node: Node) => void
  /** 创建标记节点（用于定位，如 DOM 的 Comment） */
  createMarker?: (host: Host, content: string) => Node
  /** 追加标记节点 */
  appendMarker?: (host: Host, marker: Node) => void
  /** 在指定位置前插入节点 */
  insertBefore?: (host: Host, node: Node, before: Node | null) => void
  /** 移除标记节点 */
  removeMarker?: (marker: Node) => void
  /** 创建批量插入的片段 */
  createFragment?: (host: Host) => {
    host: Host
    flush: (host: Host, before: Node | null) => void
  }
}

/**
 * 宿主上下文
 *
 * 通过 Mountable 第二参数传入，由 com 托管：
 *  - 不传 = 继承父组件上下文（无需改变）
 *  - 传入 = 覆盖当前上下文（如 canvas 切换宿主能力）
 *  - com 退出时自动还原父上下文
 */
export interface HostContext<Host = unknown, Node = unknown> {
  /** 宿主操作钩子 */
  hooks?: HostHooks<Host, Node>
  // 未来扩展：env、debug、data layer、theme……
}