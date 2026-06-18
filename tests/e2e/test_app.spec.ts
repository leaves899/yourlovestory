import { test, expect } from '@playwright/test'
import { injectMockElectronAPI } from './mock-electron-api'

test.describe('yourcrush App', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockElectronAPI(page)
    await page.goto('/')
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

test.describe('Fragment smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockElectronAPI(page)
    await page.goto('/')
  })

  test('should record a fragment and show success toast', async ({ page }) => {
    // 导航到碎片日记页
    await page.click('text=碎片日记')
    await expect(page.locator('text=碎片日记')).toBeVisible()

    // 点击"记录碎片"按钮打开 Modal
    await page.click('text=记录碎片')

    // 等待 Modal 出现
    await expect(page.locator('text=记录碎片').first()).toBeVisible()

    // 填写表单
    await page.fill('[placeholder="输入角色标识"]', 'smoke_test')
    await page.fill('[placeholder="输入碎片内容"]', '这是一条端到端冒烟测试碎片内容')
    await page.selectOption('select>>nth=0', 'user')     // 来源
    await page.selectOption('select>>nth=1', 'positive')  // 情绪

    // 提交
    await page.click('button:has-text("记录")')

    // 验证成功 toast 出现
    const toast = page.locator('[role="alert"]')
    await expect(toast).toBeVisible({ timeout: 5000 })
    await expect(toast.locator('text=记录成功')).toBeVisible()

    // 验证 mock API 被调用
    const mockCalls = await page.evaluate(() => (window as any).__mockCalls)
    const recordCall = mockCalls.find((c: any) => c.channel === 'fragment:record')
    expect(recordCall).toBeDefined()
    expect(recordCall.params.slug).toBe('smoke_test')
    expect(recordCall.params.origin).toBe('user')
    expect(recordCall.params.mood).toBe('positive')
  })

  test('should record fragment and verify data in mock store', async ({ page }) => {
    // 导航到碎片日记页
    await page.click('text=碎片日记')

    // 打开 Modal 并填写
    await page.click('text=记录碎片')
    await page.fill('[placeholder="输入角色标识"]', 'store_test')
    await page.fill('[placeholder="输入碎片内容"]', '验证 mock store 数据')
    await page.selectOption('select>>nth=0', 'crush')
    await page.selectOption('select>>nth=1', 'mixed')

    await page.click('button:has-text("记录")')

    // 等待 toast
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 })

    // 验证 mock store 中有碎片数据
    const store = await page.evaluate(() => (window as any).__mockStore)
    expect(store.length).toBeGreaterThan(0)
    expect(store[0].slug).toBe('store_test')
    expect(store[0].origin).toBe('crush')
    expect(store[0].mood).toBe('mixed')
    expect(store[0].content).toContain('验证 mock store 数据')
  })
})