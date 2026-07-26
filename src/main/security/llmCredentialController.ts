import type { LlmConfigInput } from '../../agent/llm'
import { createHash } from 'node:crypto'
import type { SqliteDatabase } from '../database'
import type { WorkbenchService } from '../workbench'
import { getSettings, updateSettings } from '../../shared/persistence/settingsStore'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'
import { createSecureFetch } from '../../shared/security/urlSecurity'
import type {
  CredentialBinding,
  CredentialError,
  CredentialResult,
  CredentialService,
} from './credentialService'
import {
  APP_LLM_CREDENTIAL_ID,
  credentialBindingForProvider,
  type CredentialMigrationIssue,
} from './llmCredentials'

export type CredentialScope = { scope: 'app' } | { scope: 'project'; projectId: string }

export interface CredentialControllerOptions {
  userDataPath: string
  credentialService: CredentialService
  workbenchService?: WorkbenchService
  database?: SqliteDatabase
  fetchImpl?: typeof fetch
  testTimeoutMs?: number
  invalidateRuntimes?: () => void
  readSettings?: () => Record<string, unknown>
  writeSettings?: (settings: Record<string, unknown>) => boolean
  migrationIssues?: CredentialMigrationIssue[]
}

interface LlmConfigRow {
  id: string
  project_id: string
  provider: string
  base_url: string
  credential_id: string
}

export interface ResolvedCredentialContext {
  target: CredentialScope
  credentialId: string
  referenced: boolean
  binding: CredentialBinding
  llmConfigId?: string
}

export interface DeleteAllSummary {
  deleted: number
  failed: number
  referencesCleared: boolean
  remaining: number
}

type ControllerResult<T> =
  | { success: true; data: T }
  | { success: false; error: CredentialError; data?: T }

function error(
  code: CredentialError['code'],
  message: string,
  retryable: boolean,
): { success: false; error: CredentialError } {
  return { success: false, error: { code, message, retryable } }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hasColumn(database: SqliteDatabase, table: string, column: string): boolean {
  return database
    .prepare<{ name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column)
}

function projectCredentialId(projectId: string): string {
  return `llm:project:${projectId}`
}

function projectMigrationCredentialPrefix(projectId: string): string {
  const hash = createHash('sha256').update(projectId).digest('hex').slice(0, 16)
  return `llm:project:${hash}:`
}

function isProjectCredentialOwned(credentialId: string, projectId: string): boolean {
  return credentialId === projectCredentialId(projectId)
    || credentialId.startsWith(projectMigrationCredentialPrefix(projectId))
}

function bindingMatches(actual: CredentialBinding | null, expected: CredentialBinding): boolean {
  return Boolean(
    actual
    && actual.provider === expected.provider
    && actual.baseUrl === expected.baseUrl,
  )
}

function testEndpoint(binding: CredentialBinding): string {
  const url = new URL(binding.baseUrl)
  const pathname = url.pathname.replace(/\/+$/, '')
  url.pathname = binding.provider === 'anthropic' && !pathname
    ? '/v1/models'
    : `${pathname}/models`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function requestHeaders(provider: string, secret: string): Record<string, string> {
  return provider === 'anthropic'
    ? { 'x-api-key': secret, 'anthropic-version': '2023-06-01' }
    : { Authorization: `Bearer ${secret}` }
}

export class LlmCredentialController {
  private readonly readSettings: () => Record<string, unknown>
  private readonly writeSettings: (settings: Record<string, unknown>) => boolean
  private migrationIssues: CredentialMigrationIssue[]

  public constructor(private readonly options: CredentialControllerOptions) {
    this.readSettings = options.readSettings
      ?? (() => getSettings(options.userDataPath) as Record<string, unknown>)
    this.writeSettings = options.writeSettings
      ?? ((settings) => updateSettings(options.userDataPath, settings))
    this.migrationIssues = [...(options.migrationIssues ?? [])]
  }

  public resolveContext(target: CredentialScope): ResolvedCredentialContext {
    if (target.scope === 'app') {
      const settings = this.readSettings()
      const reference = nonEmptyString(settings.credentialId)
      if (reference && reference !== APP_LLM_CREDENTIAL_ID) {
        throw new Error('全局凭据引用不属于当前配置。')
      }
      return {
        target,
        credentialId: reference ?? APP_LLM_CREDENTIAL_ID,
        referenced: Boolean(reference),
        binding: credentialBindingForProvider(settings.provider, settings.baseUrl),
      }
    }

    const project = this.options.workbenchService?.getProject(target.projectId)
    if (!project) throw new Error('project not found')
    const config = this.options.workbenchService!.getProjectConfig(target.projectId)
    const row = this.getDefaultLlmConfig(config.default_llm_config_id, target.projectId)
    if (row) {
      const reference = nonEmptyString(row.credential_id)
      if (reference && reference !== `llm-config:${row.id}`) {
        throw new Error('模型凭据引用不属于当前项目配置。')
      }
      return {
        target,
        credentialId: reference ?? `llm-config:${row.id}`,
        referenced: Boolean(reference),
        binding: credentialBindingForProvider(row.provider, row.base_url),
        llmConfigId: row.id,
      }
    }
    const reference = nonEmptyString(config.settings.llmCredentialId)
    if (reference && !isProjectCredentialOwned(reference, target.projectId)) {
      throw new Error('项目凭据引用不属于当前项目。')
    }
    return {
      target,
      credentialId: reference ?? projectCredentialId(target.projectId),
      referenced: Boolean(reference),
      binding: credentialBindingForProvider(
        config.settings.llmProvider,
        config.settings.llmBaseUrl,
      ),
    }
  }

  public runtimeConfig(projectId: string, input: LlmConfigInput): LlmConfigInput {
    const context = this.resolveContext({ scope: 'project', projectId })
    if (!context.referenced) throw new Error('项目尚未配置模型凭据。')
    const storedBinding = this.options.credentialService.getCredentialBinding(context.credentialId)
    if (!storedBinding.success) throw new Error(storedBinding.error.message)
    if (!bindingMatches(storedBinding.data, context.binding)) {
      throw new Error('Provider 或接口地址已变更，请重新保存凭据完成绑定。')
    }
    return {
      ...input,
      provider: context.binding.provider,
      baseUrl: context.binding.baseUrl,
      credentialId: context.credentialId,
    }
  }

  public status(target: CredentialScope): ControllerResult<{
    configured: boolean
    storageAvailable: boolean
    backend: string
    error: { code: string; message: string } | null
  }> {
    const availability = this.options.credentialService.availability()
    const migrationIssue = this.migrationIssueFor(target)
    let context: ResolvedCredentialContext
    try {
      context = this.resolveContext(target)
    } catch (caught) {
      if (!migrationIssue) throw caught
      return {
        success: true,
        data: {
          configured: false,
          storageAvailable: availability.available,
          backend: availability.backend,
          error: availability.error
            ? { code: availability.error.code, message: availability.error.message }
            : { code: migrationIssue.code, message: migrationIssue.message },
        },
      }
    }
    if (!context.referenced) {
      return {
        success: true,
        data: {
          configured: false,
          storageAvailable: availability.available,
          backend: availability.backend,
          error: availability.error
            ? { code: availability.error.code, message: availability.error.message }
            : migrationIssue
              ? { code: migrationIssue.code, message: migrationIssue.message }
              : null,
        },
      }
    }
    const present = this.options.credentialService.hasCredential(context.credentialId)
    if (!present.success) return present
    const binding = present.data
      ? this.options.credentialService.getCredentialBinding(context.credentialId)
      : { success: true as const, data: null }
    const mismatch = binding.success && present.data && !bindingMatches(binding.data, context.binding)
    return {
      success: true,
      data: {
        configured: present.data && !mismatch,
        storageAvailable: availability.available,
        backend: availability.backend,
        error: mismatch
          ? { code: 'BINDING_MISMATCH', message: 'Provider 或接口地址已变更，请重新保存凭据完成绑定。' }
          : availability.error
            ? { code: availability.error.code, message: availability.error.message }
            : migrationIssue
              ? { code: migrationIssue.code, message: migrationIssue.message }
              : null,
      },
    }
  }

  public save(target: CredentialScope, secret: string): ControllerResult<{ configured: true }> {
    if (!secret.trim() || secret.length > 4096) {
      return error('INVALID_INPUT', 'API Key 无效或过长。', false)
    }
    const context = this.resolveContext(target)
    const committed = this.options.credentialService.saveCredentialWithCommit(
      context.credentialId,
      secret,
      context.binding,
      () => this.writeReference(context),
    )
    if (!committed.success) return committed
    this.clearMigrationIssuesFor(target)
    this.options.invalidateRuntimes?.()
    return { success: true, data: { configured: true } }
  }

  public delete(target: CredentialScope): ControllerResult<{
    deleted: boolean
    referencesCleared: boolean
    remaining: number
  }> {
    const context = this.resolveContext(target)
    if (!context.referenced) {
      return { success: true, data: { deleted: false, referencesCleared: true, remaining: 0 } }
    }
    const removed = this.options.credentialService.deleteCredential(context.credentialId)
    if (!removed.success) return removed
    const verified = this.options.credentialService.hasCredential(context.credentialId)
    if (!verified.success) return verified
    if (verified.data) {
      return error('STORAGE_WRITE_FAILED', '系统安全存储未能删除凭据，配置引用保持不变。', true)
    }

    this.options.invalidateRuntimes?.()
    try {
      this.clearReference(context)
      return {
        success: true,
        data: { deleted: removed.data, referencesCleared: true, remaining: 0 },
      }
    } catch {
      return {
        success: false,
        error: {
          code: 'PARTIAL_FAILURE',
          message: '凭据已从安全存储删除，但配置引用清理失败。凭据已不可使用，请重试清理。',
          retryable: true,
        },
        data: { deleted: removed.data, referencesCleared: false, remaining: 0 },
      }
    }
  }

  public async test(target: CredentialScope): Promise<ControllerResult<{ message: string }>> {
    const context = this.resolveContext(target)
    if (!context.referenced) return error('NOT_FOUND', '尚未配置模型凭据。', false)
    const present = this.options.credentialService.hasCredential(context.credentialId)
    if (!present.success) return present
    if (!present.data) return error('NOT_FOUND', '未找到已保存的 API Key。', false)
    const binding = this.options.credentialService.getCredentialBinding(context.credentialId)
    if (!binding.success) return binding
    if (!bindingMatches(binding.data, context.binding)) {
      return error(
        'BINDING_MISMATCH',
        'Provider 或接口地址与凭据绑定不一致，请重新保存凭据。',
        false,
      )
    }
    const credential = this.options.credentialService.getCredential(context.credentialId)
    if (!credential.success) return credential

    const controller = new AbortController()
    const timeoutMs = this.options.testTimeoutMs ?? 10_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const secureFetch = createSecureFetch(this.options.fetchImpl ?? fetch)
      const response = await secureFetch(testEndpoint(context.binding), {
        headers: requestHeaders(context.binding.provider, credential.data),
        signal: controller.signal,
      })
      if (!response.ok) {
        return error(
          'UNAVAILABLE',
          `连接测试失败（HTTP ${response.status}）。请检查 Provider、网络和 API Key。`,
          response.status >= 500,
        )
      }
      return { success: true, data: { message: '连接测试成功。' } }
    } catch (caught) {
      if (controller.signal.aborted) {
        return error('TEST_TIMEOUT', '连接测试超时，请检查网络或接口地址后重试。', true)
      }
      return error(
        'UNAVAILABLE',
        sanitizeErrorMessage(caught, '连接测试失败，请检查网络后重试。'),
        true,
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  public deleteAll(): ControllerResult<DeleteAllSummary> {
    const before = this.options.credentialService.listCredentialIds()
    if (!before.success) return before
    const removed = this.options.credentialService.deleteAllCredentials()
    if (!removed.success) {
      return {
        success: false,
        error: removed.error,
        data: {
          deleted: 0,
          failed: before.data.length,
          referencesCleared: false,
          remaining: before.data.length,
        },
      }
    }
    const after = this.options.credentialService.listCredentialIds()
    if (!after.success) return after
    if (after.data.length > 0) {
      return {
        success: false,
        error: {
          code: 'STORAGE_WRITE_FAILED',
          message: '部分模型凭据未能从安全存储删除，配置引用保持不变。',
          retryable: true,
        },
        data: {
          deleted: before.data.length - after.data.length,
          failed: after.data.length,
          referencesCleared: false,
          remaining: after.data.length,
        },
      }
    }

    this.options.invalidateRuntimes?.()
    try {
      this.clearAllReferences()
      return {
        success: true,
        data: {
          deleted: removed.data,
          failed: 0,
          referencesCleared: true,
          remaining: 0,
        },
      }
    } catch {
      return {
        success: false,
        error: {
          code: 'PARTIAL_FAILURE',
          message: '模型凭据已全部删除，但部分配置引用清理失败。凭据已不可使用，请重试清理。',
          retryable: true,
        },
        data: {
          deleted: removed.data,
          failed: 0,
          referencesCleared: false,
          remaining: 0,
        },
      }
    }
  }

  private getDefaultLlmConfig(configId: string | null, projectId: string): LlmConfigRow | undefined {
    if (!configId || !this.options.database || !hasColumn(this.options.database, 'llm_configs', 'credential_id')) {
      return undefined
    }
    return this.options.database.prepare<LlmConfigRow>(
      `SELECT id, project_id, provider, base_url, credential_id
       FROM llm_configs WHERE id = ? AND project_id = ?`,
    ).get(configId, projectId)
  }

  private migrationIssueFor(target: CredentialScope): CredentialMigrationIssue | undefined {
    return this.migrationIssues.find((issue) => {
      if (target.scope === 'app') {
        return issue.source === 'settings' && issue.identifier === 'app-default'
      }
      return issue.source === 'database'
        && issue.identifier.startsWith(`${target.projectId}:`)
    })
  }

  private clearMigrationIssuesFor(target: CredentialScope): void {
    const current = this.migrationIssueFor(target)
    if (!current) return
    this.migrationIssues = this.migrationIssues.filter((issue) => issue !== current)
  }

  private writeReference(context: ResolvedCredentialContext): boolean {
    if (context.target.scope === 'app') {
      const settings = this.readSettings()
      delete settings.apiKey
      delete settings.api_key
      settings.credentialId = context.credentialId
      return this.writeSettings(settings)
    }
    if (context.llmConfigId && this.options.database) {
      const plaintextAssignment = hasColumn(this.options.database, 'llm_configs', 'api_key')
        ? ", api_key = ''"
        : ''
      const result = this.options.database
        .prepare(
          `UPDATE llm_configs SET credential_id = ?${plaintextAssignment}
           WHERE id = ? AND project_id = ?`,
        )
        .run(context.credentialId, context.llmConfigId, context.target.projectId)
      return result.changes === 1
    }
    const current = this.options.workbenchService!.getProjectConfig(context.target.projectId)
    this.options.workbenchService!.updateProjectConfig(
      context.target.projectId,
      { settings: { ...current.settings, llmCredentialId: context.credentialId } },
      current.version,
    )
    return true
  }

  private clearReference(context: ResolvedCredentialContext): void {
    if (context.target.scope === 'app') {
      const settings = this.readSettings()
      delete settings.credentialId
      if (!this.writeSettings(settings)) throw new Error('settings reference cleanup failed')
    } else if (context.llmConfigId && this.options.database) {
      const result = this.options.database
        .prepare("UPDATE llm_configs SET credential_id = '' WHERE id = ? AND project_id = ?")
        .run(context.llmConfigId, context.target.projectId)
      if (result.changes !== 1) throw new Error('llm config reference cleanup failed')
    } else {
      const current = this.options.workbenchService!.getProjectConfig(context.target.projectId)
      const settings = { ...current.settings }
      delete settings.llmCredentialId
      this.options.workbenchService!.updateProjectConfig(
        context.target.projectId,
        { settings },
        current.version,
      )
    }
    this.clearDatabaseCredentialReference(context.credentialId)
  }

  private clearDatabaseCredentialReference(credentialId: string): void {
    if (!this.options.database || !hasColumn(this.options.database, 'llm_configs', 'credential_id')) return
    this.options.database
      .prepare("UPDATE llm_configs SET credential_id = '' WHERE credential_id = ?")
      .run(credentialId)
  }

  private clearAllReferences(): void {
    const settings = this.readSettings()
    delete settings.credentialId
    if (!this.writeSettings(settings)) throw new Error('global reference cleanup failed')
    for (const project of this.options.workbenchService?.listProjects() ?? []) {
      const current = this.options.workbenchService!.getProjectConfig(project.id)
      if (!('llmCredentialId' in current.settings)) continue
      const next = { ...current.settings }
      delete next.llmCredentialId
      this.options.workbenchService!.updateProjectConfig(
        project.id,
        { settings: next },
        current.version,
      )
    }
    if (this.options.database && hasColumn(this.options.database, 'llm_configs', 'credential_id')) {
      this.options.database.exec("UPDATE llm_configs SET credential_id = ''")
    }
  }
}

export function parseCredentialScope(value: unknown): CredentialScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('credential scope is invalid')
  }
  const record = value as Record<string, unknown>
  if (record.scope === 'app') return { scope: 'app' }
  if (record.scope !== 'project') throw new Error('credential scope is invalid')
  const projectId = nonEmptyString(record.projectId)
  if (!projectId) throw new Error('projectId is required')
  return { scope: 'project', projectId }
}

export function toSafeControllerFailure(caught: unknown): CredentialResult<never> {
  return error('INVALID_INPUT', sanitizeErrorMessage(caught), false)
}
