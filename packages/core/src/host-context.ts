/**
 * N Hooks — 宿主能力集
 *
 * hooks 即上下文：由父级显式传递给 Mountable 的第二参数，
 * 无全局栈、无隐式注入。
 */

/**
 * 文本节点句柄
 *
 * createText 返回。node 供通用 insert/detach 使用；
 * update 承载文本独有的内容变更能力（标记等惰性节点无此需求，故不需要句柄）。
 */
export interface TextHandle<Node = unknown> {
  node: Node
  update: (v: string) => void
}

/**
 * 宿主操作钩子（统一造型）
 *
 * 结构性组件（each/when/match/fragment）需要宿主提供节点操作能力。
 * 所有成员可选：缺失时组件自动降级为"顺序追加"模式（无标记、无移动）。
 *
 * 三条造型原则：
 *  1. create* 只创建，一律返回游离节点——定位统一交给 insert
 *  2. insert 是唯一的定位原语（null = 追加），也用于移动已有节点
 *  3. 句柄只为携带节点特有能力（文本的 update），不重复通用操作
 *
 * 方法首参统一命名 parent——语义是「插入位置的父节点」，类型沿用 Node
 * （宿主与节点在同一类型空间：对 DOM 而言都是 Node，容器只是恰好有子节点的那个）。
 *
 * 序列契约（算法级硬约束）：
 *  标记与内容节点必须处于同一可遍历兄弟序列（nextSibling 游走路径是
 *  标记→内容→…→标记）。无法在内容序列中安插占位物的宿主
 *  （如每个子项都是真实原生控件的场景）不应提供 nextSibling，
 *  引擎会自动降级为顺序追加模式。
 *
 * 不同宿主实现不同：
 *  - DOM：Comment 标记 + insertBefore
 *  - HTML(SSR)：字符串标记 + chunk 拼接
 *  - React Native：Fabric 节点操作
 *  - WebGL/Canvas-2D：传空对象 {} 即可（全降级）
 */
export interface HostHooks<Node = unknown> {
  /**
   * 创建一个定位标记（DOM: Comment 节点；SSR: 字符串标记）。
   * 只创建不挂载——位置由随后的 insert 决定。
   * 水合模式下实现内部负责 claim 并校验已有节点。
   * `kind` 是标记内容字符串（如 'w'、'e'、'i'），宿主可自行映射。
   */
  createMarker?: (parent: Node, kind: string) => Node
  /**
   * 创建一个游离文本节点，返回句柄。
   * fragment 的文本子节点使用；canvas 等无文本概念可实现为空操作句柄。
   */
  createText?: (parent: Node, content: string) => TextHandle<Node>
  /** 在 ref 之前插入节点（ref 为 null 表示追加到末尾）。也可用于移动已有节点。 */
  insert?: (parent: Node, node: Node, ref: Node | null) => void
  /** 将节点从树上摘除 */
  detach?: (node: Node) => void
  /** 下一个兄弟节点（供标记区间遍历使用） */
  nextSibling?: (node: Node) => Node | null
  /**
   * 有界宿主：返回 host 的视图，使子树的所有"追加"都落在 marker 之前。
   * 用于 when/match 分支和 each 列表项的定位挂载。
   * DOM 实现为拦截 appendChild/insertBefore 的 Proxy；SSR 为子 chunk 写入器。
   */
  boundedHost?: (parent: Node, marker: Node) => Node
  /**
   * 批量插入优化提示。返回一个暂存宿主，在其上完成的挂载由 flush 一次性落位。
   * 缺省时引擎退化为逐个 insert。
   */
  batch?: (
    parent: Node
  ) => {
    parent: Node
    flush: (parent: Node, ref: Node | null) => void
  }
  /**
   * 区间批量摘除：一次性摘除 (start, end) 开区间内的所有节点（不含两端）。
   * DOM 实现优先走整段快速路径（区域覆盖宿主全部内容时等价于
   * textContent='' 的原生清空），否则退化为 Range.extractContents；
   * 缺省时引擎退化为 nextSibling 遍历 + 逐个 detach。
   * 用于 each 清空等批量卸载热路径——千行级清空时逐节点 removeChild
   * 的常数因子占主导。
   */
  extractRange?: (parent: Node, start: Node, end: Node) => void
}

// HostContext 概念已移除：hooks 即上下文，由父级显式传递给
// Mountable 的第二参数。未来扩展能力直接加入 HostHooks。
