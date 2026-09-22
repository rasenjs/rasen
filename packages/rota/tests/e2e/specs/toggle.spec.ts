import { test, expect } from '@playwright/test'

/**
 * Toggle stays a button: it reports its state through `aria-pressed` and
 * `data-state` rather than changing role, so a toggle is never mistaken for a
 * checkbox by assistive technology.
 */
test.describe('Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test('should render a button that reports pressed state', async ({ page }) => {
    const toggle = page.locator('#toggle-on')
    await expect(toggle).toBeVisible()
    // A button, not a checkbox.
    await expect(toggle).toHaveJSProperty('tagName', 'BUTTON')
    await expect(toggle).toHaveAttribute('type', 'button')
    await expect(toggle).not.toHaveAttribute('role', 'checkbox')
  })

  test('should start pressed when defaultPressed is set', async ({ page }) => {
    const toggle = page.locator('#toggle-on')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveAttribute('data-state', 'on')
  })

  test('should toggle off and back on when clicked', async ({ page }) => {
    const toggle = page.locator('#toggle-on')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveAttribute('data-state', 'off')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveAttribute('data-state', 'on')
  })

  test('should keep its content', async ({ page }) => {
    const toggle = page.locator('#toggle-on')
    await toggle.click()
    await expect(toggle).toContainText('Bold')
  })

  test('should be reachable and operable from the keyboard', async ({
    page
  }) => {
    const toggle = page.locator('#toggle-on')
    await toggle.focus()
    await expect(toggle).toBeFocused()

    // A button is activated by Space and Enter natively; toggling must not
    // depend on a mouse.
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })
})
