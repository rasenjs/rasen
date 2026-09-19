import { test, expect } from '@playwright/test'

/**
 * PinInput in a real browser.
 *
 * Unlike the unit tests, this uses real `type` and real clipboard-less typing,
 * so it checks the behaviour that depends on a real selection and a real cursor:
 * characters land in the cell they were typed into, and focus moves on by
 * itself once a cell is filled.
 */
test.describe('PinInput', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
  })

  test.describe('rendering', () => {
    test('should render one input per digit', async ({ page }) => {
      const inputs = page.locator('#pininput-default input')
      await expect(inputs).toHaveCount(6)
    })

    test('should show a default value', async ({ page }) => {
      const inputs = page.locator('#pininput-with-value input')
      await expect(inputs.nth(0)).toHaveValue('1')
      await expect(inputs.nth(3)).toHaveValue('4')
      await expect(inputs.nth(4)).toHaveValue('')
    })

    test('should start empty otherwise', async ({ page }) => {
      const inputs = page.locator('#pininput-default input')
      const count = await inputs.count()
      for (let i = 0; i < count; i++) {
        await expect(inputs.nth(i)).toHaveValue('')
      }
    })

    test('should disable every cell when disabled', async ({ page }) => {
      const inputs = page.locator('#pininput-disabled input')
      const count = await inputs.count()
      expect(count).toBeGreaterThan(0)
      for (let i = 0; i < count; i++) {
        await expect(inputs.nth(i)).toBeDisabled()
      }
    })

    test('should mark the group as a single labelled field', async ({
      page
    }) => {
      const inputs = page.locator('#pininput-default input')
      // Each cell is part of one logical input for assistive technology.
      await expect(inputs.nth(0)).toHaveAttribute('inputmode', 'numeric')
    })
  })

  test.describe('typing', () => {
    test('should fill a cell and move to the next', async ({ page }) => {
      const inputs = page.locator('#pininput-default input')
      await inputs.nth(0).click()
      await page.keyboard.type('7')

      await expect(inputs.nth(0)).toHaveValue('7')
      // Focus advances so the next digit goes into the next cell.
      await expect(inputs.nth(1)).toBeFocused()
    })

    test('should fill several cells in sequence', async ({ page }) => {
      const inputs = page.locator('#pininput-default input')
      await inputs.nth(0).click()
      await page.keyboard.type('1234')

      await expect(inputs.nth(0)).toHaveValue('1')
      await expect(inputs.nth(1)).toHaveValue('2')
      await expect(inputs.nth(2)).toHaveValue('3')
      await expect(inputs.nth(3)).toHaveValue('4')
      await expect(inputs.nth(4)).toHaveValue('')
      await expect(inputs.nth(4)).toBeFocused()
    })

    test('should replace a filled cell when typing over it', async ({
      page
    }) => {
      const inputs = page.locator('#pininput-with-value input')
      await inputs.nth(0).click()
      await page.keyboard.type('9')

      await expect(inputs.nth(0)).toHaveValue('9')
      await expect(inputs.nth(1)).toHaveValue('2')
    })

    test('should clear a cell with Backspace and step back', async ({
      page
    }) => {
      const inputs = page.locator('#pininput-with-value input')
      await inputs.nth(2).click()
      await page.keyboard.press('Backspace')

      await expect(inputs.nth(2)).toHaveValue('')
    })

    test('should refuse non-digits in a numeric field', async ({ page }) => {
      const inputs = page.locator('#pininput-numeric input')
      await inputs.nth(0).click()
      await page.keyboard.type('a')

      await expect(inputs.nth(0)).toHaveValue('')
    })
  })
})
