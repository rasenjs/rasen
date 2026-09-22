import { test, expect } from '@playwright/test'

/**
 * ToggleGroup has two personalities, and the demo renders one of each: single
 * behaves like a radio group (one pressed at a time), multiple behaves like a
 * set of independent toggle buttons. The roles change with it, which is the
 * part worth checking in a browser.
 */
test.describe('ToggleGroup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  const single = '#togglegroup-single'
  const multiple = '#togglegroup-multiple'

  test.describe('single', () => {
    test('should announce itself as a radio group', async ({ page }) => {
      const group = page.locator(`${single} [role="radiogroup"]`)
      await expect(group).toBeVisible()
      await expect(page.locator(`${single} [role="radio"]`)).toHaveCount(3)
    })

    test('should have exactly one option pressed', async ({ page }) => {
      const items = page.locator(`${single} [role="radio"]`)
      await expect(items.nth(0)).toHaveAttribute('aria-checked', 'true')
      await expect(items.nth(1)).toHaveAttribute('aria-checked', 'false')
      await expect(items.nth(2)).toHaveAttribute('aria-checked', 'false')
    })

    test('should keep only one pressed after a click', async ({ page }) => {
      const items = page.locator(`${single} [role="radio"]`)
      await items.nth(2).click()

      await expect(items.nth(2)).toHaveAttribute('aria-checked', 'true')
      await expect(items.nth(0)).toHaveAttribute('aria-checked', 'false')
    })

    test('should move the selection with the arrow keys', async ({ page }) => {
      const items = page.locator(`${single} [role="radio"]`)
      await items.nth(0).focus()

      await page.keyboard.press('ArrowRight')

      // Single mode announces radiogroup/radio, so the arrows select as they
      // move - the same contract RadioGroup keeps.
      await expect(items.nth(1)).toBeFocused()
      await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true')
      await expect(items.nth(0)).toHaveAttribute('aria-checked', 'false')
    })

    test('should keep the selection on the option Space presses', async ({
      page
    }) => {
      const items = page.locator(`${single} [role="radio"]`)
      await items.nth(0).focus()

      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Space')

      await expect(items.nth(1)).toHaveAttribute('aria-checked', 'true')
      await expect(items.nth(0)).toHaveAttribute('aria-checked', 'false')
    })
  })

  test.describe('multiple', () => {
    test('should announce itself as a plain group', async ({ page }) => {
      const group = page.locator(`${multiple} [role="group"]`)
      await expect(group).toBeVisible()
      // Not a radiogroup: several options may be on at once.
      await expect(page.locator(`${multiple} [role="radiogroup"]`)).toHaveCount(
        0
      )
    })

    test('should report each option with aria-pressed', async ({ page }) => {
      // Plain buttons: multiple mode is a group of toggle buttons, so the
      // items keep the button's implicit role and report state with
      // aria-pressed instead of switching role.
      const items = page.locator(`${multiple} button`)
      await expect(items).toHaveCount(2)
      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'false')
    })

    test('should let several options be pressed at once', async ({ page }) => {
      const items = page.locator(`${multiple} button`)
      await items.nth(1).click()

      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'true')
      await expect(items.nth(1)).toHaveAttribute('aria-pressed', 'true')
    })

    test('should unpress on a second click', async ({ page }) => {
      const items = page.locator(`${multiple} button`)
      await items.nth(0).click()

      await expect(items.nth(0)).toHaveAttribute('aria-pressed', 'false')
    })
  })
})
