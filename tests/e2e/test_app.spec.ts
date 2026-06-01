import { test, expect } from '@playwright/test'

test.describe('yourcrush App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
  })

  test('should display sidebar', async ({ page }) => {
    await expect(page.locator('text=yourcrush')).toBeVisible()
    await expect(page.locator('text=日常写作')).toBeVisible()
    await expect(page.locator('text=碎片日记')).toBeVisible()
    await expect(page.locator('text=角色管理')).toBeVisible()
    await expect(page.locator('text=设置')).toBeVisible()
    await expect(page.locator('text=帮助')).toBeVisible()
    await expect(page.locator('text=更新')).toBeVisible()
  })

  test('should navigate to day page', async ({ page }) => {
    await page.click('text=日常写作')
    await expect(page.locator('text=日常写作')).toBeVisible()
  })

  test('should navigate to fragment page', async ({ page }) => {
    await page.click('text=碎片日记')
    await expect(page.locator('text=碎片日记')).toBeVisible()
  })

  test('should navigate to crush page', async ({ page }) => {
    await page.click('text=角色管理')
    await expect(page.locator('text=角色管理')).toBeVisible()
  })

  test('should navigate to settings page', async ({ page }) => {
    await page.click('text=设置')
    await expect(page.locator('text=设置')).toBeVisible()
  })

  test('should navigate to help page', async ({ page }) => {
    await page.click('text=帮助')
    await expect(page.locator('text=帮助')).toBeVisible()
  })

  test('should navigate to update page', async ({ page }) => {
    await page.click('text=更新')
    await expect(page.locator('text=更新')).toBeVisible()
  })
})
