import { test, expect } from '@playwright/test'

/**
 * RadioGroup: one selection out of a set, announced as a single radiogroup.
 * The demo has a disabled option, which is what makes the "skip disabled"
 * behaviour observable.
 */
test.describe('RadioGroup', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  const group = '#radiogroup-default [role="radiogroup"]'
  const radios = '#radiogroup-default [role="radio"]'

  test.describe('rendering', () => {
    test('should render a radiogroup', async ({ page }) => {
      const el = page.locator(group)
      await expect(el).toBeVisible()
      await expect(el).toHaveAttribute('role', 'radiogroup')
    })

    test('should render one radio per option', async ({ page }) => {
      await expect(page.locator(radios)).toHaveCount(3)
    })

    test('should check the default option only', async ({ page }) => {
      const first = page.locator(radios).nth(0)
      const second = page.locator(radios).nth(1)

      await expect(second).toHaveAttribute('aria-checked', 'true')
      await expect(second).toHaveAttribute('data-state', 'checked')
      await expect(first).toHaveAttribute('aria-checked', 'false')
      await expect(first).toHaveAttribute('data-state', 'unchecked')
    })

    test('should mark the disabled option', async ({ page }) => {
      const last = page.locator(radios).nth(2)
      // Native `disabled` on the button, not `aria-disabled`: the control is
      // a real button, so the platform already removes it for assistive
      // technology and from the tab order.
      await expect(last).toBeDisabled()
      await expect(last).toHaveAttribute('data-disabled', '')
    })
  })

  test.describe('interaction', () => {
    test('should select on click', async ({ page }) => {
      const first = page.locator(radios).nth(0)
      await first.click()

      await expect(first).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator(radios).nth(1)).toHaveAttribute(
        'aria-checked',
        'false'
      )
    })

    test('should stay on the current option when the disabled one is clicked', async ({
      page
    }) => {
      const last = page.locator(radios).nth(2)
      // Forced: the option is announced as disabled, so a plain click would
      // wait for it to become enabled instead of proving it is inert.
      await last.click({ force: true })

      await expect(last).toHaveAttribute('aria-checked', 'false')
      await expect(page.locator(radios).nth(1)).toHaveAttribute(
        'aria-checked',
        'true'
      )
    })
  })

  test.describe('keyboard', () => {
    test('should put one radio in the tab order', async ({ page }) => {
      // Roving tabindex: the checked option is the group's single tab stop.
      await expect(page.locator(radios).nth(1)).toHaveAttribute('tabindex', '0')
      await expect(page.locator(radios).nth(0)).toHaveAttribute(
        'tabindex',
        '-1'
      )
    })

    test('should move the selection with the arrow keys', async ({ page }) => {
      const second = page.locator(radios).nth(1)
      await second.focus()

      await page.keyboard.press('ArrowDown')

      // The third option is disabled, so the selection wraps to the first.
      await expect(page.locator(radios).nth(0)).toHaveAttribute(
        'aria-checked',
        'true'
      )
      await expect(second).toHaveAttribute('aria-checked', 'false')
    })

    test('should move the selection back with the up arrow', async ({
      page
    }) => {
      const second = page.locator(radios).nth(1)
      await second.focus()

      await page.keyboard.press('ArrowUp')

      await expect(page.locator(radios).nth(0)).toHaveAttribute(
        'aria-checked',
        'true'
      )
    })
  })
})
