import { test, expect } from '@playwright/test'

/**
 * Slider in a real browser. The parts that only exist here are the value
 * attributes assistive technology reads and the keyboard stepping - jsdom has
 * no layout, so a percentage position means nothing there.
 */
test.describe('Slider', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render a thumb with the default value', async ({ page }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await expect(thumb).toBeVisible()
      await expect(thumb).toHaveAttribute('aria-valuenow', '30')
    })

    test('should expose the range to assistive technology', async ({
      page
    }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await expect(thumb).toHaveAttribute('aria-valuemin', '0')
      await expect(thumb).toHaveAttribute('aria-valuemax', '100')
      await expect(thumb).toHaveAttribute('aria-orientation', 'horizontal')
    })

    test('should render one thumb per value', async ({ page }) => {
      const thumbs = page.locator('#slider-range [role="slider"]')
      await expect(thumbs).toHaveCount(2)
      await expect(thumbs.nth(0)).toHaveAttribute('aria-valuenow', '25')
      await expect(thumbs.nth(1)).toHaveAttribute('aria-valuenow', '75')
    })
  })

  test.describe('keyboard', () => {
    test('should be focusable', async ({ page }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await thumb.focus()
      await expect(thumb).toBeFocused()
      await expect(thumb).toHaveAttribute('tabindex', '0')
    })

    test('should step the value with the arrow keys', async ({ page }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await thumb.focus()

      await page.keyboard.press('ArrowRight')
      await expect(thumb).toHaveAttribute('aria-valuenow', '31')

      await page.keyboard.press('ArrowLeft')
      await expect(thumb).toHaveAttribute('aria-valuenow', '30')
    })

    test('should jump to the ends with Home and End', async ({ page }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await thumb.focus()

      await page.keyboard.press('End')
      await expect(thumb).toHaveAttribute('aria-valuenow', '100')

      await page.keyboard.press('Home')
      await expect(thumb).toHaveAttribute('aria-valuenow', '0')
    })

    test('should step by a page with PageUp and PageDown', async ({ page }) => {
      const thumb = page.locator('#slider-default [role="slider"]')
      await thumb.focus()
      await page.keyboard.press('Home')

      await page.keyboard.press('PageUp')
      await expect(thumb).toHaveAttribute('aria-valuenow', '10')

      await page.keyboard.press('PageDown')
      await expect(thumb).toHaveAttribute('aria-valuenow', '0')
    })

    test('should not step the first thumb below its neighbour', async ({
      page
    }) => {
      const first = page.locator('#slider-range [role="slider"]').nth(0)
      await first.focus()

      // 25 -> 24, and the partner at 75 must not be dragged along.
      await page.keyboard.press('ArrowLeft')
      await expect(first).toHaveAttribute('aria-valuenow', '24')

      const second = page.locator('#slider-range [role="slider"]').nth(1)
      await expect(second).toHaveAttribute('aria-valuenow', '75')
    })
  })
})
