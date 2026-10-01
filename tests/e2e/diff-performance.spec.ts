import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

interface ProbeWindow extends Window {
  __diffProbe: { running: boolean; frames: number[]; ipc: number[]; progress: number[]; lastFrame: number; unsubscribe: () => void; cancelRequested: boolean; cancelTimer?: number }
}

const artifacts = path.resolve('test-results/diff-performance')
const report: Record<string, unknown> = { node: process.version, platform: process.platform, paragraphs: 10000,
  renderer_frame_p95_limit_ms: 200, main_ipc_p95_limit_ms: 200, cancel_limit_ms: 1000 }
let application: ElectronApplication
let page: Page
let userData: string
let fixture: { projectId: string; chapterId: string; outlineId: string; versions: string[]; revisions: string[] }

test.beforeAll(async () => {
  fs.mkdirSync(artifacts, { recursive: true })
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-real-diff-'))
  application = await electron.launch({ args: ['--disable-gpu', path.resolve('.')], cwd: path.resolve('.'),
    env: { ...process.env, NODE_ENV: 'test', YOURCRUSH_E2E_USER_DATA: userData, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' } })
  page = await application.firstWindow()
  await expect.poll(() => page.evaluate(() => window.electronAPI.getDatabaseStatus()), { timeout: 30000 })
    .toMatchObject({ data: { state: 'ready' } })
  const databaseRoot = userData
  const fixtureScript = path.join(userData, 'create-diff-fixture.cjs')
  fs.writeFileSync(fixtureScript, String.raw`
const path = require('node:path')
const { openDatabase } = require(${JSON.stringify(path.resolve('dist/main/main/database/database.js'))})
const { createWorkbenchService } = require(${JSON.stringify(path.resolve('dist/main/main/workbench/workbenchService.js'))})
const { assignStableBlockIds } = require(${JSON.stringify(path.resolve('dist/main/shared/narrativeWorkbench/blocks.js'))})
const db = openDatabase(${JSON.stringify(databaseRoot)})
try {
      const workbench = createWorkbenchService(db)
      const project = workbench.createProject({ name: '性能合成项目', slug: 'synthetic-performance', select_after_create: true })
      const volume = workbench.createVolume({ project_id: project.id, volume_number: 1, title: '合成卷' })
      const outline = workbench.createChapterOutline({ project_id: project.id, volume_id: volume.id,
        chapter_number: 1, title: '合成章节' })
      const paragraphPadding = 'x'.repeat(512)
      const before = Array.from({ length: 10000 }, (_, index) => '合成段落 ' + index + '：雾港调查记录 ' + paragraphPadding).join('\n\n')
      const after = before.split('\n\n').map((item, index) => index % 10 === 0 ? item + '修订' : item).join('\n\n')
      const chapter = workbench.chapters.create({ project_id: project.id, chapter_number: 1,
        title: '合成章节', content: before, status: 'completed' })
      const factCheck = { passed: true, summary: '合成报告', findings: [] }
      const versions = [before, after].map((content) => workbench.chapterVersions.create({ chapter_id: chapter.id,
        content, summary: '合成摘要', fact_check: factCheck }).id)
      const beforeBlocks = assignStableBlockIds(chapter.id, before)
      const afterBlocks = assignStableBlockIds(chapter.id, after, beforeBlocks)
      const revisions = [beforeBlocks, afterBlocks].map((blocks, index) => workbench.chapterRevisions.create({
        chapter_id: chapter.id, content: index === 0 ? before : after, blocks, operation: 'manual', summary: '合成修订' }).id)
      workbench.chapterRevisions.setCurrent(revisions[0])
      const characters = Array.from({ length: 1001 }, (_, index) => workbench.characters.create({
        project_id: project.id, name: '合成角色' + index }))
      for (let index = 0; index < 1000; index += 1) workbench.relations.create({ project_id: project.id,
        source: { type: 'character', id: characters[index].id },
        target: { type: 'character', id: characters[index + 1].id },
        relation_type: '合作', description: '合成关系' })
      process.stdout.write(JSON.stringify({ projectId: project.id, chapterId: chapter.id, outlineId: outline.id, versions, revisions }))
} finally { db.close() }
`, 'utf8')
  const electronBinary = path.resolve('node_modules/electron/dist/electron.exe')
  fixture = JSON.parse(execFileSync(electronBinary, [fixtureScript], {
    cwd: path.resolve('.'), encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })) as typeof fixture
  expect(fixture.chapterId).not.toBe(fixture.outlineId)
  await page.reload()
  await expect.poll(() => page.evaluate(() => window.electronAPI.getDatabaseStatus()), { timeout: 30000 })
    .toMatchObject({ data: { state: 'ready' } })
}, 60000)

test.afterAll(async () => {
  fs.writeFileSync(path.join(artifacts, 'response-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await application?.close()
  if (userData) fs.rmSync(userData, { recursive: true, force: true })
})
async function beginProbe(cancelOnProgress = false) {
  await page.evaluate((shouldCancel) => {
    const runtime = window as unknown as ProbeWindow
    const state = { running: true, frames: [] as number[], ipc: [] as number[], progress: [] as number[],
      lastFrame: performance.now(), unsubscribe: () => undefined, cancelRequested: false, cancelTimer: undefined as number | undefined }
    const tryCancel = () => {
      if (!shouldCancel || state.cancelRequested) return
      if (state.progress.some((value) => value > 0 && value < 1)) {
        const button = document.querySelector('[data-testid="cancel-chapter-diff"]') as HTMLButtonElement | null
        if (button && !button.disabled) {
          state.cancelRequested = true
          button.click()
          return
        }
      }
      state.cancelTimer = window.setTimeout(tryCancel, 1)
    }
    state.unsubscribe = window.electronAPI.onChapterDiffProgress((event) => {
      state.progress.push(event.progress)
      tryCancel()
    })
    runtime.__diffProbe = state
    const frame = (time: number) => {
      state.frames.push(time - state.lastFrame); state.lastFrame = time
      if (state.running) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    const ping = async () => {
      const started = performance.now()
      await window.electronAPI.getAppInfo()
      state.ipc.push(performance.now() - started)
      if (state.running) setTimeout(() => { void ping() }, 10)
    }
    void ping()
    if (shouldCancel) tryCancel()
  }, cancelOnProgress)
}

async function endProbe() {
  return page.evaluate(() => {
    const state = (window as unknown as ProbeWindow).__diffProbe
    state.running = false; state.unsubscribe()
    if (state.cancelTimer !== undefined) window.clearTimeout(state.cancelTimer)
    const stats = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b)
      return { count: values.length, p50_ms: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95_ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
        max_ms: sorted.at(-1) ?? 0 }
    }
    return { frame: stats(state.frames), ipc: stats(state.ipc), progress: state.progress }
  })
}

test('真实 Electron 大版本 diff 可取消、进度持续推进，完成后分页且主进程和窗口保持响应', async () => {
  test.setTimeout(90000)
  await page.goto('http://localhost:3000/#/workbench/revisions')
  await page.getByLabel('对比类型').selectOption('versions')
  await expect(page.getByLabel('对比起点').locator('option')).toHaveCount(3)
  await page.getByLabel('对比起点').selectOption(fixture.versions[0])
  await page.getByLabel('对比终点').selectOption(fixture.versions[1])
  await beginProbe(true)
  await page.getByRole('button', { name: '查看 diff', exact: true }).click()
  await expect(page.getByTestId('chapter-diff-progress')).toBeVisible()
  const cancelStarted = Date.now()
  await expect.poll(() => page.evaluate(() => (window as unknown as ProbeWindow).__diffProbe.progress.some((value) => value > 0 && value < 1))).toBe(true)
  await expect(page.getByText('章节对比已取消', { exact: true })).toBeVisible()
  const cancelMs = Date.now() - cancelStarted
  expect(cancelMs).toBeLessThan(1000)
  await expect(page.getByTestId('chapter-diff-result')).toHaveCount(0)
  const cancelled = await endProbe()
  report.cancelled = { ...cancelled, cancel_ms: cancelMs }
  await beginProbe()
  await page.getByRole('button', { name: '查看 diff', exact: true }).click()
  await expect(page.getByTestId('chapter-diff-result')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('修改 1000', { exact: true })).toBeVisible()
  await expect(page.getByTestId('chapter-diff-block')).toHaveCount(100)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第 2 / 100 页 · 共 10000 块')).toBeVisible()
  const completed = await endProbe()
  report.versions = completed
  expect(completed.frame.count).toBeGreaterThan(5)
  expect(completed.ipc.count).toBeGreaterThan(5)
  expect(completed.frame.p95_ms).toBeLessThan(200)
  expect(completed.ipc.p95_ms).toBeLessThan(200)
  expect(completed.progress.some((value) => value > 0 && value < 1)).toBe(true)
  await page.screenshot({ path: path.join(artifacts, 'large-diff.png') })
  await page.getByLabel('对比类型').selectOption('revisions')
  await page.getByLabel('对比起点').selectOption(fixture.revisions[0])
  await page.getByLabel('对比终点').selectOption(fixture.revisions[1])
  await page.getByRole('button', { name: '查看 diff', exact: true }).click()
  await expect(page.getByText('修改 1000', { exact: true })).toBeVisible()
  await expect(page.getByTestId('chapter-diff-block')).toHaveCount(100)
})

test('真实关系图谱列表建立 renderer 基线，区分 DOM 渲染和图计算', async () => {
  test.setTimeout(90000)
  await beginProbe()
  const started = Date.now()
  await page.getByRole('link', { name: '关系图谱', exact: true }).click()
  await expect(page.getByRole('heading', { name: '关系图谱', exact: true })).toBeVisible()
  await expect(page.getByText('合成角色999 → 合成角色1000', { exact: true })).toBeVisible()
  const metrics = await endProbe()
  report.graph = { relations: 1000, total_navigation_to_last_relation_ms: Date.now() - started, ...metrics }
  await page.getByRole('heading', { name: '关系图谱', exact: true }).screenshot({ path: path.join(artifacts, 'graph-baseline.png') })
})
