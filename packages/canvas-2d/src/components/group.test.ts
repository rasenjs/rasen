/**
 * Group 组件测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setReactiveRuntime, fragment, each } from '@rasenjs/core'
import { createReactiveRuntime } from '@rasenjs/reactive-vue'

import {
  createMockContext,
  createMockReactiveRuntime,
  waitForAsync
} from '../test-utils'
import { createRoot } from '../node'
import type { CanvasNode, Context2D } from '../node'
import { group } from './group'
import { rect } from './rect'
import { circle } from './circle'
import { sprite } from './sprite'

describe('group', () => {
  let ctx: Context2D
  let root: CanvasNode
  let cleanupFns: Array<(() => void) | undefined>

  beforeEach(() => {
    setReactiveRuntime(createMockReactiveRuntime())
    ctx = createMockContext()
    root = createRoot(ctx)
    cleanupFns = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      setTimeout(() => cb(performance.now()), 0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanupFns.forEach((fn) => fn?.())
    vi.unstubAllGlobals()
  })

  describe('基础组合', () => {
    it('应该组合多个子组件', async () => {
      const mountable = group({
        children: [
          rect({ x: 10, y: 10, width: 20, height: 20, fill: 'red' }),
          circle({ x: 50, y: 50, radius: 15, fill: 'blue' })
        ]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证两个形状都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.arc).toHaveBeenCalled()
    })

    it('应该支持位置偏移', async () => {
      const mountable = group({
        x: 50,
        y: 50,
        children: [
          rect({ x: 0, y: 0, width: 20, height: 20, fill: 'red' }),
          rect({ x: 30, y: 0, width: 20, height: 20, fill: 'blue' })
        ]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证translate被调用
      expect(ctx.translate).toHaveBeenCalledWith(50, 50)
      expect(ctx.save).toHaveBeenCalled()
      expect(ctx.restore).toHaveBeenCalled()
    })
  })

  describe('共享变换', () => {
    it('应该对所有子组件应用相同的旋转', async () => {
      const mountable = group({
        x: 100,
        y: 100,
        rotation: Math.PI / 4,
        children: [rect({ x: -25, y: -25, width: 50, height: 50, fill: 'red' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证变换被应用
      expect(ctx.translate).toHaveBeenCalledWith(100, 100)
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4)
    })

    it('应该对所有子组件应用相同的缩放', async () => {
      const mountable = group({
        scaleX: 2,
        scaleY: 0.5,
        children: [circle({ x: 50, y: 50, radius: 20, fill: 'blue' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证缩放被应用
      expect(ctx.scale).toHaveBeenCalledWith(2, 0.5)
    })
  })

  describe('共享效果', () => {
    it('应该对所有子组件应用相同的透明度', async () => {
      const mountable = group({
        opacity: 0.5,
        children: [
          rect({ x: 10, y: 10, width: 30, height: 30, fill: 'red' }),
          rect({ x: 50, y: 10, width: 30, height: 30, fill: 'blue' })
        ]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证透明度被设置
      expect(ctx.globalAlpha).toBe(0.5)
    })

    it('应该支持裁剪区域', async () => {
      const mountable = group({
        clip: { x: 20, y: 20, width: 60, height: 60 },
        children: [rect({ x: 0, y: 0, width: 100, height: 100, fill: 'red' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证裁剪路径被创建
      expect(ctx.clip).toHaveBeenCalled()
      const rectCalls = (ctx.rect as ReturnType<typeof vi.fn>).mock.calls
      const clipCall = rectCalls.find(
        (call) =>
          call[0] === 20 && call[1] === 20 && call[2] === 60 && call[3] === 60
      )
      expect(clipCall).toBeDefined()
    })
  })

  describe('使用 each 和 fragment', () => {
    it('应该使用each组件迭代列表', async () => {
      const shapes = [
        { id: 1, x: 10, y: 10, width: 20, height: 20, fill: 'red' },
        { id: 2, x: 40, y: 10, width: 20, height: 20, fill: 'blue' }
      ]

      const mountable = each(shapes, (shape) => rect(shape))
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证两个矩形都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.fillRect).toHaveBeenCalledWith(40, 10, 20, 20)
    })

    it('应该使用fragment组合静态子组件', async () => {
      const mountable = fragment({
        children: [
          rect({ x: 10, y: 10, width: 20, height: 20, fill: 'red' }),
          circle({ x: 50, y: 50, radius: 15, fill: 'blue' })
        ]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 验证两个形状都被绘制
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 10, 20, 20)
      expect(ctx.arc).toHaveBeenCalled()
    })
  })

  /**
   * A nested subtree used to be drawn once per ancestor.
   *
   * `attachNode`'s `draw` recursed `children` unconditionally *and* `group`
   * recursed its own children to place them inside its transform, so a leaf
   * inside N nested groups reached the leaf's `draw` 2^N times — once per subset
   * of its ancestors' transforms — and the transform-less copy was painted last,
   * on top. `examples/arpg` measured four `drawImage` calls per frame for one
   * sprite inside a camera group + a slot group.
   *
   * The contract these lock down: a component's children are mounted exactly
   * once, into the host the component chooses, and drawn once, by the one
   * authority that owns the recursion (`drawChildren`).
   */
  describe('a nested subtree is drawn once', () => {
    /**
     * Reassigns the transform/draw members of the mock context so every call of
     * `drawCall` records the world offset in effect at that moment. Only
     * `translate` is tracked — that is all `group` applies for `x`/`y`.
     *
     * Installed *after* mounting: the frames the mount scheduled are not part of
     * the measurement.
     */
    function trackWorldOffsets(
      target: Context2D,
      drawCall: 'drawImage' | 'fillRect'
    ): Array<[number, number]> {
      let x = 0
      let y = 0
      const stack: Array<[number, number]> = []
      const positions: Array<[number, number]> = []
      const assign = (name: string, fn: (...args: never[]) => unknown): void => {
        ;(target as unknown as Record<string, unknown>)[name] = vi.fn(fn)
      }

      assign('translate', (tx: number, ty: number) => {
        x += tx
        y += ty
      })
      assign('save', () => {
        stack.push([x, y])
      })
      assign('restore', () => {
        const restored = stack.pop()
        if (restored) {
          x = restored[0]
          y = restored[1]
        }
      })
      assign(drawCall, () => {
        positions.push([x, y])
      })

      return positions
    }

    it('mounts a child inside two nested groups exactly once', async () => {
      let leafMounts = 0
      const leaf = (): ReturnType<typeof sprite> => {
        leafMounts++
        return sprite({
          image: {} as CanvasImageSource,
          x: 0,
          y: 0,
          frameWidth: 8,
          frameHeight: 8,
          frame: 0
        })
      }

      const mountable = group({
        x: 100,
        y: 100,
        children: [group({ x: 1, y: 1, children: [leaf()] })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      expect(leafMounts).toBe(1)
    })

    it('draws a leaf inside two nested groups once, with both offsets applied', async () => {
      const mountable = group({
        x: 100,
        y: 100,
        children: [
          group({
            x: 1,
            y: 1,
            children: [
              sprite({
                image: {} as CanvasImageSource,
                x: 0,
                y: 0,
                frameWidth: 8,
                frameHeight: 8,
                frame: 0
              })
            ]
          })
        ]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // One pass over the tree: the single leaf draws once, at 100 + 1.
      const positions = trackWorldOffsets(ctx, 'drawImage')
      root.draw(ctx)

      expect(positions).toEqual([[101, 101]])
    })

    it('draws a leaf inside one group once, with its offset applied', async () => {
      const mountable = group({
        x: 30,
        y: 40,
        children: [rect({ x: 0, y: 0, width: 8, height: 8, fill: 'red' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      const positions = trackWorldOffsets(ctx, 'fillRect')
      root.draw(ctx)

      expect(positions).toEqual([[30, 40]])
    })
  })

  describe('响应式属性', () => {
    it('应该响应rotation属性变化', async () => {
      // 使用真实的 Vue 响应式系统
      const vueRuntime = createReactiveRuntime()
      setReactiveRuntime(vueRuntime)

      const rotation = vueRuntime.ref(0)
      const mountable = group({
        x: 100,
        y: 100,
        rotation: rotation,
        children: [rect({ x: -25, y: -25, width: 50, height: 50, fill: 'red' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 初始状态
      expect(ctx.rotate).toHaveBeenCalledWith(0)
      ;(ctx.rotate as ReturnType<typeof vi.fn>).mockClear()

      // 更新rotation
      rotation.value = Math.PI / 4
      await waitForAsync()

      // 验证旋转被重新应用
      expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 4)
    })

    it('应该响应opacity属性变化', async () => {
      // 使用真实的 Vue 响应式系统
      const vueRuntime = createReactiveRuntime()
      setReactiveRuntime(vueRuntime)

      const opacity = vueRuntime.ref(1)
      const mountable = group({
        opacity: opacity,
        children: [rect({ x: 10, y: 10, width: 30, height: 30, fill: 'red' })]
      })
      cleanupFns.push(mountable(root, undefined))
      await waitForAsync()

      // 初始状态
      expect(ctx.globalAlpha).toBe(1)

      // 更新opacity
      opacity.value = 0.5
      await waitForAsync()

      // 验证透明度被更新
      expect(ctx.globalAlpha).toBe(0.5)
    })
  })
})
