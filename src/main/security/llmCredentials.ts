import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import type { SqliteDatabase } from '../database'
import { getSettings, updateSettings } from '../../shared/persistence/settingsStore'
import { sanitizeSensitiveData } from '../../shared/security/sanitizeSensitiveData'
import {
  LlmBaseUrlValidationError,
  normalizeLlmBaseUrl,
} from '../../agent/llm/config'
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
  failed: number
  issues: CredentialMigrationIssue[]
}

interface LegacyLlmConfigRow {
  id: string
  project_id: string
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
  const selected = typeof provider === 'string' && provider.trim()
    ? provider.trim().toLowerCase()
    : 'openai-compatible'
  const configuredUrl = typeof baseUrl === 'string' && baseUrl.trim() ? baseUrl.trim() : undefined
  const defaults: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    deepseek: 'https://api.deepseek.com/v1',
    'openai-compatible': 'https://api.openai.com/v1',
  }
  return {
    provider: selected,
    baseUrl: normalizeLlmBaseUrl(configuredUrl ?? defaults[selected] ?? defaults['openai-compatible']),
  }
}

type MigrationBindingResult =
  | { success: true; data: CredentialBinding }
  | {
      success: false
      error: {
        code: 'INVALID_LEGACY_LLM_BASE_URL'
          | 'INSECURE_LEGACY_LLM_BASE_URL'
          | 'CREDENTIAL_BINDING_INVALID'
        message: string
        unexpected: boolean
      }
    }

function credentialBindingForMigration(
  provider: unknown,
  baseUrl?: unknown,
): MigrationBindingResult {
  try {
    return { success: true, data: credentialBindingForProvider(provider, baseUrl) }
  } catch (caught) {
    if (caught instanceof LlmBaseUrlValidationError) {
      return {
        success: false,
        error: {
          code: caught.code === 'INSECURE_LLM_BASE_URL'
            ? 'INSECURE_LEGACY_LLM_BASE_URL'
            : 'INVALID_LEGACY_LLM_BASE_URL',
          message: '历史模型接口地址无效或不符合当前安全策略，请在设置页重新配置。',
          unexpected: false,
        },
      }
    }
    return {
      success: false,
      error: {
        code: 'CREDENTIAL_BINDING_INVALID',
        message: '历史模型凭据绑定无法处理，原明文已保留，请在设置页重新配置。',
        unexpected: true,
      },
    }
  }
}

function recordBindingIssue(
  report: CredentialMigrationReport,
  source: CredentialMigrationIssue['source'],
  identifier: string,
  result: Extract<MigrationBindingResult, { success: false }>,
): void {
  report.pending += 1
  if (result.error.unexpected) report.failed += 1
  report.issues.push({
    source,
    identifier,
    code: result.error.code,
    message: result.error.message,
  })
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
  const plaintextValues = [
    nonEmptyString(settings.apiKey),
    nonEmptyString(settings.api_key),
  ].filter((value): value is string => value !== undefined)
  const uniquePlaintextValues = [...new Set(plaintextValues)]
  if (uniquePlaintextValues.length > 1) {
    report.pending += uniquePlaintextValues.length
    report.issues.push({
      source: 'settings',
      identifier: 'app-default',
      code: 'REFERENCE_CONFLICT',
      message: '检测到多个不同的旧版全局凭据，已保留原配置等待人工确认。',
    })
    return
  }
  const plaintext = uniquePlaintextValues[0]
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
  const binding = credentialBindingForMigration(settings.provider, settings.baseUrl)
  if (!binding.success) {
    recordBindingIssue(report, 'settings', 'app-default', binding)
    return
  }
  const saved = credentialService.saveCredential(
    APP_LLM_CREDENTIAL_ID,
    plaintext,
    binding.data,
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
    report.pending += 1
    report.issues.push({
      source: 'database',
      identifier: 'llm_configs',
      code: 'SCHEMA_NOT_READY',
      message: '数据库凭据引用迁移尚未应用，已保留原明文。',
    })
    return
  }
  const rows = database.prepare<LegacyLlmConfigRow>(
    "SELECT id, project_id, api_key, credential_id, provider, base_url FROM llm_configs WHERE TRIM(api_key) <> ''",
  ).all()
  for (const row of rows) {
    const identifier = `${row.project_id}:${row.id}`
    const binding = credentialBindingForMigration(row.provider, row.base_url)
    if (!binding.success) {
      recordBindingIssue(report, 'database', identifier, binding)
      continue
    }
    const credentialId = nonEmptyString(row.credential_id) ?? credentialIdForRow(row.id)
    const existing = credentialService.hasCredential(credentialId)
    if (!existing.success) {
      report.pending += 1
      report.issues.push({ source: 'database', identifier: row.id, code: existing.error.code, message: existing.error.message })
      continue
    }
    if (existing.data) {
      const current = credentialService.getCredential(credentialId)
      if (!current.success || current.data !== row.api_key) {
        report.pending += 1
        report.issues.push({
          source: 'database',
          identifier: row.id,
          code: 'REFERENCE_CONFLICT',
          message: '凭据引用已被不同内容占用，原明文已保留。',
        })
        continue
      }
    }
    const saved = credentialService.saveCredential(
      credentialId,
      row.api_key,
      binding.data,
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

type JsonPathSegment = string | number

interface PlaintextCredentialLocation {
  path: JsonPathSegment[]
  field: string
  secret: string
  provider?: string
  baseUrl?: string
}

const KNOWN_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'deepseek', 'openai-compatible'])

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, '').toLowerCase()
}

function providerFromPath(pathSegments: JsonPathSegment[]): string | undefined {
  for (let index = pathSegments.length - 1; index >= 0; index -= 1) {
    const segment = pathSegments[index]
    if (typeof segment !== 'string') continue
    const normalized = segment.toLowerCase()
    if (KNOWN_PROVIDERS.has(normalized)) return normalized
  }
  return undefined
}

function collectPlaintextCredentials(
  value: unknown,
  pathSegments: JsonPathSegment[] = [],
  inheritedProvider?: string,
  inheritedBaseUrl?: string,
): PlaintextCredentialLocation[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectPlaintextCredentials(item, [...pathSegments, index], inheritedProvider, inheritedBaseUrl),
    )
  }
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  const provider = nonEmptyString(record.provider)
    ?? nonEmptyString(record.llmProvider)
    ?? providerFromPath(pathSegments)
    ?? inheritedProvider
  const baseUrl = nonEmptyString(record.baseUrl) ?? nonEmptyString(record.llmBaseUrl) ?? inheritedBaseUrl
  const result: PlaintextCredentialLocation[] = []
  for (const [field, item] of Object.entries(record)) {
    const childPath = [...pathSegments, field]
    if (normalizedKey(field) === 'apikey') {
      const secret = nonEmptyString(item)
      if (secret) result.push({ path: childPath, field, secret, provider, baseUrl })
      continue
    }
    result.push(...collectPlaintextCredentials(item, childPath, provider, baseUrl))
  }
  return result
}

function stableProjectCredentialId(projectId: string, location: PlaintextCredentialLocation): string {
  const projectHash = createHash('sha256').update(projectId).digest('hex').slice(0, 16)
  const pathHash = createHash('sha256').update(JSON.stringify(location.path)).digest('hex').slice(0, 20)
  return `llm:project:${projectHash}:${pathHash}`
}

function referenceFieldFor(parent: Record<string, unknown>, location: PlaintextCredentialLocation): string {
  if (location.path.length === 1) return 'llmCredentialId'
  if (!nonEmptyString(parent.credentialId)) return 'credentialId'
  return `${location.field.replace(/[^a-z0-9]/gi, '')}CredentialId`
}

function replacePlaintextWithReference(
  settings: Record<string, unknown>,
  location: PlaintextCredentialLocation,
  credentialId: string,
): Record<string, unknown> {
  const clone = structuredClone(settings) as Record<string, unknown>
  let current: unknown = clone
  for (const segment of location.path.slice(0, -1)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) throw new Error('credential path is invalid')
      current = current[segment]
    } else {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error('credential path is invalid')
      }
      current = (current as Record<string, unknown>)[segment]
    }
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error('credential parent is invalid')
  }
  const parent = current as Record<string, unknown>
  delete parent[location.field]
  parent[referenceFieldFor(parent, location)] = credentialId
  return clone
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
    const locations = collectPlaintextCredentials(settings)
    for (const location of locations) {
      const identifier = `${row.project_id}:${location.path.join('.')}`
      if (!location.provider) {
        report.pending += 1
        report.issues.push({
          source: 'database',
          identifier,
          code: 'PROVIDER_UNKNOWN',
          message: '无法确定旧凭据所属 Provider，已保留该明文字段。',
        })
        continue
      }
      const binding = credentialBindingForMigration(location.provider, location.baseUrl)
      if (!binding.success) {
        recordBindingIssue(report, 'database', identifier, binding)
        continue
      }
      const credentialId = stableProjectCredentialId(row.project_id, location)
      const existing = credentialService.hasCredential(credentialId)
      if (!existing.success) {
        report.pending += 1
        report.issues.push({ source: 'database', identifier, code: existing.error.code, message: existing.error.message })
        continue
      }
      if (existing.data) {
        const current = credentialService.getCredential(credentialId)
        if (!current.success || current.data !== location.secret) {
          report.pending += 1
          report.issues.push({
            source: 'database',
            identifier,
            code: 'REFERENCE_CONFLICT',
            message: '稳定凭据引用已被不同内容占用，原明文已保留。',
          })
          continue
        }
      }
      const saved = credentialService.saveCredential(
        credentialId,
        location.secret,
        binding.data,
      )
      const verified = saved.success ? credentialService.getCredential(credentialId) : saved
      if (!saved.success || !verified.success || verified.data !== location.secret) {
        report.pending += 1
        report.issues.push({
          source: 'database',
          identifier,
          code: saved.success && !verified.success
            ? verified.error.code
            : saved.success ? 'DECRYPT_FAILED' : saved.error.code,
          message: '项目凭据迁移验证失败，该明文字段已保留。',
        })
        continue
      }
      try {
        const cleaned = replacePlaintextWithReference(settings, location, credentialId)
        database.transaction(() => {
          database.prepare('UPDATE project_configs SET settings_json = ? WHERE project_id = ?').run(
            JSON.stringify(cleaned),
            row.project_id,
          )
        })()
        settings = cleaned
        report.migrated += 1
      } catch {
        report.pending += 1
        report.issues.push({
          source: 'database',
          identifier,
          code: 'STORAGE_WRITE_FAILED',
          message: '项目配置更新失败，该明文字段已保留。',
        })
      }
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
  const report: CredentialMigrationReport = { migrated: 0, pending: 0, failed: 0, issues: [] }
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
