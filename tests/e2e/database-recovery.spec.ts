import { expect, test } from '@playwright/test'
import { injectMockElectronAPI } from './mock-electron-api'

test('recovery gate blocks business initialization and exposes verified restore controls', async ({
  page,
}) => {
  const backup = {
    id: 'backup-1',
    filename: 'backup-1.sqlite',
    createdAt: '2026-03-01T00:00:00.000Z',
    reason: 'manual' as const,
    appVersion: '0.2.0-alpha.1',
    schemaVersion: 8,
    size: 1024,
    sha256: 'a'.repeat(64),
  }
  await injectMockElectronAPI(page, {
    databaseState: 'recovery-required',
    backups: [backup],
  })
  await page.goto('/')

  await expect(page.getByTestId('database-recovery-page')).toBeVisible()
  await expect(page.getByTestId('recovery-status')).toContainText('数据库需要恢复')
  await expect(page.getByTestId('recovery-verify-backup-1')).toBeVisible()

  const callsBefore = await page.evaluate(() => (
    window as typeof window & { __mockCalls: Array<{ channel: string }> }
  ).__mockCalls)
  expect(callsBefore.some((call) => call.channel.startsWith('workbench:'))).toBe(false)

  await page.getByTestId('recovery-verify-backup-1').click()
  await expect(page.getByText('校验通过')).toBeVisible()

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByTestId('recovery-restore-backup-1').click()
  let calls = await page.evaluate(() => (
    window as typeof window & { __mockCalls: Array<{ channel: string }> }
  ).__mockCalls)
  expect(calls.some((call) => call.channel === 'backup:restore')).toBe(false)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('recovery-restore-backup-1').click()
  calls = await page.evaluate(() => (
    window as typeof window & { __mockCalls: Array<{ channel: string }> }
  ).__mockCalls)
  expect(calls.some((call) => call.channel === 'backup:restore')).toBe(true)
})
