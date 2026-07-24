import { test, expect } from '@playwright/test'

test.describe('NumberField Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/number-field.html')
    await page.waitForSelector('#numberfield-container')
  })

  test('should render with default value', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    await expect(input).toHaveValue('25') // Default value

    const currentValue = page.locator('#current-value')
    await expect(currentValue).toHaveText('25')
  })

  test('should increment value when increment button is clicked', async ({
    page
  }) => {
    const input = page.locator('.numberfield-input')
    const incrementBtn = page.locator('.numberfield-increment')
    const currentValue = page.locator('#current-value')

    // Initial state
    await expect(input).toHaveValue('25')
    await expect(currentValue).toHaveText('25')

    // Click increment button
    await incrementBtn.click()

    // Should increment by 1 (step)
    await expect(input).toHaveValue('26')
    await expect(currentValue).toHaveText('26')
  })

  test('should decrement value when decrement button is clicked', async ({
    page
  }) => {
    const input = page.locator('.numberfield-input')
    const decrementBtn = page.locator('.numberfield-decrement')
    const currentValue = page.locator('#current-value')

    // Initial state
    await expect(input).toHaveValue('25')
    await expect(currentValue).toHaveText('25')

    // Click decrement button
    await decrementBtn.click()

    // Should decrement by 1 (step)
    await expect(input).toHaveValue('24')
    await expect(currentValue).toHaveText('24')
  })

  test('should update value when typing in input', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    const currentValue = page.locator('#current-value')

    // Initially 25
    await expect(input).toHaveValue('25')
    await expect(currentValue).toHaveText('25')

    // Clear and type new value
    await input.fill('42')
    await input.blur() // Trigger change

    await expect(input).toHaveValue('42')
    await expect(currentValue).toHaveText('42')
  })

  test('should clamp value to max when exceeding max', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    const incrementBtn = page.locator('.numberfield-increment')
    const currentValue = page.locator('#current-value')

    // Set max to 100, start at 99
    await page.evaluate(() => {
      // Reset to a known state with value 99
      ;(window as any).initNumberField(99)
    })

    await expect(input).toHaveValue('99')

    // Click increment to go to 100 (max)
    await incrementBtn.click()
    await expect(input).toHaveValue('100')
    await expect(currentValue).toHaveText('100')

    // Another click should not exceed max
    await incrementBtn.click()
    await expect(input).toHaveValue('100')
    await expect(currentValue).toHaveText('100')
  })

  test('should clamp value to min when below min', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    const decrementBtn = page.locator('.numberfield-decrement')
    const currentValue = page.locator('#current-value')

    // Set min to 0, start at 1
    await page.evaluate(() => {
      // Reset to a known state with value 1
      ;(window as any).initNumberField(1)
    })

    await expect(input).toHaveValue('1')

    // Click decrement to go to 0 (min)
    await decrementBtn.click()
    await expect(input).toHaveValue('0')
    await expect(currentValue).toHaveText('0')

    // Another click should not go below min
    await decrementBtn.click()
    await expect(input).toHaveValue('0')
    await expect(currentValue).toHaveText('0')
  })

  test('should be disabled when disabled property is set', async ({ page }) => {
    // Toggle to disable first
    await page.locator('#disable-btn').click()

    const input = page.locator('.numberfield-input')
    const incrementBtn = page.locator('.numberfield-increment')
    const decrementBtn = page.locator('.numberfield-decrement')

    // Check that input is disabled
    await expect(input).toBeDisabled()

    // Check that buttons are disabled
    await expect(incrementBtn).toBeDisabled()
    await expect(decrementBtn).toBeDisabled()

    // Try to click increment - value should not change
    const originalValue = await page.locator('#current-value').textContent()
    await incrementBtn.click()

    // Value should remain the same
    await expect(page.locator('#current-value')).toHaveText(originalValue)
  })

  test('should update value via test control buttons', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    const currentValue = page.locator('#current-value')

    // Use the "Set value to 50" button
    await page.locator('#set-50-btn').click()

    await expect(input).toHaveValue('50')
    await expect(currentValue).toHaveText('50')
  })

  test('should reset to default when reset button is clicked', async ({
    page
  }) => {
    const input = page.locator('.numberfield-input')
    const currentValue = page.locator('#current-value')

    // Change value first
    await input.fill('75')
    await input.blur()

    await expect(input).toHaveValue('75')
    await expect(currentValue).toHaveText('75')

    // Now reset
    await page.locator('#reset-btn').click()

    // Should go back to default (25)
    await expect(input).toHaveValue('25')
    await expect(currentValue).toHaveText('25')
  })

  test('should handle decimal values properly', async ({ page }) => {
    const input = page.locator('.numberfield-input')
    const currentValue = page.locator('#current-value')

    // Change to a decimal value
    await input.fill('10.5')
    await input.blur()

    await expect(input).toHaveValue('10.5')
    await expect(currentValue).toHaveText('10.5')

    // Increment should work with decimals too
    const incrementBtn = page.locator('.numberfield-increment')
    await incrementBtn.click()

    await expect(input).toHaveValue('11.5')
    await expect(currentValue).toHaveText('11.5')
  })
})
