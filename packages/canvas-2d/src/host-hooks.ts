/**
 * Canvas-2d 宿主钩子 —— 场景树对 `HostHooks` 的实现。
 *
 * 结构性组件（`each` / `when` / `match` / `fragment`）靠宿主能力给子节点定位：
 * 占位的标记、相对兄弟的插入、兄弟遍历。场景树三样都有（`children` 就是有序
 * 数组），所以它应当**提供**这些能力，而不是缺席降级成"只能顺序追加"。
 *
 * 缺席的代价不只是少一项优化：`com` 会把省略的 hooks 参数从当前挂载回填，
 * 于是"没有钩子"会静默变成"继承**外层**宿主的钩子"——canvas 子树里第一个
 * `each` 就会拿到 DOM 那套，对一个场景节点调 `insertBefore`。
 *
 * ⚠️ 刻意不提供 `batch`：batch 协议用 `firstChild`/`lastChild` 读行边界，并把
 * 行挂进一个**暂存宿主**再 flush 进真实父节点；而 `createNode` / `remove` 在
 * 闭包里捕获了挂载时的宿主，flush 过的行仍会从暂存宿主上摘除自己。缺省
 * `batch` 时引擎走标记路径，那条路径从不跨宿主移动节点。
 */

import type { HostHooks, TextHandle } from '@rasenjs/core'
import { RenderContext } from './render-context'
import { createNode, type CanvasNode } from './node'

/** 结构变化即标脏：场景树是数组，改数组不会自己触发重绘。 */
function markDirty(node: CanvasNode): void {
  RenderContext.for(node.ctx).markDirty()
}

/**
 * 标记是一个**真实的场景节点**，只是不画任何东西。
 *
 * 它必须是节点且必须留在 `children` 里：位置就是它的全部职责，而渲染器的
 * 前序遍历会对每个子节点调 `draw()`。`kind`（'w' / 'e' / 'i'）只对把标记内容
 * 编码进节点本身的宿主（DOM 注释）有意义，场景节点以引用区分，故忽略。
 */
function createMarker(parent: CanvasNode, kind: string): CanvasNode {
  void kind
  return createNode(parent, { draw: () => {} })
}

/**
 * 在 `ref` 之前插入 `node`（`ref` 为 null 表示追加到末尾）；也用于移动已有节点。
 *
 * 契约关键：**必须紧贴 `ref` 之前**——引擎连续对同一个 `ref` 插入多个节点，
 * 靠"后插者紧贴 ref"把区间按原顺序排好；先取下标再 splice 也保证移动同一个
 * 父节点内的节点不会错位。
 */
function insert(
  parent: CanvasNode,
  node: CanvasNode,
  ref: CanvasNode | null
): void {
  const from = parent.children.indexOf(node)
  if (from >= 0) parent.children.splice(from, 1)
  // 目标下标必须在摘除**之后**再算，否则同父移动会偏一位。
  const at = ref ? parent.children.indexOf(ref) : -1
  if (at >= 0) parent.children.splice(at, 0, node)
  else parent.children.push(node)
  markDirty(parent)
}

/** 摘除：走节点自己的 remove，它会停订阅、摘下自己并标脏。 */
function detach(node: CanvasNode): void {
  node.remove()
}

function nextSibling(node: CanvasNode): CanvasNode | null {
  const parent = node.parent
  if (!parent) return null
  const i = parent.children.indexOf(node)
  return i < 0 ? null : (parent.children[i + 1] ?? null)
}

/**
 * 有界宿主：返回 `parent` 的视图，使子树的**追加都落在 `ref` 之前**。
 *
 * 组件挂载时只做一件事——`createNode` 里的 `parent.children.push(node)`，
 * 所以重定向 `push` 就够了。其余数组操作（`indexOf` / `splice`）必须继续作用
 * 在**真实**数组上：行节点的 `remove()` 正是用它们把自己摘下来的。
 *
 * 用 Proxy 是安全的：这里的宿主是普通对象，不存在 DOM 那些方法的
 * `Illegal invocation` 问题；每个列表行创建时只建一次，不在热循环里。
 */
function boundedHost(parent: CanvasNode, ref: CanvasNode): CanvasNode {
  const real = parent.children
  const childrenView = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'push') {
        return (node: CanvasNode) => {
          const at = target.indexOf(ref)
          target.splice(at < 0 ? target.length : at, 0, node)
          return target.length
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  }) as readonly CanvasNode[] as CanvasNode[]

  return new Proxy(parent, {
    get(target, prop, receiver) {
      if (prop === 'children') return childrenView
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

/**
 * 场景树没有文本节点——文本由 `text` 组件绘制。这里给出**空操作句柄**：
 * `fragment` 的契约（一个可插入的 node + 一个 update）被满足，但不凭空
 * 发明一个不可见的文本原语。
 */
function createText(
  parent: CanvasNode,
  content: string
): TextHandle<CanvasNode> {
  void content
  const node = createNode(parent, { draw: () => {} })
  return { node, update: () => {} }
}

/**
 * canvas-2d 场景树的宿主能力集。
 *
 * `batch` 与 `extractRange` 刻意缺席（见文件头注释）：前者会跨宿主移动节点，
 * 后者是 DOM 逐节点 removeChild 常数因子的优化——场景树摘节点只是
 * `splice`，引擎的 nextSibling + detach 回退路径已经够用。
 */
export const canvasHostHooks: HostHooks<CanvasNode> = {
  createMarker,
  createText,
  insert,
  detach,
  nextSibling,
  boundedHost
}
