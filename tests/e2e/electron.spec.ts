import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

test.describe('真实 Electron 主进程', () => {
  let application: ElectronApplication
  let page: Page
  let userDataPath: string

  test.beforeAll(async () => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-electron-e2e-'))
    application = await electron.launch({
      args: ['--disable-gpu', path.resolve('.')],
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        YOURCRUSH_E2E_USER_DATA: userDataPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })
    page = await application.firstWindow()
    page.on('pageerror', (error) => {
      console.error(`[electron page error] ${error.message}`)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') {
        console.error(`[electron console error] ${message.text()}`)
      }
    })
    await page.waitForLoadState('domcontentloaded')
  })

  test.afterAll(async () => {
    await application?.close()
    if (userDataPath) {
      fs.rmSync(userDataPath, { recursive: true, force: true })
    }
  })

  test('preload、SQLite、项目、角色和模板资源形成真实闭环', async () => {
    await expect(page).toHaveURL(/#\/workbench\/first-chapter$/)
    await expect(page.getByTestId('workbench-shell')).toBeVisible()

    const preloadReady = await page.evaluate(() => {
      return (
        typeof window.electronAPI?.listNovelProjects === 'function'
        && typeof window.electronAPI?.createCrush === 'function'
      )
    })
    expect(preloadReady).toBe(true)

    await page.goto('http://localhost:3000/#/workbench/projects')
    await page.getByTestId('project-name-input').fill('真实主进程项目')
    await page.getByTestId('project-slug-input').fill('real-electron-project')
    await page.getByTestId('create-project-button').click()
    await expect(page.getByTestId('workbench-project-switcher')).not.toHaveValue('')

    await page.goto('http://localhost:3000/#/workbench/characters')
    await page.getByLabel('角色名').fill('测试角色')
    await page.getByLabel('叙事职责').fill('主角')
    await page.getByLabel('角色笔记').fill('来自真实 Electron E2E')
    await page.getByRole('button', { name: '保存到项目' }).click()
    await expect(page.getByText('测试角色', { exact: true })).toBeVisible()

    const crushResult = await page.evaluate(async () => {
      return window.electronAPI.createCrush({
        name: '模板测试角色',
        nickname: '模板角色',
        slug: 'template-e2e',
        gender: 'unknown',
        description: '验证完整角色上下文',
      })
    })
    expect(crushResult.success).toBe(true)

    const crushDirectory = path.join(userDataPath, 'crushes', 'template-e2e')
    for (const filename of [
      '.intimate_config',
      'CONTEXT.md',
      'INTIMATE_KNOWLEDGE.md',
      'WEEKDAY.md',
      'memory.md',
      'persona.md',
    ]) {
      expect(
        fs.existsSync(path.join(crushDirectory, filename)),
        `新角色缺少模板资源 ${filename}`
      ).toBe(true)
    }
    expect(fs.existsSync(path.join(crushDirectory, 'SKILL.md'))).toBe(false)
    expect(fs.existsSync(path.join(userDataPath, 'data', 'yourcrush.sqlite'))).toBe(true)
  })
})
