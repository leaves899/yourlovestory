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

  await page.getByTestId('recovery-export-diagnostics').click()
  let calls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  expect(calls.some((call) => call.channel === 'diagnostics:export')).toBe(true)
  expect(calls.find((call) => call.channel === 'diagnostics:export')?.params).toBeUndefined()

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByTestId('recovery-restore-backup-1').click()
  calls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  expect(calls.some((call) => call.channel === 'backup:restore')).toBe(false)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('recovery-restore-backup-1').click()
  calls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  expect(calls.some((call) => call.channel === 'backup:restore')).toBe(true)
})

test('ready workbench dynamically enters recovery mode when status changes', async ({ page }) => {
  await injectMockElectronAPI(page)
  await page.goto('/#/workbench')
  await expect(page.getByTestId('workbench-shell')).toBeVisible()

  const initialState = await page.evaluate(() => {
    const controls = window as typeof window & {
      __mockCalls: Array<{ channel: string }>
      __databaseStatusSubscriberCount: () => number
    }
    return {
      calls: controls.__mockCalls,
      subscriberCount: controls.__databaseStatusSubscriberCount(),
    }
  })
  expect(initialState.subscriberCount).toBe(1)
  const businessCallCount = initialState.calls.filter((call) =>
    /^(workbench|task|assistant):/.test(call.channel),
  ).length

  await page.evaluate(() => (
    window as typeof window & {
      __emitDatabaseStatus: (state: 'restoring' | 'recovery-required') => void
    }
  ).__emitDatabaseStatus('restoring'))
  await expect(page.getByTestId('database-recovery-page')).toBeVisible()
  await expect(page.getByTestId('recovery-status')).toContainText('正在恢复')
  await expect(page.getByTestId('workbench-shell')).toHaveCount(0)

  await page.evaluate(() => (
    window as typeof window & {
      __emitDatabaseStatus: (state: 'restoring' | 'recovery-required') => void
    }
  ).__emitDatabaseStatus('recovery-required'))
  await expect(page.getByTestId('recovery-status')).toContainText('需要恢复')

  const callsAfter = await page.evaluate(() => (
    window as typeof window & { __mockCalls: Array<{ channel: string }> }
  ).__mockCalls)
  expect(callsAfter.filter((call) =>
    /^(workbench|task|assistant):/.test(call.channel),
  )).toHaveLength(businessCallCount)
})

test('settings data safety exposes backup policy and diagnostics export without paths', async ({
  page,
}) => {
  await injectMockElectronAPI(page, {
    backupPolicy: { maxBackups: 8, maxAgeDays: 21 },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()

  await page.getByRole('tab', { name: '数据安全' }).click()
  await expect(page.getByTestId('backup-policy-form')).toBeVisible()
  await expect(page.getByTestId('backup-policy-max-backups')).toHaveValue('8')
  await expect(page.getByTestId('backup-policy-max-age-days')).toHaveValue('21')

  await page.getByTestId('backup-policy-max-backups').fill('6')
  await page.getByTestId('backup-policy-max-age-days').fill('15')
  await page.getByTestId('backup-policy-save').click()
  await expect(page.getByTestId('backup-policy-success')).toContainText('已保存')

  const policyCalls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  const updateCall = policyCalls.find((call) => call.channel === 'backup:update-policy')
  expect(updateCall?.params).toEqual({ maxBackups: 6, maxAgeDays: 15 })
  expect(JSON.stringify(updateCall?.params)).not.toMatch(/[A-Za-z]:\\/)

  await page.getByTestId('export-diagnostics').click()
  const afterExport = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  const exportCall = afterExport.find((call) => call.channel === 'diagnostics:export')
  expect(exportCall).toBeTruthy()
  expect(exportCall?.params).toBeUndefined()
})

test('settings diagnostics cancel and failure restore the export button', async ({ page }) => {
  await injectMockElectronAPI(page, {
    diagnosticsExport: { canceled: true },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '数据安全' }).click()
  await page.getByTestId('export-diagnostics').click()
  await expect(page.getByTestId('export-diagnostics')).toBeEnabled()

  await injectMockElectronAPI(page, {
    diagnosticsExport: {
      error: { code: 'LOCAL_IO_ERROR', message: '无法安全保存诊断包，请重试。' },
    },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '数据安全' }).click()
  await page.getByTestId('export-diagnostics').click()
  await expect(page.getByTestId('export-diagnostics')).toBeEnabled()
})

const mockManualBackup = {
  id: 'mock-manual-1',
  filename: 'mock-manual-1.sqlite',
  createdAt: '2026-03-20T00:00:00.000Z',
  reason: 'manual' as const,
  appVersion: 'test',
  schemaVersion: 8,
  size: 1,
  sha256: 'a'.repeat(64),
}

test('settings backup create success shows created toast and restores button', async ({ page }) => {
  await injectMockElectronAPI(page, {
    createBackupResult: {
      backup: mockManualBackup,
      outcome: 'backup-created',
      cleanupCompleted: true,
      cleanupPartialFailure: false,
      warning: null,
      prune: {
        deleted: [],
        failed: [],
        retained: ['mock-manual-1'],
        policyExceeded: false,
      },
      cleanupSummary: {
        deletedCount: 0,
        failedCount: 0,
        retainedCount: 1,
      },
    },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '数据安全' }).click()

  const backupButton = page.getByRole('button', { name: '立即备份' })
  await expect(backupButton).toBeEnabled()
  await backupButton.click()

  await expect(page.getByText('数据库备份已创建')).toBeVisible()
  await expect(page.getByText('创建备份失败')).toHaveCount(0)
  await expect(backupButton).toBeEnabled()

  const calls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  const createCall = calls.find((call) => call.channel === 'backup:create')
  expect(createCall).toBeTruthy()
  expect(createCall?.params).toBeUndefined()
  expect(JSON.stringify(createCall)).not.toMatch(/[A-Za-z]:\\/)
})

test('settings backup cleanup partial shows warning without create failure', async ({ page }) => {
  await injectMockElectronAPI(page, {
    createBackupResult: {
      backup: mockManualBackup,
      outcome: 'backup-created-policy-cleanup-partial',
      cleanupCompleted: true,
      cleanupPartialFailure: true,
      warning: {
        code: 'BACKUP_CLEANUP_PARTIAL',
        message: '新备份已创建，但部分旧备份未清理',
      },
      prune: {
        deleted: [],
        failed: [{ id: 'old-1', error: '本地备份操作失败，请重试。' }],
        retained: ['mock-manual-1', 'old-1'],
        policyExceeded: false,
      },
      cleanupSummary: {
        deletedCount: 0,
        failedCount: 1,
        retainedCount: 2,
      },
    },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '数据安全' }).click()

  const backupButton = page.getByRole('button', { name: '立即备份' })
  await expect(backupButton).toBeEnabled()
  await backupButton.click()

  await expect(page.getByText('数据库备份已创建')).toBeVisible()
  await expect(page.getByText('新备份已创建，但部分旧备份未清理')).toBeVisible()
  await expect(page.getByText('创建备份失败')).toHaveCount(0)
  await expect(backupButton).toBeEnabled()
})

test('settings backup cleanup failed still succeeds when post-create refresh rejects', async ({
  page,
}) => {
  await injectMockElectronAPI(page, {
    failDataSafetyRefreshAfterCreate: true,
    createBackupResult: {
      backup: mockManualBackup,
      outcome: 'backup-created-policy-cleanup-failed',
      cleanupCompleted: false,
      cleanupPartialFailure: false,
      warning: {
        code: 'BACKUP_CLEANUP_FAILED',
        message: '新备份已创建，但旧备份清理失败或未完成',
      },
      prune: {
        deleted: [],
        failed: [],
        retained: [],
        policyExceeded: false,
      },
      cleanupSummary: {
        deletedCount: 0,
        failedCount: 0,
        retainedCount: 0,
      },
    },
  })
  await page.goto('/#/settings')
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible()
  await page.getByRole('tab', { name: '数据安全' }).click()

  const backupButton = page.getByRole('button', { name: '立即备份' })
  await expect(backupButton).toBeEnabled()
  await backupButton.click()

  await expect(page.getByText('数据库备份已创建')).toBeVisible()
  await expect(page.getByText('新备份已创建，但旧备份清理失败或未完成')).toBeVisible()
  await expect(page.getByText('创建备份失败')).toHaveCount(0)
  await expect(page.getByText('mock data-safety refresh failed after create')).toHaveCount(0)
  await expect(backupButton).toBeEnabled()

  const calls = await page.evaluate(() => (
    window as typeof window & {
      __mockCalls: Array<{ channel: string; params: unknown }>
    }
  ).__mockCalls)
  const createCall = calls.find((call) => call.channel === 'backup:create')
  expect(createCall).toBeTruthy()
  expect(createCall?.params).toBeUndefined()
  expect(JSON.stringify(createCall)).not.toMatch(/[A-Za-z]:\\/)
  expect(JSON.stringify(createCall)).not.toMatch(/[/\\]Users[/\\]/)
})
