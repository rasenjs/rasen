import { test, expect } from '@playwright/test'

test.describe('Separator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render horizontal separator with correct attributes', async ({
      page
    }) => {
      const separator = page.locator('#separator-h')
      await expect(separator).toBeInViewport()
      await expect(separator).toHaveAttribute('data-orientation', 'horizontal')
      await expect(separator).toHaveAttribute('role', 'separator')
      await expect(separator).toHaveAttribute('aria-orientation', 'horizontal')
    })

    test('should render vertical separator with correct attributes', async ({
      page
    }) => {
      const separator = page.locator('#separator-v')
      await expect(separator).toBeInViewport()
      await expect(separator).toHaveAttribute('data-orientation', 'vertical')
      await expect(separator).toHaveAttribute('role', 'separator')
    })

    test('should render decorative separator without ARIA role', async ({
      page
    }) => {
      const separator = page.locator('#separator-decorative')
      await expect(separator).toBeInViewport()
      await expect(separator).not.toHaveAttribute('role', 'separator')
      await expect(separator).not.toHaveAttribute('aria-orientation')
    })
  })

  test.describe('accessibility', () => {
    test('should be ignored by screen readers when decorative', async ({
      page
    }) => {
      const separator = page.locator('#separator-decorative')
      await expect(separator).not.toHaveAttribute('role')
      await expect(separator).not.toHaveAttribute('aria-label')
    })

    test('should announce separator to screen readers when semantic', async ({
      page
    }) => {
      const separator = page.locator('#separator-h')
      await expect(separator).toHaveAttribute('role', 'separator')
    })
  })

  test.describe('styling', () => {
    test('should have correct dimensions for horizontal separator', async ({
      page
    }) => {
      const separator = page.locator('#separator-h')
      const box = await separator.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeLessThanOrEqual(2) // 1px height
    })

    test('should have correct dimensions for vertical separator', async ({
      page
    }) => {
      const separator = page.locator('#separator-v')
      const box = await separator.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeLessThanOrEqual(2) // 1px width
    })
  })

  test.describe('edge cases', () => {
    test('should render in flex container', async ({ page }) => {
      const container = page.locator('div:has(#separator-v)')
      await expect(container).toHaveCSS('display', 'flex')
    })

    test('should not interfere with surrounding content', async ({ page }) => {
      const contentAbove = page
        .locator('#separator-h')
        .locator('xpath=preceding-sibling::p[1]')
      const contentBelow = page
        .locator('#separator-h')
        .locator('xpath=following-sibling::p[1]')
      await expect(contentAbove).toBeVisible()
      await expect(contentBelow).toBeVisible()
    })
  })
})
