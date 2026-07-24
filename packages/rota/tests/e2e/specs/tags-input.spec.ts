import { test, expect } from '@playwright/test'

test.describe('TagsInput', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tags-input.html')
  })

  test.describe('rendering', () => {
    test('should render basic tags input with listbox role', async ({
      page
    }) => {
      const tagsInput = page.locator('#tags-input-1 [role="listbox"]')
      await expect(tagsInput).toBeVisible()
      await expect(tagsInput).toHaveAttribute('aria-label', 'Tags')
      await expect(tagsInput).toHaveAttribute('aria-multiselectable', 'true')
    })

    test('should render input field', async ({ page }) => {
      const input = page.locator('#tags-input-1 input')
      await expect(input).toBeVisible()
      await expect(input).toHaveAttribute('type', 'text')
    })

    test('should render tags from default value', async ({ page }) => {
      const tags = page.locator('#tags-input-2 [role="option"]')
      await expect(tags).toHaveCount(3)
    })

    test('should render disabled tags input', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-3 [role="listbox"]')
      await expect(tagsInput).toHaveAttribute('aria-disabled', 'true')
      await expect(tagsInput).toHaveAttribute('data-disabled', '')
    })
  })

  test.describe('interaction', () => {
    test('should add tag on Enter key', async ({ page }) => {
      const input = page.locator('#tags-input-1 input')
      await input.fill('new-tag')
      await input.press('Enter')

      const tags = page.locator('#tags-input-1 [role="option"]')
      await expect(tags).toHaveCount(1)
    })

    test('should not add empty tag on Enter key', async ({ page }) => {
      const input = page.locator('#tags-input-1 input')
      await input.press('Enter')

      const tags = page.locator('#tags-input-1 [role="option"]')
      await expect(tags).toHaveCount(0)
    })

    test('should not add tag when max is reached', async ({ page }) => {
      const input = page.locator('#tags-input-4 input')
      await input.fill('tag2')
      await input.press('Enter')

      const tags = page.locator('#tags-input-4 [role="option"]')
      await expect(tags).toHaveCount(2)

      // Try to add another tag
      await input.fill('tag3')
      await input.press('Enter')

      // Should still have 2 tags
      await expect(tags).toHaveCount(2)
    })

    test('should remove tag on delete button click', async ({ page }) => {
      const deleteBtn = page.locator('#tags-input-2 .tag-delete').first()
      await deleteBtn.click()

      const tags = page.locator('#tags-input-2 [role="option"]')
      await expect(tags).toHaveCount(2)
    })
  })

  test.describe('keyboard navigation', () => {
    test('should focus last tag on ArrowLeft', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-2 [role="listbox"]')
      await tagsInput.click()
      await tagsInput.press('ArrowLeft')

      const lastTag = page.locator('#tags-input-2 [role="option"]').last()
      await expect(lastTag).toHaveAttribute('data-state', 'selected')
    })

    test('should navigate between tags with ArrowLeft/ArrowRight', async ({
      page
    }) => {
      const tagsInput = page.locator('#tags-input-2 [role="listbox"]')
      await tagsInput.click()

      // Move to last tag
      await tagsInput.press('ArrowLeft')
      const lastTag = page.locator('#tags-input-2 [role="option"]').last()
      await expect(lastTag).toHaveAttribute('data-state', 'selected')

      // Move to previous tag
      await tagsInput.press('ArrowLeft')
      const middleTag = page.locator('#tags-input-2 [role="option"]').nth(1)
      await expect(middleTag).toHaveAttribute('data-state', 'selected')

      // Move to next tag
      await tagsInput.press('ArrowRight')
      await expect(lastTag).toHaveAttribute('data-state', 'selected')
    })

    test('should delete focused tag with Delete key', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-2 [role="listbox"]')
      await tagsInput.click()
      await tagsInput.press('ArrowLeft')
      await tagsInput.press('Delete')

      const tags = page.locator('#tags-input-2 [role="option"]')
      await expect(tags).toHaveCount(2)
    })

    test('should delete focused tag with Backspace key', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-2 [role="listbox"]')
      await tagsInput.click()
      await tagsInput.press('ArrowLeft')
      await tagsInput.press('Backspace')

      const tags = page.locator('#tags-input-2 [role="option"]')
      await expect(tags).toHaveCount(2)
    })
  })

  test.describe('accessibility', () => {
    test('should have correct role and aria attributes', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-1 [role="listbox"]')
      await expect(tagsInput).toHaveAttribute('role', 'listbox')
      await expect(tagsInput).toHaveAttribute('aria-label', 'Tags')
      await expect(tagsInput).toHaveAttribute('aria-multiselectable', 'true')
    })

    test('should have tabindex="0" for keyboard focus', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-1 [role="listbox"]')
      await expect(tagsInput).toHaveAttribute('tabindex', '0')
    })

    test('should have role="option" for tags', async ({ page }) => {
      // Add a tag first
      const input = page.locator('#tags-input-1 input')
      await input.fill('test-tag')
      await input.press('Enter')

      const tag = page.locator('#tags-input-1 [role="option"]')
      await expect(tag).toHaveAttribute('role', 'option')
    })

    test('should have aria-selected on tags', async ({ page }) => {
      const tagsInput = page.locator('#tags-input-2 [role="listbox"]')
      await tagsInput.click()
      await tagsInput.press('ArrowLeft')

      const selectedTag = page.locator('#tags-input-2 [role="option"]').last()
      await expect(selectedTag).toHaveAttribute('aria-selected', 'true')
    })
  })
})
