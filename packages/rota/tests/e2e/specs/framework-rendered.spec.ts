import { test, expect } from '@playwright/test'

test.describe('NumberField Component (Framework Rendered)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
    await page.waitForSelector('#numberfield-default')
  })

  test.describe('rendering', () => {
    test('should render default numberfield with input and buttons', async ({
      page
    }) => {
      const container = page.locator('#numberfield-default')
      const input = container.locator('.numberfield-input')
      const buttons = container.locator('.numberfield-button')

      await expect(input).toBeVisible()
      await expect(buttons).toHaveCount(2)
    })

    test('should render numberfield with initial value', async ({ page }) => {
      const container = page.locator('#numberfield-with-value')
      const input = container.locator('.numberfield-input')

      await expect(input).toHaveValue('50')
    })

    test('should render disabled numberfield', async ({ page }) => {
      const container = page.locator('#numberfield-disabled')
      const input = container.locator('.numberfield-input')

      await expect(input).toBeDisabled()
    })
  })

  test.describe('interaction', () => {
    test('should increment value on increment button click', async ({
      page
    }) => {
      const container = page.locator('#numberfield-with-value')
      const input = container.locator('.numberfield-input')
      const incrementBtn = container.locator('.numberfield-button').last()

      await expect(input).toHaveValue('50')
      await incrementBtn.click()
      await expect(input).toHaveValue('51')
    })

    test('should decrement value on decrement button click', async ({
      page
    }) => {
      const container = page.locator('#numberfield-with-value')
      const input = container.locator('.numberfield-input')
      const decrementBtn = container.locator('.numberfield-button').first()

      await expect(input).toHaveValue('50')
      await decrementBtn.click()
      await expect(input).toHaveValue('49')
    })

    test('should clamp value to max', async ({ page }) => {
      const container = page.locator('#numberfield-with-range')
      const input = container.locator('.numberfield-input')
      const incrementBtn = container.locator('.numberfield-button').last()

      await expect(input).toHaveValue('5')

      // Click 6 times to reach max (10)
      for (let i = 0; i < 6; i++) {
        await incrementBtn.click()
      }

      await expect(input).toHaveValue('10')

      // One more click should not exceed max
      await incrementBtn.click()
      await expect(input).toHaveValue('10')
    })

    test('should clamp value to min', async ({ page }) => {
      const container = page.locator('#numberfield-with-range')
      const input = container.locator('.numberfield-input')
      const decrementBtn = container.locator('.numberfield-button').first()

      await expect(input).toHaveValue('5')

      // Click 6 times to reach min (0)
      for (let i = 0; i < 6; i++) {
        await decrementBtn.click()
      }

      await expect(input).toHaveValue('0')

      // One more click should not go below min
      await decrementBtn.click()
      await expect(input).toHaveValue('0')
    })

    test('should update value when typing in input', async ({ page }) => {
      const container = page.locator('#numberfield-with-value')
      const input = container.locator('.numberfield-input')

      await input.fill('75')
      await input.blur()

      await expect(input).toHaveValue('75')
    })
  })
})

test.describe('TagsInput Component (Framework Rendered)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
    await page.waitForSelector('#tagsinput-default')
  })

  test.describe('rendering', () => {
    test('should render default tagsinput with input', async ({ page }) => {
      const container = page.locator('#tagsinput-default')
      const input = container.locator('.tagsinput-input')

      await expect(input).toBeVisible()
    })

    test('should render tagsinput with default tags', async ({ page }) => {
      const container = page.locator('#tagsinput-with-default')
      const items = container.locator('.tagsinput-item')

      await expect(items).toHaveCount(2)
      await expect(items.nth(0)).toContainText('Vue')
      await expect(items.nth(1)).toContainText('React')
    })

    test('should render disabled tagsinput', async ({ page }) => {
      const container = page.locator('#tagsinput-disabled')
      const input = container.locator('.tagsinput-input')

      await expect(input).toBeDisabled()
    })
  })

  test.describe('interaction', () => {
    test('should add tag on Enter key', async ({ page }) => {
      const container = page.locator('#tagsinput-default')
      const input = container.locator('.tagsinput-input')

      await input.fill('Vue')
      await input.press('Enter')

      const items = container.locator('.tagsinput-item')
      await expect(items).toHaveCount(1)
      await expect(items.nth(0)).toContainText('Vue')
    })

    test('should remove tag on delete button click', async ({ page }) => {
      const container = page.locator('#tagsinput-with-default')
      const deleteBtn = container.locator('.tagsinput-item-delete').first()

      await expect(container.locator('.tagsinput-item')).toHaveCount(2)
      await deleteBtn.click()
      await expect(container.locator('.tagsinput-item')).toHaveCount(1)
    })

    test('should respect max tags limit', async ({ page }) => {
      const container = page.locator('#tagsinput-max')
      const input = container.locator('.tagsinput-input')

      // Add 3 tags (max is 3)
      await input.fill('Tag1')
      await input.press('Enter')
      await input.fill('Tag2')
      await input.press('Enter')
      await input.fill('Tag3')
      await input.press('Enter')

      await expect(container.locator('.tagsinput-item')).toHaveCount(3)

      // Try to add 4th tag
      await input.fill('Tag4')
      await input.press('Enter')

      // Should still have only 3 tags
      await expect(container.locator('.tagsinput-item')).toHaveCount(3)
    })

    test('should navigate tags with arrow keys', async ({ page }) => {
      const container = page.locator('#tagsinput-with-default')
      const input = container.locator('.tagsinput-input')

      // Focus input and press Backspace to select last tag
      await input.focus()
      await input.press('Backspace')

      const lastItem = container.locator('.tagsinput-item').last()
      await expect(lastItem).toHaveAttribute('data-selected', '')
    })
  })
})

test.describe('PinInput Component (Framework Rendered)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/')
    await page.waitForSelector('#pininput-default')
  })

  test.describe('rendering', () => {
    test('should render pininput with 4 inputs by default', async ({
      page
    }) => {
      const container = page.locator('#pininput-default')
      const inputs = container.locator('.pininput-input')

      await expect(inputs).toHaveCount(4)
    })

    test('should render pininput with initial value', async ({ page }) => {
      const container = page.locator('#pininput-with-value')
      const inputs = container.locator('.pininput-input')

      await expect(inputs.nth(0)).toHaveValue('1')
      await expect(inputs.nth(1)).toHaveValue('2')
      await expect(inputs.nth(2)).toHaveValue('3')
      await expect(inputs.nth(3)).toHaveValue('4')
    })

    test('should render disabled pininput', async ({ page }) => {
      const container = page.locator('#pininput-disabled')
      const inputs = container.locator('.pininput-input')

      await expect(inputs.nth(0)).toBeDisabled()
    })
  })

  test.describe('interaction', () => {
    test('should move to next input on typing', async ({ page }) => {
      const container = page.locator('#pininput-default')
      const inputs = container.locator('.pininput-input')

      await inputs.nth(0).fill('5')
      await expect(inputs.nth(1)).toBeFocused()
    })

    test('should move to previous input on Backspace', async ({ page }) => {
      const container = page.locator('#pininput-default')
      const inputs = container.locator('.pininput-input')

      await inputs.nth(0).fill('5')
      await expect(inputs.nth(1)).toBeFocused()

      await inputs.nth(1).press('Backspace')
      await expect(inputs.nth(0)).toBeFocused()
    })

    test('should support paste', async ({ page }) => {
      const container = page.locator('#pininput-default')
      const inputs = container.locator('.pininput-input')

      // Paste 4-digit code
      await inputs.nth(0).fill('1234')

      await expect(inputs.nth(0)).toHaveValue('1')
      await expect(inputs.nth(1)).toHaveValue('2')
      await expect(inputs.nth(2)).toHaveValue('3')
      await expect(inputs.nth(3)).toHaveValue('4')
    })

    test('should navigate with arrow keys', async ({ page }) => {
      const container = page.locator('#pininput-default')
      const inputs = container.locator('.pininput-input')

      await inputs.nth(0).click()
      await inputs.nth(0).press('ArrowRight')
      await expect(inputs.nth(1)).toBeFocused()

      await inputs.nth(1).press('ArrowLeft')
      await expect(inputs.nth(0)).toBeFocused()
    })
  })
})
