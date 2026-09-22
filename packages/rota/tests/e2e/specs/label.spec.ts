import { test, expect } from '@playwright/test'

/**
 * Label is thin on purpose: its whole job is the `for` relationship. That is
 * what these check - including that a click on it reaches the control, which
 * only happens while the relationship is real (and the ids actually match).
 */
test.describe('Label', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test('should render a label pointing at its control', async ({ page }) => {
    const label = page.locator('#label-default label')
    await expect(label).toBeVisible()
    await expect(label).toHaveAttribute('for', 'label-input')
    await expect(label).toContainText('Seats')
  })

  test('should have a control that actually exists', async ({ page }) => {
    // A `for` pointing at nothing is the failure mode this component exists to
    // avoid, and it is invisible from the label alone.
    const label = page.locator('#label-default label')
    const target = await label.getAttribute('for')
    expect(target).toBeTruthy()
    await expect(page.locator(`#${target}`)).toHaveCount(1)
  })

  test('should forward a click to the control', async ({ page }) => {
    await page.locator('#label-default label').click()

    // The browser does the forwarding, so this only passes while the `for`
    // relationship holds.
    await expect(page.locator('#label-input')).toBeFocused()
  })
})
