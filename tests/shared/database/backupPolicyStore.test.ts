import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  BackupPolicyStore,
  parseBackupPolicyFile,
  parseBackupPolicyUpdateInput,
} from '@/main/backup'
import { DEFAULT_BACKUP_RETENTION_POLICY } from '@/shared/backup/types'

describe('backup policy store', () => {
  let root: string
  let store: BackupPolicyStore

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-policy-'))
    store = new BackupPolicyStore(root)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('loads defaults when the policy file is missing', () => {
    const loaded = store.load()
    expect(loaded).toEqual({
      policy: DEFAULT_BACKUP_RETENTION_POLICY,
      source: 'default',
      fallbackReason: 'missing',
    })
  })

  test('writes a versioned policy and reads it after a restart', async () => {
    await store.save({ maxBackups: 7, maxAgeDays: 14 })
    const restarted = new BackupPolicyStore(root)
    const loaded = restarted.load()
    expect(loaded).toEqual({
      policy: { maxBackups: 7, maxAgeDays: 14 },
      source: 'file',
    })
    const onDisk = JSON.parse(fs.readFileSync(store.getPolicyPath(), 'utf8')) as Record<string, unknown>
    expect(onDisk).toEqual({
      version: 1,
      maxBackups: 7,
      maxAgeDays: 14,
    })
  })

  test('saves twice in the same store and restarts to the second policy', async () => {
    await store.save({ maxBackups: 3, maxAgeDays: 5 })
    await store.save({ maxBackups: 8, maxAgeDays: 21 })
    expect(store.load()).toEqual({
      policy: { maxBackups: 8, maxAgeDays: 21 },
      source: 'file',
    })
    const restarted = new BackupPolicyStore(root)
    expect(restarted.load()).toEqual({
      policy: { maxBackups: 8, maxAgeDays: 21 },
      source: 'file',
    })
    const onDisk = JSON.parse(fs.readFileSync(store.getPolicyPath(), 'utf8')) as Record<string, unknown>
    expect(onDisk).toEqual({
      version: 1,
      maxBackups: 8,
      maxAgeDays: 21,
    })
  })

  test.each([
    ['corrupted json', '{not-json'],
    ['unknown version', JSON.stringify({ version: 99, maxBackups: 10, maxAgeDays: 30 })],
    ['extra fields', JSON.stringify({ version: 1, maxBackups: 10, maxAgeDays: 30, path: 'C:\\\\x' })],
    ['float maxBackups', JSON.stringify({ version: 1, maxBackups: 1.5, maxAgeDays: 30 })],
    ['string numbers', JSON.stringify({ version: 1, maxBackups: '10', maxAgeDays: '30' })],
    ['missing fields', JSON.stringify({ version: 1, maxBackups: 10 })],
    ['zero', JSON.stringify({ version: 1, maxBackups: 0, maxAgeDays: 30 })],
    ['negative', JSON.stringify({ version: 1, maxBackups: -1, maxAgeDays: 30 })],
    ['over maxBackups', JSON.stringify({ version: 1, maxBackups: 101, maxAgeDays: 30 })],
    ['over maxAgeDays', JSON.stringify({ version: 1, maxBackups: 10, maxAgeDays: 3651 })],
    ['NaN', JSON.stringify({ version: 1, maxBackups: Number.NaN, maxAgeDays: 30 })],
    ['Infinity', JSON.stringify({ version: 1, maxBackups: Number.POSITIVE_INFINITY, maxAgeDays: 30 })],
  ])('falls back to defaults for invalid file: %s', (_label, content) => {
    fs.mkdirSync(path.dirname(store.getPolicyPath()), { recursive: true })
    fs.writeFileSync(store.getPolicyPath(), content)
    const loaded = store.load()
    expect(loaded.policy).toEqual(DEFAULT_BACKUP_RETENTION_POLICY)
    expect(loaded.source).toBe('default')
    expect(loaded.fallbackReason).toBe('invalid')
  })

  test('rejects invalid update payloads', () => {
    expect(() => parseBackupPolicyUpdateInput({ maxBackups: 10 })).toThrow(
      expect.objectContaining({ code: 'BACKUP_POLICY_INVALID' }),
    )
    expect(() => parseBackupPolicyUpdateInput({
      maxBackups: 10,
      maxAgeDays: 30,
      extra: true,
    })).toThrow(expect.objectContaining({ code: 'BACKUP_POLICY_INVALID' }))
    expect(() => parseBackupPolicyUpdateInput({
      maxBackups: '10',
      maxAgeDays: 30,
    })).toThrow(expect.objectContaining({ code: 'BACKUP_POLICY_INVALID' }))
    expect(() => parseBackupPolicyFile({
      version: 1,
      maxBackups: 10,
      maxAgeDays: 30,
      path: 'C:\\Users\\x',
    })).toThrow(expect.objectContaining({ code: 'BACKUP_POLICY_INVALID' }))
  })

  test('keeps the previous valid policy when install rename fails and cleans temp files', async () => {
    await store.save({ maxBackups: 5, maxAgeDays: 9 })
    const previous = fs.readFileSync(store.getPolicyPath(), 'utf8')
    const removedTemps: string[] = []
    const policyPath = store.getPolicyPath()
    const failingStore = new BackupPolicyStore(root, {
      existsSync: (target) => fs.existsSync(target),
      mkdirSync: (target, options) => {
        fs.mkdirSync(target, options)
      },
      readFileSync: (target, encoding) => fs.readFileSync(target, encoding),
      writeFileSync: (target, data, options) => {
        fs.writeFileSync(target, data, options)
      },
      renameSync: (from, to) => {
        // Fail only the install step (temp -> formal path), not displace/restore.
        const isInstall = to === policyPath && !String(from).includes('.displaced.')
        if (isInstall) {
          throw new Error('injected rename failure')
        }
        fs.renameSync(from, to)
      },
      rmSync: (target, options) => {
        removedTemps.push(target)
        fs.rmSync(target, options)
      },
    })

    await expect(failingStore.save({ maxBackups: 20, maxAgeDays: 40 })).rejects.toMatchObject({
      code: 'BACKUP_POLICY_IO_ERROR',
    })
    expect(fs.readFileSync(store.getPolicyPath(), 'utf8')).toBe(previous)
    expect(removedTemps.some((entry) => entry.endsWith('.tmp'))).toBe(true)
    expect(fs.readdirSync(path.dirname(store.getPolicyPath()))
      .filter((entry) => entry.endsWith('.tmp'))).toEqual([])
    expect(failingStore.load()).toEqual({
      policy: { maxBackups: 5, maxAgeDays: 9 },
      source: 'file',
    })
  })

  test('serializes concurrent saves without losing a valid policy file', async () => {
    await Promise.all([
      store.save({ maxBackups: 3, maxAgeDays: 3 }),
      store.save({ maxBackups: 4, maxAgeDays: 4 }),
      store.save({ maxBackups: 5, maxAgeDays: 5 }),
    ])
    const loaded = store.load()
    expect(loaded.source).toBe('file')
    expect([3, 4, 5]).toContain(loaded.policy.maxBackups)
    expect(loaded.policy.maxAgeDays).toBe(loaded.policy.maxBackups)
    expect(fs.existsSync(store.getPolicyPath())).toBe(true)
  })
})
