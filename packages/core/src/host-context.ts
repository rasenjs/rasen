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
 * 与旧造型的对应关系：
 *  - createMarker + appendMarker 合并 → createMarker（创建游离标记）
 *  - insertBefore               → insert
 *  - removeNode + removeMarker  → detach
 *  - createTextNode + appendNode + updateTextNode → createText（返回 TextHandle）
 *  - createFragment             → batch
 *  - 新增 nextSibling（区间遍历）、boundedHost（有界宿主视图）
 *
 * 序列契约（算法级硬约束）：
 *  标记与内容节点必须处于同一可遍历兄弟序列（nextSibling 游走路径是
 *  标记→内容→…→标记）。无法在内容序列中安插占位物的宿主
 *  （如每个子项都是真实原生控件的场景）不应提供 nextSibling，
 *  引擎会自动降级为顺序追加模式。
 *
 * 不同宿主实现不同：
 *  - DOM：Comment 标记 + insertBefore；boundedHost 用 Proxy 重定向追加
 *  - HTML(SSR)：字符串标记 + chunk 拼接
 *  - React Native：Fabric 节点操作
 *  - WebGL/Canvas-2D：传空对象 {} 即可（全降级）
 */
export interface HostHooks<Host = unknown, Node = unknown> {
  /**
   * 创建一个定位标记（DOM: Comment 节点；SSR: 字符串标记）。
   * 只创建不挂载——位置由随后的 insert 决定。
   * 水合模式下实现内部负责 claim 并校验已有节点。
   * `kind` 是标记内容字符串（如 'w'、'e'、'i'），宿主可自行映射。
   */
  createMarker?: (host: Host, kind: string) => Node
  /**
   * 创建一个游离文本节点，返回句柄。
   * fragment 的文本子节点使用；canvas 等无文本概念可实现为空操作句柄。
   */
  createText?: (host: Host, content: string) => TextHandle<Node>
  /** 在 ref 之前插入节点（ref 为 null 表示追加到末尾）。也可用于移动已有节点。 */
  insert?: (host: Host, node: Node, ref: Node | null) => void
  /** 将节点从树上摘除 */
  detach?: (node: Node) => void
  /** 下一个兄弟节点（供标记区间遍历使用） */
  nextSibling?: (node: Node) => Node | null
  /**
   * 有界宿主：返回 host 的视图，使子树的所有"追加"都落在 marker 之前。
   * 用于 when/match 分支和 each 列表项的定位挂载。
   * DOM 实现为拦截 appendChild/insertBefore 的 Proxy；SSR 为子 chunk 写入器。
   */
  boundedHost?: (host: Host, marker: Node) => Host
  /**
   * 批量插入优化提示。返回一个暂存宿主，在其上完成的挂载由 flush 一次性落位。
   * 缺省时引擎退化为逐个 insert。
   */
  batch?: (host: Host) => {
    host: Host
    flush: (host: Host, ref: Node | null) => void
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