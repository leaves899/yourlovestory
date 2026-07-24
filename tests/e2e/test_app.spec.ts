import { expect, test, type Page } from '@playwright/test'
import { injectMockElectronAPI } from './mock-electron-api'

async function completeOnboarding(page: Page) {
  await page.goto('/#/journal')
  await expect(page.getByTestId('onboarding-page')).toBeVisible()

  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-name').fill('夏夏')
  await page.getByTestId('onboarding-nickname').fill('小夏')
  await page.getByTestId('onboarding-description').fill('最近开始频繁聊天的同事')
  await page.getByTestId('onboarding-next').click()

  await page.getByTestId('onboarding-phase-2').click()
  await page.getByTestId('onboarding-next').click()

  await expect(page.getByTestId('onboarding-finish')).toBeVisible()
  await page.getByTestId('onboarding-finish').click()
}

test.describe('首次上手体验', () => {
  test.beforeEach(async ({ page }) => {
    await injectMockElectronAPI(page)
    await page.goto('/')
  })

  test('新用户打开应用时默认进入长篇工作台', async ({ page }) => {
    await expect(page).toHaveURL(/#\/workbench\/projects$/)
    await expect(page.getByTestId('workbench-shell')).toBeVisible()
    await expect(page.getByTestId('project-name-input')).toBeVisible()
  })

  test('旧恋爱日记入口仍会进入 onboarding', async ({ page }) => {
    await page.goto('/#/journal')
    await expect(page).toHaveURL(/#\/onboarding$/)
    await expect(page.getByTestId('onboarding-page')).toBeVisible()
    await expect(page.getByText('你的数据只保存在本地')).toBeVisible()
  })

  test('完成 onboarding 后进入关系页并看到首次上手 CTA', async ({ page }) => {
    await completeOnboarding(page)

    await expect(page).toHaveURL(/#\/progress$/)
    await expect(page.getByTestId('progress-page')).toBeVisible()
    await expect(page.getByTestId('progress-first-use')).toBeVisible()
    await expect(page.getByTestId('progress-current-phase')).toContainText('暧昧')
    await expect(page.getByTestId('progress-cta-fragment')).toBeVisible()
    await expect(page.getByTestId('progress-cta-day')).toBeVisible()

    const progressStore = await page.evaluate(() => (window as any).__mockProgressStore)
    const slugs = Object.keys(progressStore)
    expect(slugs).toHaveLength(1)
    expect(progressStore[slugs[0]].current_phase).toBe(2)
    expect(progressStore[slugs[0]].total_narratives).toBe(0)
  })

  test('完成 onboarding 后可以记录第一条碎片', async ({ page }) => {
    await completeOnboarding(page)

    await page.getByTestId('progress-cta-fragment').click()
    await expect(page.getByTestId('fragment-page')).toBeVisible()

    await page.getByTestId('open-record-fragment').click()
    await page.getByTestId('fragment-origin').selectOption('crush')
    await page.getByTestId('fragment-mood').selectOption('positive')
    await page.getByTestId('fragment-content').fill('她今天主动问我要不要一起吃午饭')
    await page.getByTestId('fragment-submit').click()

    await expect(
      page.getByTestId('fragment-page').getByText('她今天主动问我要不要一起吃午饭')
    ).toBeVisible()

    const calls = await page.evaluate(() => (window as any).__mockCalls)
    const recordCall = calls.find((call: any) => call.channel === 'fragment:record')
    expect(recordCall).toBeDefined()
    expect(recordCall.params.slug).toBe('小夏')
    expect(recordCall.params.origin).toBe('crush')
    expect(recordCall.params.mood).toBe('positive')
  })

  test('Day 生成后检测到可推进阶段时显示提示卡', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByTestId('progress-cta-day').click()
    await expect(page.getByTestId('day-page')).toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__mockGenerateDayResponse = {
        success: true,
        data: {
          slug: '小夏',
          day_number: 1,
          content: 'Mock day content',
          summary: '一起散步',
          relationship: {
            signals: [],
            shouldTransition: true,
            transitionMessage: '关系已经可以往下一阶段确认了。',
            progress: {
              crush_slug: '小夏',
              current_phase: 2,
              phase_name: '暧昧',
              total_narratives: 1,
              interaction_narratives: 1,
              flirting_signals: 1,
              accumulated_score: 70,
              threshold: 70,
              signals: [],
              phase_history: [
                {
                  phase: 2,
                  phase_name: '暧昧',
                  started_at: '2026-01-01T00:00:00.000Z',
                  narrative_count: 1,
                },
              ],
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
            },
          },
        },
      }
    })

    await page.getByTestId('open-generate-day').click()
    await page.getByTestId('day-number-input').fill('1')
    await page.getByTestId('day-summary-input').fill('一起散步')
    await page.getByTestId('submit-generate-day').click()

    await expect(page.getByTestId('day-relationship-alert')).toBeVisible()
    await expect(page.getByTestId('day-relationship-alert')).toContainText(
      '关系已经可以往下一阶段确认了。'
    )
    await expect(page.getByTestId('day-relationship-alert-cta')).toBeVisible()
  })

  test('Day 生成成功但关系同步失败时显示 warning toast', async ({ page }) => {
    await completeOnboarding(page)
    await page.getByTestId('progress-cta-day').click()
    await expect(page.getByTestId('day-page')).toBeVisible()

    await page.evaluate(() => {
      ;(window as any).__mockGenerateDayResponse = {
        success: true,
        data: {
          slug: '小夏',
          day_number: 1,
          content: 'Mock day content',
          summary: '一起散步',
        },
        warnings: ['关系进度更新失败: disk full'],
      }
    })

    await page.getByTestId('open-generate-day').click()
    await page.getByTestId('day-number-input').fill('1')
    await page.getByTestId('day-summary-input').fill('一起散步')
    await page.getByTestId('submit-generate-day').click()

    await expect(page.getByText('Day 已生成，但关系进度未能同步')).toBeVisible()
    await expect(page.getByText('关系进度更新失败: disk full')).toBeVisible()
  })
})
