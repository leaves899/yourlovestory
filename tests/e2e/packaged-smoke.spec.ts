import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

interface RunRecord {
  run: number
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  exitSignal?: NodeJS.Signals | null
  crashed: boolean
  crashMessage?: string
  stdoutFile: string
  stderrFile: string
  mainLogFile: string
  electronLogFile: string
  crashLogFile: string
  screenshotFile: string
  traceFile: string
}

interface SmokeReport {
  schemaVersion: 1
  status: 'passed' | 'failed'
  platform: NodeJS.Platform
  arch: string
  node: string
  executable: string
  isPackaged?: boolean
  appPath?: string
  appVersion?: string
  electronVersion?: string
  userDataPath: string
  databasePath: string
  nativeSqliteLoaded: boolean
  checks: {
    window: boolean
    fileProtocol: boolean
    preloadBridge: boolean
    ipc: boolean
    databaseReady: boolean
    projectCreated: boolean
    persistedAfterRestart: boolean
    gracefulExit: boolean
  }
  projectId?: string
  projectSlug?: string
  runs: RunRecord[]
  errors: string[]
  startedAt: string
  endedAt?: string
}

const rootDir = path.resolve(__dirname, '..', '..')
const artifactDir = path.resolve(
  process.env.YOURCRUSH_PACKAGED_SMOKE_ARTIFACT_DIR
    ?? path.join(rootDir, 'test-results', 'packaged-smoke', process.platform),
)
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-packaged-smoke-'))
const databasePath = path.join(userDataPath, 'data', 'yourcrush.sqlite')
const executable = resolvePackagedExecutable()
const reportPath = path.join(artifactDir, 'smoke-report.json')
const report: SmokeReport = {
  schemaVersion: 1,
  status: 'failed',
  platform: process.platform,
  arch: process.arch,
  node: process.version,
  executable,
  userDataPath,
  databasePath,
  nativeSqliteLoaded: false,
  checks: {
    window: false,
    fileProtocol: false,
    preloadBridge: false,
    ipc: false,
    databaseReady: false,
    projectCreated: false,
    persistedAfterRestart: false,
    gracefulExit: false,
  },
  runs: [],
  errors: [],
  startedAt: new Date().toISOString(),
}

const liveApplications: Array<{ application: ElectronApplication; page?: Page; run: RunRecord }> = []
const runBuffers = new Map<number, { stdout: string[]; stderr: string[]; mainLog: string[] }>()

test('真实 packaged Electron 启动、IPC、native SQLite、持久化和退出闭环', async () => {
  fs.mkdirSync(artifactDir, { recursive: true })
  const projectSlug = `packaged-smoke-${process.pid}-${Date.now()}`
  report.projectSlug = projectSlug

  try {
    assertPackagedExecutable()
    const first = await launchPackaged(1)
    await verifyWindowAndBridge(first.page)
    const firstState = await readDatabaseState(first.page)
    report.checks.databaseReady = firstState.ready
    report.nativeSqliteLoaded = firstState.ready
    expect(firstState.ready, firstState.message ?? 'packaged database is not ready').toBe(true)

    const created = await first.page.evaluate(async (slug) => {
      const response = await window.electronAPI.createNovelProject({
        slug,
        name: 'Packaged smoke project',
        description: 'Synthetic data created by the packaged Electron smoke test.',
        select_after_create: true,
      })
      return response
    }, projectSlug)
    expect(created.success, JSON.stringify(created)).toBe(true)
    expect(created.data?.slug).toBe(projectSlug)
    report.projectId = created.data?.id
    report.checks.projectCreated = true
    const listed = await first.page.evaluate(() => window.electronAPI.listNovelProjects())
    expect(listed.success, JSON.stringify(listed)).toBe(true)
    expect(listed.data?.some((project) => project.slug === projectSlug)).toBe(true)
    report.checks.ipc = true

    await closePackaged(first)
    expect(fs.existsSync(databasePath), `database was not created at ${databasePath}`).toBe(true)

    const second = await launchPackaged(2)
    await verifyWindowAndBridge(second.page)
    const secondState = await readDatabaseState(second.page)
    expect(secondState.ready, secondState.message ?? 'database did not recover after restart').toBe(true)
    const persisted = await second.page.evaluate(async (slug) => {
      const response = await window.electronAPI.listNovelProjects()
      return { response, found: response.data?.some((project) => project.slug === slug) ?? false }
    }, projectSlug)
    expect(persisted.response.success, JSON.stringify(persisted.response)).toBe(true)
    expect(persisted.found).toBe(true)
    report.checks.persistedAfterRestart = true
    await closePackaged(second)
    report.checks.gracefulExit = report.runs.every((run) => run.exitCode === 0 && run.exitSignal === null && !run.crashed)
    expect(report.checks.gracefulExit).toBe(true)
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    report.errors.push(message)
    throw error
  } finally {
    await closeLiveApplications()
    await writeRunArtifacts()
    report.endedAt = new Date().toISOString()
    report.status = report.errors.length === 0 ? 'passed' : 'failed'
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    // The report keeps the path and database existence evidence.  Do not leave
    // synthetic user data in the runner's real profile or on a developer host.
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
})

async function launchPackaged(runNumber: number): Promise<{ application: ElectronApplication; page: Page; run: RunRecord }> {
  fs.mkdirSync(artifactDir, { recursive: true })
  const run: RunRecord = {
    run: runNumber,
    startedAt: new Date().toISOString(),
    crashed: false,
    stdoutFile: path.join(artifactDir, `run-${runNumber}.stdout.log`),
    stderrFile: path.join(artifactDir, `run-${runNumber}.stderr.log`),
    mainLogFile: path.join(artifactDir, `run-${runNumber}.main.log`),
    electronLogFile: path.join(artifactDir, `run-${runNumber}.electron.log`),
    crashLogFile: path.join(artifactDir, `run-${runNumber}.crash.log`),
    screenshotFile: path.join(artifactDir, `run-${runNumber}.png`),
    traceFile: path.join(artifactDir, `run-${runNumber}.trace.zip`),
  }
  report.runs.push(run)
  const stdout: string[] = []
  const stderr: string[] = []
  const mainLog: string[] = []
  runBuffers.set(runNumber, { stdout, stderr, mainLog })
  const application = await electron.launch({
    executablePath: executable,
    cwd: path.dirname(executable),
    args: ['--disable-gpu', '--enable-logging=file', `--log-file=${run.electronLogFile}`],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      YOURCRUSH_E2E_USER_DATA: userDataPath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ELECTRON_ENABLE_LOGGING: 'true',
    },
    artifactsDir: artifactDir,
  }).catch((error: unknown) => {
    run.crashed = true
    run.crashMessage = error instanceof Error ? error.stack ?? error.message : String(error)
    run.endedAt = new Date().toISOString()
    stderr.push(run.crashMessage)
    throw error
  })
  const child = application.process()
  child.stdout?.on('data', (chunk: Buffer | string) => stdout.push(String(chunk)))
  child.stderr?.on('data', (chunk: Buffer | string) => stderr.push(String(chunk)))
  child.once('exit', (code, signal) => {
    run.exitCode = code
    run.exitSignal = signal
    run.endedAt = new Date().toISOString()
    if (code !== 0 || signal) {
      run.crashed = true
      run.crashMessage = `electron exited with code=${String(code)} signal=${String(signal)}`
    }
  })
  application.on('console', async (message) => {
    mainLog.push(`[${message.type()}] ${message.text()}`)
  })
  application.once('close', () => {
    run.endedAt ??= new Date().toISOString()
  })
  liveApplications.push({ application, run })
  const metadata = await application.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    version: app.getVersion(),
    electron: process.versions.electron,
    userData: app.getPath('userData'),
  }))
  report.isPackaged = metadata.isPackaged
  report.appPath = metadata.appPath
  report.appVersion = metadata.version
  report.electronVersion = metadata.electron
  expect(metadata.isPackaged, 'smoke must launch an electron-builder packaged app').toBe(true)
  expect(metadata.appPath).toMatch(/app\.asar$/)
  expect(path.resolve(metadata.userData)).toBe(path.resolve(userDataPath))
  await application.context().tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await application.firstWindow({ timeout: 60_000 })
  page.on('crash', () => {
    run.crashed = true
    run.crashMessage = 'renderer page crashed'
  })
  page.on('pageerror', (error) => {
    mainLog.push(`[pageerror] ${error.stack ?? error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') mainLog.push(`[renderer:${message.type()}] ${message.text()}`)
  })
  const record = liveApplications[liveApplications.length - 1]
  record.page = page
  return { application, page, run }
}

async function verifyWindowAndBridge(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('body')).toBeVisible()
  report.checks.window = true
  const url = page.url()
  report.checks.fileProtocol = url.startsWith('file://')
  expect(report.checks.fileProtocol, `packaged app loaded ${url}; expected file://`).toBe(true)
  const bridge = await page.evaluate(() => ({
    listNovelProjects: typeof window.electronAPI?.listNovelProjects === 'function',
    createNovelProject: typeof window.electronAPI?.createNovelProject === 'function',
    getDatabaseStatus: typeof window.electronAPI?.getDatabaseStatus === 'function',
  }))
  report.checks.preloadBridge = Object.values(bridge).every(Boolean)
  expect(bridge).toEqual({ listNovelProjects: true, createNovelProject: true, getDatabaseStatus: true })
}

async function readDatabaseState(page: Page): Promise<{ ready: boolean; message: string | null }> {
  await expect.poll(
    () => page.evaluate(() => window.electronAPI.getDatabaseStatus()),
    { timeout: 45_000, intervals: [250, 500, 1_000] },
  ).toMatchObject({ success: true, data: { state: 'ready', integrity: 'ok' } })
  const value = await page.evaluate(() => window.electronAPI.getDatabaseStatus())
  return {
    ready: value.success && value.data?.state === 'ready' && value.data.integrity === 'ok',
    message: value.error?.message ?? value.data?.message ?? null,
  }
}

async function closePackaged(target: { application: ElectronApplication; page?: Page; run: RunRecord }): Promise<void> {
  await target.page?.screenshot({ path: target.run.screenshotFile }).catch(() => undefined)
  await target.application.context().tracing.stop({ path: target.run.traceFile }).catch((error: unknown) => {
    report.errors.push(`trace stop failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  await target.application.close()
  const index = liveApplications.findIndex((entry) => entry.application === target.application)
  if (index >= 0) liveApplications.splice(index, 1)
  await expect.poll(() => target.run.exitCode).toBe(0)
  expect(target.run.exitSignal).toBeNull()
  expect(target.run.crashed, target.run.crashMessage).toBe(false)
}

async function closeLiveApplications(): Promise<void> {
  for (const target of [...liveApplications]) {
    await closePackaged({ application: target.application, page: target.page, run: target.run }).catch((error: unknown) => {
      report.errors.push(`application close failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

async function writeRunArtifacts(): Promise<void> {
  for (const run of report.runs) {
    const buffers = runBuffers.get(run.run)
    fs.writeFileSync(run.stdoutFile, buffers?.stdout.join('') ?? '', 'utf8')
    fs.writeFileSync(run.stderrFile, buffers?.stderr.join('') ?? '', 'utf8')
    const mainLog = [
      ...(buffers?.mainLog ?? []),
      ...(buffers?.stdout ?? []),
      ...(buffers?.stderr ?? []),
    ].join('\n')
    fs.writeFileSync(run.mainLogFile, mainLog, 'utf8')
    fs.writeFileSync(run.crashLogFile, run.crashed ? run.crashMessage ?? 'Electron process/renderer crashed.' : '', 'utf8')
  }
}

function assertPackagedExecutable(): void {
  if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) {
    throw new Error(
      `Packaged executable not found: ${executable}. Build with electron-builder before running this suite.`,
    )
  }
}

function resolvePackagedExecutable(): string {
  const explicit = process.env.YOURCRUSH_PACKAGED_EXECUTABLE
  if (explicit) return path.resolve(explicit)
  const releaseDir = path.join(rootDir, 'release')
  const candidates: string[] = []
  if (process.platform === 'win32') {
    candidates.push(path.join(releaseDir, 'win-unpacked', 'yourcrush.exe'))
  } else if (process.platform === 'darwin') {
    candidates.push(path.join(releaseDir, 'mac', 'yourcrush.app', 'Contents', 'MacOS', 'yourcrush'))
    candidates.push(path.join(releaseDir, 'mac-arm64', 'yourcrush.app', 'Contents', 'MacOS', 'yourcrush'))
    candidates.push(path.join(releaseDir, 'mac-x64', 'yourcrush.app', 'Contents', 'MacOS', 'yourcrush'))
  } else {
    candidates.push(path.join(releaseDir, 'linux-unpacked', 'yourcrush'))
  }
  const existing = candidates.find((candidate) => fs.existsSync(candidate))
  if (existing) return existing
  // Keep the failure actionable while allowing artifactName changes to use a
  // platform-specific executable name in future electron-builder versions.
  const fallback = findExecutable(releaseDir)
  return fallback ?? candidates[0]
}

function findExecutable(directory: string): string | null {
  if (!fs.existsSync(directory)) return null
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = findExecutable(absolute)
      if (nested) return nested
    } else if (
      (process.platform === 'win32' && entry.name.toLowerCase() === 'yourcrush.exe')
      || (process.platform !== 'win32' && entry.name === 'yourcrush')
    ) {
      return absolute
    }
  }
  return null
}
