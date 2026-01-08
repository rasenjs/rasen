/**
 * 动画测试辅助工具
 *
 * 用于测试动画、脏区域检测和像素级验证
 */

/**
 * 获取 canvas 上某个区域的像素数据
 */
export function getPixelData(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): Uint8ClampedArray {
  const imageData = ctx.getImageData(x, y, width, height)
  return imageData.data
}

/**
 * 检查某个区域是否为空（全部透明）
 */
export function isRegionEmpty(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  const data = getPixelData(ctx, x, y, width, height)
  // 检查所有像素的 alpha 通道是否都为 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) {
      return false
    }
  }
  return true
}

/**
 * 检查某个区域是否有内容（至少有一个不透明像素）
 */
export function hasContent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  return !isRegionEmpty(ctx, x, y, width, height)
}

/**
 * Wait for Vue nextTick and force sync refresh
 */
export async function waitForUpdate(renderContext: {
  flushSync: () => void
}): Promise<void> {
  // Dynamically import Vue's nextTick (if available)
  try {
    const { nextTick } = await import('@vue/reactivity')
    // Wait for Vue's nextTick
    await nextTick()
  } catch {
    // If Vue is not available, just wait for microtask
  }
  // Wait for another microtask to ensure tasks in queueMicrotask are executed
  await Promise.resolve()
  // If not executed yet, force sync refresh
  renderContext.flushSync()
}

/**
 * 检查像素颜色是否匹配（考虑容差）
 */
export function isColorMatch(
  data: Uint8ClampedArray,
  index: number,
  expectedR: number,
  expectedG: number,
  expectedB: number,
  tolerance = 5
): boolean {
  const r = data[index]
  const g = data[index + 1]
  const b = data[index + 2]

  return (
    Math.abs(r - expectedR) <= tolerance &&
    Math.abs(g - expectedG) <= tolerance &&
    Math.abs(b - expectedB) <= tolerance
  )
}

/**
 * 获取区域内非透明像素的数量
 */
export function countOpaquePixels(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const data = getPixelData(ctx, x, y, width, height)
  let count = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      count++
    }
  }
  return count
}
