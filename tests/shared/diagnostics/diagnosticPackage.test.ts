import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DiagnosticExportCoordinator,
  aggregateBackupStats,
  buildDiagnosticPackage,
} from '@/main/diagnostics'
import { DIAGNOSTIC_MAX_BYTES } from '@/shared/diagnostics'
import type { BackupRecord, DatabaseStatus } from '@/shared/backup/types'

const SECRET = 'sk-ant-test-secret-do-not-export-1234567890'
const BEARER = 'Bearer FAKESECRET_o4p5q6r7s8t9u0v1w2x3'
const CREDENTIAL_ID = 'llm:app-default-credential-id'
const WINDOWS_PATH = 'C:\\Users\\Alice\\AppData\\Roaming\\yourcrush\\data.sqlite'
const UNIX_PATH = '/Users/alice/.config/yourcrush/settings.json'
const LINUX_PATH = '/home/alice/.local/share/yourcrush/db.sqlite'
const QUERY_TOKEN = 'https://example.test/v1?api_key=super-secret-token&x=1'
const PROJECT_NAME = '绝密恋爱日记项目名-不要出现'
const CHAPTER_BODY = '这是不能出现在诊断包里的章节正文。'
const CHAT_MESSAGE = '私密聊天内容绝不能导出。'
const FRAGMENT = '碎片日记私密原文。'
const RELATION_PRIVATE = '关系私密记录内容。'
const TASK_INPUT = '{"prompt":"任务输入原文"}'
const SETTINGS_RAW = '{"apiKey":"should-not-appear"}'
const CIPHER_PAYLOAD = 'base64-encrypted-payload-value'

function sampleBackups(): BackupRecord[] {
  return [
    {
      id: 'backup-secret-id-1',
      filename: 'backup-secret-id-1.sqlite',
      createdAt: '2026-03-02T00:00:00.000Z',
      reason: 'manual',
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
      size: 2048,
      sha256: 'a'.repeat(64),
    },
    {
      id: 'backup-secret-id-2',
      filename: 'backup-secret-id-2.sqlite',
      createdAt: '2026-03-01T00:00:00.000Z',
      reason: 'scheduled',
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 7,
      size: 1024,
      sha256: 'b'.repeat(64),
    },
  ]
}

function baseStatus(overrides: Partial<DatabaseStatus> = {}): DatabaseStatus {
  return {
    state: 'ready',
    integrity: 'ok',
    schemaVersion: 8,
    message: null,
    lastBackupAt: null,
    backupAllowed: true,
    backupEligibility: 'safe',
    backupBlockedReason: null,
    ...overrides,
  }
}

describe('diagnostic package builder', () => {
  test('builds a versioned allowlist package with aggregate backup stats only', () => {
    const built = buildDiagnosticPackage({
      appVersion: '0.2.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '28.3.3',
      nodeVersion: '22.23.1',
      generatedAt: '2026-03-10T00:00:00.000Z',
      databaseStatus: baseStatus(),
      backupPolicy: { maxBackups: 10, maxAgeDays: 30 },
      backups: sampleBackups(),
    })

    expect(built.package).toMatchObject({
      format: 'yourcrush-diagnostics',
      formatVersion: 1,
      appVersion: '0.2.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '28.3.3',
      nodeVersion: '22.23.1',
      database: {
        state: 'ready',
        integrity: 'ok',
        schemaVersion: 8,
        message: null,
      },
      backupPolicy: { maxBackups: 10, maxAgeDays: 30 },
      backupStats: {
        totalCount: 2,
        byReason: {
          manual: 1,
          scheduled: 1,
          'pre-migration': 0,
          'pre-restore': 0,
        },
        latestBackupAt: '2026-03-02T00:00:00.000Z',
        totalBytes: 3072,
        schemaVersions: [7, 8],
      },
    })
    expect(built.package.exclusions.length).toBeGreaterThan(5)
    expect(built.json).toContain('"format": "yourcrush-diagnostics"')
    expect(built.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(built.size).toBe(Buffer.byteLength(built.json, 'utf8'))
    expect(built.json).not.toContain('backup-secret-id')
    expect(built.json).not.toContain('.sqlite')
  })

  test('redacts malicious database messages and never embeds non-allowlist private content', () => {
    const maliciousMessage = [
      SECRET,
      BEARER,
      CREDENTIAL_ID,
      QUERY_TOKEN,
      WINDOWS_PATH,
      UNIX_PATH,
      LINUX_PATH,
      CIPHER_PAYLOAD,
    ].join(' | ')

    const pollutedStatus = {
      ...baseStatus({
        state: 'recovery-required',
        integrity: 'failed',
        schemaVersion: null,
        message: maliciousMessage,
      }),
      // Non-allowlist fields must be ignored even if a caller smuggles them.
      projectName: PROJECT_NAME,
      chapterBody: CHAPTER_BODY,
      chat: CHAT_MESSAGE,
      fragment: FRAGMENT,
      relationshipPrivate: RELATION_PRIVATE,
      taskInput: TASK_INPUT,
      settings: SETTINGS_RAW,
      encryptedPayload: CIPHER_PAYLOAD,
    } as DatabaseStatus

    const built = buildDiagnosticPackage({
      appVersion: '0.2.0-alpha.1',
      platform: 'linux',
      arch: 'arm64',
      electronVersion: null,
      nodeVersion: '22.23.1',
      generatedAt: '2026-03-10T00:00:00.000Z',
      databaseStatus: pollutedStatus,
      backupPolicy: { maxBackups: 3, maxAgeDays: 7 },
      backups: sampleBackups(),
    })

    const raw = built.json
    expect(raw).not.toContain(SECRET)
    expect(raw).not.toContain('ya29.a0AfH6SMB-fake-token')
    expect(raw).not.toContain(CREDENTIAL_ID)
    expect(raw).not.toContain('super-secret-token')
    expect(raw).not.toContain('Alice')
    expect(raw).not.toContain('/Users/alice')
    expect(raw).not.toContain('/home/alice')
    expect(raw).not.toContain(WINDOWS_PATH)
    expect(raw).not.toContain(UNIX_PATH)
    expect(raw).not.toContain(LINUX_PATH)
    expect(raw).not.toContain(PROJECT_NAME)
    expect(raw).not.toContain(CHAPTER_BODY)
    expect(raw).not.toContain(CHAT_MESSAGE)
    expect(raw).not.toContain(FRAGMENT)
    expect(raw).not.toContain(RELATION_PRIVATE)
    expect(raw).not.toContain(TASK_INPUT)
    expect(raw).not.toContain(SETTINGS_RAW)
    expect(raw).not.toContain(CIPHER_PAYLOAD)
    expect(raw).not.toContain('backup-secret-id')
    expect(raw).toContain('[REDACTED]')
    expect(raw).toContain('[LOCAL_PATH]')
    expect(Object.keys(built.package).sort()).toEqual([
      'appVersion',
      'arch',
      'backupPolicy',
      'backupStats',
      'database',
      'electronVersion',
      'exclusions',
      'format',
      'formatVersion',
      'generatedAt',
      'nodeVersion',
      'platform',
    ])
  })

  test('rejects packages that exceed the size cap without writing files', () => {
    const huge = 'x'.repeat(DIAGNOSTIC_MAX_BYTES)
    expect(() => buildDiagnosticPackage({
      appVersion: huge,
      platform: 'win32',
      arch: 'x64',
      electronVersion: null,
      nodeVersion: '22.23.1',
      generatedAt: '2026-03-10T00:00:00.000Z',
      databaseStatus: baseStatus({ message: huge }),
      backupPolicy: { maxBackups: 10, maxAgeDays: 30 },
      backups: [],
    })).toThrow(expect.objectContaining({ code: 'DIAGNOSTIC_EXPORT_TOO_LARGE' }))
  })

  test('aggregates stats without relying on accidental object order', () => {
    const stats = aggregateBackupStats(sampleBackups())
    expect(Object.keys(stats.byReason).sort()).toEqual([
      'manual',
      'pre-migration',
      'pre-restore',
      'scheduled',
    ].sort())
    expect(stats.schemaVersions).toEqual([7, 8])
  })
})

describe('diagnostic export coordinator', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-diag-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function coordinator(listBackups = async () => sampleBackups()) {
    return new DiagnosticExportCoordinator({
      appVersion: '0.2.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '28.3.3',
      nodeVersion: '22.23.1',
      getDatabaseStatus: () => baseStatus({
        state: 'recovery-required',
        message: `failed at ${WINDOWS_PATH} with ${SECRET}`,
      }),
      getBackupPolicy: () => ({ maxBackups: 10, maxAgeDays: 30 }),
      listBackups,
      now: () => new Date('2026-03-10T12:00:00.000Z'),
    })
  }

  test('exports a safe file and returns basename/size/sha256 without absolute paths', async () => {
    const target = path.join(root, 'out.yourcrush-diagnostics.json')
    const result = await coordinator().exportToFile(target)
    expect(result).toEqual({
      canceled: false,
      fileName: 'out.yourcrush-diagnostics.json',
      size: expect.any(Number),
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(result)).not.toContain(root)
    expect(JSON.stringify(result)).not.toContain(WINDOWS_PATH)
    const bytes = fs.readFileSync(target, 'utf8')
    expect(bytes).not.toContain(SECRET)
    expect(bytes).not.toContain('Alice')
    expect(bytes).not.toContain('backup-secret-id')
    expect(bytes).toContain('"state": "recovery-required"')
  })

  test('cleans temporary files when rename fails and does not truncate an existing target', async () => {
    const target = path.join(root, 'existing.yourcrush-diagnostics.json')
    fs.writeFileSync(target, '{"keep":true}\n', 'utf8')
    const previous = fs.readFileSync(target, 'utf8')
    const removedTemps: string[] = []
    const fsPromises = await import('node:fs/promises')
    const service = new DiagnosticExportCoordinator({
      appVersion: '0.2.0-alpha.1',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '28.3.3',
      nodeVersion: '22.23.1',
      getDatabaseStatus: () => baseStatus(),
      getBackupPolicy: () => ({ maxBackups: 10, maxAgeDays: 30 }),
      listBackups: async () => sampleBackups(),
      now: () => new Date('2026-03-10T12:00:00.000Z'),
      fileIo: {
        open: (...args) => fsPromises.open(...args),
        rename: async (from, to) => {
          if (String(to) === target) throw new Error('injected rename failure')
          return fsPromises.rename(from, to)
        },
        rm: async (targetPath, options) => {
          removedTemps.push(String(targetPath))
          return fsPromises.rm(targetPath, options)
        },
      },
    })

    await expect(service.exportToFile(target)).rejects.toMatchObject({
      code: 'LOCAL_IO_ERROR',
    })
    expect(fs.readFileSync(target, 'utf8')).toBe(previous)
    expect(removedTemps.some((entry) => entry.endsWith('.tmp'))).toBe(true)
    expect(fs.readdirSync(root).filter((entry) => entry.endsWith('.tmp'))).toEqual([])
  })
})
