import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initializeDatabase, type SqliteDatabase } from '@/main/database'
import { createWorkbenchService, type WorkbenchService } from '@/main/workbench'
import {
  CredentialService,
  type SafeStorageAdapter,
} from '@/main/security/credentialService'
import { LlmCredentialController } from '@/main/security/llmCredentialController'

const TEST_SECRET = 'sk-test-secret-do-not-expose-123456'

class FakeSafeStorage implements SafeStorageAdapter {
  public isEncryptionAvailable(): boolean { return true }
  public encryptString(value: string): Buffer { return Buffer.from(`encrypted:${value}`, 'utf8') }
  public decryptString(value: Buffer): string {
    const decoded = value.toString('utf8')
    if (!decoded.startsWith('encrypted:')) throw new Error('corrupted payload')
    return decoded.slice('encrypted:'.length)
  }
}

describe('LlmCredentialController', () => {
  let root: string
  let database: SqliteDatabase
  let workbench: WorkbenchService
  let service: CredentialService
  let settings: Record<string, unknown>
  let projectId: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-credential-controller-'))
    database = initializeDatabase(root)
    workbench = createWorkbenchService(database, { projectRoot: root })
    projectId = workbench.createProject({ slug: 'secure-project', name: 'Secure Project' }).id
    const config = workbench.getProjectConfig(projectId)
    workbench.updateProjectConfig(
      projectId,
      {
        settings: {
          llmProvider: 'anthropic',
          llmBaseUrl: 'https://project.example/v1',
        },
      },
      config.version,
    )
    service = new CredentialService(root, new FakeSafeStorage(), 'win32')
    settings = {
      provider: 'openai',
      baseUrl: 'https://app.example/v1',
    }
  })

  afterEach(() => {
    database.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  function controller(overrides: {
    fetchImpl?: typeof fetch
    testTimeoutMs?: number
    writeSettings?: (value: Record<string, unknown>) => boolean
    invalidateRuntimes?: () => void
    migrationIssues?: Array<{
      source: 'settings' | 'database'
      identifier: string
      code: string
      message: string
    }>
  } = {}): LlmCredentialController {
    return new LlmCredentialController({
      userDataPath: root,
      credentialService: service,
      workbenchService: workbench,
      database,
      readSettings: () => ({ ...settings }),
      writeSettings: overrides.writeSettings ?? ((value) => {
        settings = { ...value }
        return true
      }),
      fetchImpl: overrides.fetchImpl,
      testTimeoutMs: overrides.testTimeoutMs,
      invalidateRuntimes: overrides.invalidateRuntimes,
      migrationIssues: overrides.migrationIssues,
    })
  }

  it('tests a project credential with its own provider, base URL, and header', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 } as Response))
    const subject = controller({ fetchImpl: fetchMock as typeof fetch })
    expect(subject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)

    const result = await subject.test({ scope: 'project', projectId })
    expect(result).toEqual({ success: true, data: { message: '连接测试成功。' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://project.example/v1/models')
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.headers).toEqual({
      'x-api-key': TEST_SECRET,
      'anthropic-version': '2023-06-01',
    })
  })

  it('keeps app-scope connection testing independent from project configuration', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 } as Response))
    const subject = controller({ fetchImpl: fetchMock as typeof fetch })
    expect(subject.save({ scope: 'app' }, TEST_SECRET).success).toBe(true)
    expect(await subject.test({ scope: 'app' })).toMatchObject({ success: true })
    expect(fetchMock.mock.calls[0][0]).toBe('https://app.example/v1/models')
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toEqual({
      Authorization: `Bearer ${TEST_SECRET}`,
    })
  })

  it('rejects changed bindings before fetch and never exposes the secret', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 } as Response))
    const subject = controller({ fetchImpl: fetchMock as typeof fetch })
    expect(subject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)
    const config = workbench.getProjectConfig(projectId)
    workbench.updateProjectConfig(
      projectId,
      { settings: { ...config.settings, llmBaseUrl: 'https://changed.example/v1' } },
      config.version,
    )

    const result = await subject.test({ scope: 'project', projectId })
    expect(result).toMatchObject({ success: false, error: { code: 'BINDING_MISMATCH' } })
    expect(JSON.stringify(result)).not.toContain(TEST_SECRET)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an invalid legacy URL as unconfigured without allowing runtime or test requests', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 } as Response))
    settings = {
      provider: 'openai',
      baseUrl: 'http://192.168.1.20:11434',
      apiKey: TEST_SECRET,
    }
    const subject = controller({
      fetchImpl: fetchMock as typeof fetch,
      migrationIssues: [{
        source: 'settings',
        identifier: 'app-default',
        code: 'INSECURE_LEGACY_LLM_BASE_URL',
        message: '历史模型接口地址不符合当前安全策略，请重新配置。',
      }],
    })

    expect(subject.status({ scope: 'app' })).toMatchObject({
      success: true,
      data: {
        configured: false,
        error: { code: 'INSECURE_LEGACY_LLM_BASE_URL' },
      },
    })
    await expect(subject.test({ scope: 'app' })).rejects.toThrow(
      'baseUrl must use https unless it targets a loopback address',
    )
    expect(fetchMock).not.toHaveBeenCalled()

    settings.baseUrl = 'https://app.example/v1'
    expect(subject.save({ scope: 'app' }, TEST_SECRET)).toMatchObject({ success: true })
    expect(subject.status({ scope: 'app' })).toMatchObject({
      success: true,
      data: { configured: true, error: null },
    })
    expect(settings.apiKey).toBeUndefined()
  })

  it('resolves runtime endpoints from project ownership instead of renderer input', () => {
    const subject = controller()
    expect(subject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)
    expect(subject.runtimeConfig(projectId, {
      provider: 'openai',
      baseUrl: 'https://renderer-controlled.example/v1',
      model: 'test-model',
      credentialId: 'renderer-controlled-id',
    })).toMatchObject({
      provider: 'anthropic',
      baseUrl: 'https://project.example/v1',
      model: 'test-model',
    })
    expect(subject.runtimeConfig(projectId, {
      baseUrl: 'https://renderer-controlled.example/v1',
      model: 'test-model',
    }).credentialId).not.toBe('renderer-controlled-id')
  })

  it('returns a safe timeout and sanitizes provider errors', async () => {
    const hangingFetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error(`Bearer ${TEST_SECRET}`)))
      }))
    const timeoutSubject = controller({
      fetchImpl: hangingFetch as typeof fetch,
      testTimeoutMs: 5,
    })
    expect(timeoutSubject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)
    expect(await timeoutSubject.test({ scope: 'project', projectId })).toMatchObject({
      success: false,
      error: { code: 'TEST_TIMEOUT' },
    })

    const failedFetch = jest.fn(async () => {
      throw new Error(`Authorization: Bearer ${TEST_SECRET}`)
    })
    const failure = await controller({ fetchImpl: failedFetch as typeof fetch })
      .test({ scope: 'project', projectId })
    expect(JSON.stringify(failure)).not.toContain(TEST_SECRET)
  })

  it('preserves references and configured status when secure deletion fails', () => {
    const subject = controller()
    expect(subject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)
    jest.spyOn(service, 'deleteCredential').mockReturnValue({
      success: false,
      error: { code: 'STORAGE_WRITE_FAILED', message: 'safe failure', retryable: true },
    })

    expect(subject.delete({ scope: 'project', projectId })).toMatchObject({
      success: false,
      error: { code: 'STORAGE_WRITE_FAILED' },
    })
    expect(workbench.getProjectConfig(projectId).settings.llmCredentialId).toBeDefined()
    expect(subject.status({ scope: 'project', projectId })).toMatchObject({
      success: true,
      data: { configured: true },
    })
  })

  it('invalidates runtimes after deletion and reports orphan-reference cleanup failures', async () => {
    let invalidations = 0
    const subject = controller({
      invalidateRuntimes: () => { invalidations += 1 },
      writeSettings: () => false,
    })
    settings.credentialId = 'llm:app-default'
    expect(service.saveCredential(
      'llm:app-default',
      TEST_SECRET,
      { provider: 'openai', baseUrl: 'https://app.example/v1' },
    ).success).toBe(true)

    const deleted = subject.delete({ scope: 'app' })
    expect(deleted).toMatchObject({
      success: false,
      error: { code: 'PARTIAL_FAILURE' },
      data: { referencesCleared: false, remaining: 0 },
    })
    expect(invalidations).toBe(1)
    expect(service.hasCredential('llm:app-default')).toEqual({ success: true, data: false })
    expect(await subject.test({ scope: 'app' })).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('rolls back replacement when settings persistence fails', () => {
    settings.credentialId = 'llm:app-default'
    expect(service.saveCredential(
      'llm:app-default',
      TEST_SECRET,
      { provider: 'openai', baseUrl: 'https://app.example/v1' },
    ).success).toBe(true)
    const subject = controller({ writeSettings: () => false })
    const result = subject.save(
      { scope: 'app' },
      'sk-test-secret-do-not-expose-replacement',
    )
    expect(result).toMatchObject({
      success: false,
      error: { code: 'REFERENCE_WRITE_FAILED' },
    })
    expect(service.getCredential('llm:app-default')).toEqual({
      success: true,
      data: TEST_SECRET,
    })
  })

  it('deletes all LLM credentials before clearing every reference', () => {
    const subject = controller()
    expect(subject.save({ scope: 'app' }, TEST_SECRET).success).toBe(true)
    expect(subject.save({ scope: 'project', projectId }, TEST_SECRET).success).toBe(true)

    expect(subject.deleteAll()).toEqual({
      success: true,
      data: {
        deleted: 2,
        failed: 0,
        referencesCleared: true,
        remaining: 0,
      },
    })
    expect(settings.credentialId).toBeUndefined()
    expect(workbench.getProjectConfig(projectId).settings.llmCredentialId).toBeUndefined()
    expect(service.listCredentialIds()).toEqual({ success: true, data: [] })
  })
})
