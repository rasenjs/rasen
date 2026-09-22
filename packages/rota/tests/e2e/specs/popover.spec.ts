import { test, expect } from '@playwright/test'

/**
 * Popover in a real browser.
 *
 * This is where the parts that jsdom cannot represent get checked: a real
 * click focuses the trigger (jsdom's `click()` does not, which is why the
 * unit test focuses explicitly), Tab really moves focus so "not trapped" is
 * observable, and the panel is actually positioned against the root.
 */
test.describe('Popover', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  const trigger = '#popover-trigger'
  const panel = '#popover-content'
  const inner = '#popover-inner'

  test.describe('rendering', () => {
    test('should start closed', async ({ page }) => {
      await expect(page.locator(trigger)).toBeVisible()
      await expect(page.locator(panel)).toBeHidden()
      await expect(page.locator(trigger)).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    })

    test('should be a non-modal dialog', async ({ page }) => {
      await page.locator(trigger).click()

      const panelEl = page.locator(panel)
      await expect(panelEl).toBeVisible()
      await expect(panelEl).toHaveAttribute('role', 'dialog')
      // Non-modal: no aria-modal, and nothing covers the page.
      await expect(panelEl).not.toHaveAttribute('aria-modal')
    })

    test('should point aria-controls at the panel it renders', async ({
      page
    }) => {
      const controls = await page.locator(trigger).getAttribute('aria-controls')
      expect(controls).toBe('popover-content')
      await expect(page.locator(`#${controls}`)).toHaveCount(1)
    })
  })

  test.describe('anchoring', () => {
    test('should place the panel against its trigger', async ({ page }) => {
      const triggerBox = await page.locator(trigger).boundingBox()
      await page.locator(trigger).click()

      const panelEl = page.locator(panel)
      const panelBox = await panelEl.boundingBox()
      expect(triggerBox).not.toBeNull()
      expect(panelBox).not.toBeNull()

      // Placed to the bottom side, so the panel starts at or below the
      // trigger's bottom edge and overlaps it horizontally.
      expect(panelBox!.y).toBeGreaterThanOrEqual(triggerBox!.y)
      expect(panelBox!.x).toBeLessThanOrEqual(
        triggerBox!.x + triggerBox!.width
      )
      expect(panelBox!.x + panelBox!.width).toBeGreaterThanOrEqual(triggerBox!.x)
      await expect(panelEl).toHaveAttribute('data-side', 'bottom')
    })
  })

  test.describe('interaction', () => {
    test('should open and close from the trigger', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(panel)).toBeVisible()
      await expect(page.locator(trigger)).toHaveAttribute(
        'aria-expanded',
        'true'
      )

      // The trigger belongs to the layer: if it did not, the outside-press
      // dismissal would fire first and this click would reopen what it closed.
      await page.locator(trigger).click()
      await expect(page.locator(panel)).toBeHidden()
      await expect(page.locator(trigger)).toHaveAttribute(
        'aria-expanded',
        'false'
      )
    })

    test('should close on Escape', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(panel)).toBeVisible()

      await page.keyboard.press('Escape')

      await expect(page.locator(panel)).toBeHidden()
    })

    test('should close on a press outside', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(panel)).toBeVisible()

      // Somewhere far from the layer.
      await page.mouse.click(5, 5)

      await expect(page.locator(panel)).toBeHidden()
    })
  })

  test.describe('focus', () => {
    test('should move focus into the panel on open', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(inner)).toBeFocused()
    })

    test('should give focus back to the trigger on close', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(panel)).toBeVisible()

      await page.keyboard.press('Escape')

      // A real click focuses the trigger, so this is the origin the layer
      // restores to.
      await expect(page.locator(trigger)).toBeFocused()
    })

    test('should not trap Tab inside the panel', async ({ page }) => {
      await page.locator(trigger).click()
      await expect(page.locator(inner)).toBeFocused()

      await page.keyboard.press('Tab')

      // A popover is not modal: Tab leaves it. The panel has one focusable
      // child, so a trap would have wrapped focus back to it.
      await expect(page.locator(inner)).not.toBeFocused()
      // And leaving does not destroy the layer - it is still open for the
      // user to come back to. Escape and an outside press are what close it.
      await expect(page.locator(panel)).toBeVisible()
    })
  })
})
