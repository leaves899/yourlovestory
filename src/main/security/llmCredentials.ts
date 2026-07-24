import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SqliteDatabase } from '../database'
import { getSettings, updateSettings } from '../../shared/persistence/settingsStore'
import { sanitizeSensitiveData } from '../../shared/security/sanitizeSensitiveData'
import type { CredentialService, CredentialAvailability, CredentialBinding } from './credentialService'

export const APP_LLM_CREDENTIAL_ID = 'llm:app-default'

export interface CredentialMigrationIssue {
  source: 'settings' | 'database'
  identifier: string
  code: string
  message: string
}

export interface CredentialMigrationReport {
  migrated: number
  pending: number
  issues: CredentialMigrationIssue[]
}

interface LegacyLlmConfigRow {
  id: string
  api_key: string
  credential_id?: string
  provider?: string
  base_url?: string
}

interface LegacyProjectConfigRow {
  project_id: string
  settings_json: string
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function removePlaintextKey(settings: Record<string, unknown>, credentialId: string): Record<string, unknown> {
  const next: Record<string, unknown> = { ...settings, credentialId }
  delete next.apiKey
  delete next.api_key
  return next
}

function credentialIdForRow(id: string): string {
  return `llm-config:${id}`
}

export function credentialBindingForProvider(provider: unknown, baseUrl?: unknown): CredentialBinding {
  const selected = typeof provider === 'string' && provider.trim() ? provider.trim() : 'openai-compatible'
  const configuredUrl = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim().replace(/\/+$/, '') : undefined
  const defaults: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    deepseek: 'https://api.deepseek.com/v1',
    'openai-compatible': 'https://api.openai.com/v1',
  }
  return { provider: selected, baseUrl: configuredUrl ?? defaults[selected] ?? defaults['openai-compatible'] }
}

function settingsFile(root: string): string {
  return path.join(root, 'settings.json')
}

function writeLegacySettings(root: string, settings: Record<string, unknown>): boolean {
  return updateSettings(root, settings)
}

function migrateSettingsAt(
  root: string,
  credentialService: CredentialService,
  report: CredentialMigrationReport,
  preserveExistingCredential = false,
): void {
  const file = settingsFile(root)
  if (!fs.existsSync(file)) return
  const settings = getSettings(root) as Record<string, unknown>
  const plaintext = nonEmptyString(settings.apiKey) ?? nonEmptyString(settings.api_key)
  if (!plaintext) return
  if (preserveExistingCredential) {
    const existing = credentialService.getCredential(APP_LLM_CREDENTIAL_ID)
    if (existing.success && existing.data !== plaintext) {
      report.pending += 1
      report.issues.push({
        source: 'settings',
        identifier: 'app-default',
        code: 'INVALID_INPUT',
        message: '检测到旧安装目录与当前用户配置的凭据冲突，已保留旧文件等待人工确认。',
      })
      return
    }
  }
  const saved = credentialService.saveCredential(
    APP_LLM_CREDENTIAL_ID,
    plaintext,
    credentialBindingForProvider(settings.provider, settings.baseUrl),
  )
  if (!saved.success) {
    report.pending += 1
    report.issues.push({ source: 'settings', identifier: 'app-default', code: saved.error.code, message: saved.error.message })
    return
  }
  const verified = credentialService.getCredential(APP_LLM_CREDENTIAL_ID)
  if (!verified.success || verified.data !== plaintext) {
    report.pending += 1
    report.issues.push({ source: 'settings', identifier: 'app-default', code: verified.success ? 'DECRYPT_FAILED' : verified.error.code, message: '凭据验证失败，原设置未被删除。' })
    return
  }
  if (!writeLegacySettings(root, removePlaintextKey(settings, APP_LLM_CREDENTIAL_ID))) {
    report.pending += 1
    report.issues.push({ source: 'settings', identifier: 'app-default', code: 'STORAGE_WRITE_FAILED', message: '配置写入失败，原明文已保留。' })
    return
  }
  report.migrated += 1
}

function copyLegacySettingsIfNeeded(userDataPath: string, appPath: string): void {
  if (path.resolve(userDataPath) === path.resolve(appPath)) return
  if (fs.existsSync(settingsFile(userDataPath)) || !fs.existsSync(settingsFile(appPath))) return
  const legacy = getSettings(appPath) as Record<string, unknown>
  // A failed migration stays recoverable in place. Never copy plaintext to userData.
  if (nonEmptyString(legacy.apiKey) || nonEmptyString(legacy.api_key)) return
  writeLegacySettings(userDataPath, legacy)
}

function hasColumn(database: SqliteDatabase, table: string, column: string): boolean {
  const rows = database.prepare<{ name: string }>(`PRAGMA table_info(${table})`).all()
  return rows.some((row) => row.name === column)
}

function migrateDatabase(
  database: SqliteDatabase,
  credentialService: CredentialService,
  report: CredentialMigrationReport,
): void {
  if (!hasColumn(database, 'llm_configs', 'api_key')) return
  if (!hasColumn(database, 'llm_configs', 'credential_id')) {
    database.exec("ALTER TABLE llm_configs ADD COLUMN credential_id TEXT NOT NULL DEFAULT ''")
  }
  const rows = database.prepare<LegacyLlmConfigRow>(
    "SELECT id, api_key, credential_id, provider, base_url FROM llm_configs WHERE TRIM(api_key) <> ''",
  ).all()
  for (const row of rows) {
    const credentialId = nonEmptyString(row.credential_id) ?? credentialIdForRow(row.id)
    const saved = credentialService.saveCredential(
      credentialId,
      row.api_key,
      credentialBindingForProvider(row.provider, row.base_url),
    )
    if (!saved.success) {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.id, code: saved.error.code, message: saved.error.message })
      continue
    }
    const verified = credentialService.getCredential(credentialId)
    if (!verified.success || verified.data !== row.api_key) {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.id, code: verified.success ? 'DECRYPT_FAILED' : verified.error.code, message: '数据库凭据验证失败，原值已保留。' })
      continue
    }
    try {
      database.transaction(() => {
        database.prepare("UPDATE llm_configs SET credential_id = ?, api_key = '' WHERE id = ?").run(credentialId, row.id)
      })()
      report.migrated += 1
    } catch {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.id, code: 'STORAGE_WRITE_FAILED', message: '数据库更新失败，原明文已保留。' })
    }
  }
}

function findPlaintextKey(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlaintextKey(item)
      if (found) return found
    }
    return undefined
  }
  for (const [key, item] of Object.entries(value)) {
    if (key.replace(/[\s_-]/g, '').toLowerCase() === 'apikey') return nonEmptyString(item)
    const found = findPlaintextKey(item)
    if (found) return found
  }
  return undefined
}

function withoutPlaintextKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPlaintextKeys)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key.replace(/[\s_-]/g, '').toLowerCase() === 'apikey') continue
    result[key] = withoutPlaintextKeys(item)
  }
  return result
}

function migrateProjectConfigSettings(
  database: SqliteDatabase,
  credentialService: CredentialService,
  report: CredentialMigrationReport,
): void {
  if (!hasColumn(database, 'project_configs', 'settings_json')) return
  const rows = database.prepare<LegacyProjectConfigRow>(
    "SELECT project_id, settings_json FROM project_configs WHERE settings_json LIKE '%api%key%' COLLATE NOCASE",
  ).all()
  for (const row of rows) {
    let settings: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(row.settings_json)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      settings = parsed as Record<string, unknown>
    } catch {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.project_id, code: 'CORRUPTED', message: '项目配置格式损坏，未删除可能的明文凭据。' })
      continue
    }
    const plaintext = findPlaintextKey(settings)
    if (!plaintext) continue
    const credentialId = `llm:project:${row.project_id}`
    const saved = credentialService.saveCredential(
      credentialId,
      plaintext,
      credentialBindingForProvider(settings.llmProvider, settings.llmBaseUrl),
    )
    const verified = saved.success ? credentialService.getCredential(credentialId) : saved
    if (!saved.success || !verified.success || verified.data !== plaintext) {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.project_id, code: saved.success && !verified.success ? verified.error.code : saved.success ? 'DECRYPT_FAILED' : saved.error.code, message: '项目凭据迁移验证失败，原值已保留。' })
      continue
    }
    const cleaned = withoutPlaintextKeys(settings) as Record<string, unknown>
    cleaned.llmCredentialId = credentialId
    try {
      database.transaction(() => {
        database.prepare('UPDATE project_configs SET settings_json = ? WHERE project_id = ?').run(JSON.stringify(cleaned), row.project_id)
      })()
      report.migrated += 1
    } catch {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.project_id, code: 'STORAGE_WRITE_FAILED', message: '项目配置更新失败，原明文已保留。' })
    }
  }
}

/** Safely migrates legacy plaintext only after the credential has round-tripped. */
export function migrateLegacyLlmCredentials(
  userDataPath: string,
  appPath: string,
  database: SqliteDatabase,
  credentialService: CredentialService,
): CredentialMigrationReport {
  const report: CredentialMigrationReport = { migrated: 0, pending: 0, issues: [] }
  const availability = credentialService.availability()
  if (!availability.available) {
    // Keep the final schema migration blocked so legacy plaintext is retained
    // for a later verified migration, never discarded by an unavailable backend.
    report.pending += 1
    report.issues.push({ source: 'settings', identifier: 'app-default', code: availability.error!.code, message: availability.error!.message })
    return report
  }

  migrateSettingsAt(userDataPath, credentialService, report)
  if (path.resolve(appPath) !== path.resolve(userDataPath)) {
    migrateSettingsAt(appPath, credentialService, report, true)
  }
  copyLegacySettingsIfNeeded(userDataPath, appPath)
  migrateDatabase(database, credentialService, report)
  migrateProjectConfigSettings(database, credentialService, report)
  return report
}

export function getAppCredentialId(settings: Record<string, unknown>): string {
  return nonEmptyString(settings.credentialId) ?? APP_LLM_CREDENTIAL_ID
}

export function safeSettingsView(settings: Record<string, unknown>, availability: CredentialAvailability, configured: boolean): Record<string, unknown> {
  const sanitized = sanitizeSensitiveData(removePlaintextKey(settings, getAppCredentialId(settings))) as Record<string, unknown>
  delete sanitized.credentialId
  return {
    ...sanitized,
    credential: {
      configured,
      storageAvailable: availability.available,
      backend: availability.backend,
      error: availability.error ? { code: availability.error.code, message: availability.error.message } : undefined,
    },
  }
}
