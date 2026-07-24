import * as fs from 'node:fs'
import * as path from 'node:path'

export type CredentialErrorCode =
  | 'UNAVAILABLE'
  | 'UNSAFE_BACKEND'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'ENCRYPT_FAILED'
  | 'DECRYPT_FAILED'
  | 'CORRUPTED'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'REFERENCE_WRITE_FAILED'
  | 'ROLLBACK_FAILED'
  | 'BINDING_MISMATCH'
  | 'TEST_TIMEOUT'
  | 'PARTIAL_FAILURE'

export interface CredentialError {
  code: CredentialErrorCode
  message: string
  retryable: boolean
}

export type CredentialResult<T> =
  | { success: true; data: T }
  | { success: false; error: CredentialError }

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  getSelectedStorageBackend?(): string
}

export interface CredentialAvailability {
  available: boolean
  platform: NodeJS.Platform
  backend: string
  error?: CredentialError
}

export interface CredentialBinding {
  provider: string
  baseUrl: string
}

interface CredentialFile {
  version: 1
  credentials: Record<string, { payload: string; updatedAt: string; binding?: CredentialBinding }>
}

const FILE_VERSION = 1 as const
const CREDENTIAL_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{2,127}$/i

function fail<T>(code: CredentialErrorCode, message: string, retryable: boolean): CredentialResult<T> {
  return { success: false, error: { code, message, retryable } }
}

function isCredentialFile(value: unknown): value is CredentialFile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<CredentialFile>
  if (
    candidate.version !== FILE_VERSION
    || !candidate.credentials
    || typeof candidate.credentials !== 'object'
  ) {
    return false
  }
  return Object.values(candidate.credentials).every((record) =>
    Boolean(
      record
      && typeof record === 'object'
      && typeof record.payload === 'string'
      && typeof record.updatedAt === 'string',
    ),
  )
}

function decodePayload(value: string): Buffer | null {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  const decoded = Buffer.from(value, 'base64')
  return decoded.length > 0 && decoded.toString('base64') === value ? decoded : null
}

/** Main-process only wrapper around Electron safeStorage. */
export class CredentialService {
  private readonly filePath: string

  public constructor(
    userDataPath: string,
    private readonly safeStorage: SafeStorageAdapter,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.filePath = path.join(userDataPath, 'security', 'llm-credentials.json')
  }

  public availability(): CredentialAvailability {
    let encryptionAvailable = false
    try {
      encryptionAvailable = this.safeStorage.isEncryptionAvailable()
    } catch {
      return {
        available: false,
        platform: this.platform,
        backend: 'unknown',
        error: { code: 'UNAVAILABLE', message: '系统安全存储不可用，请检查系统凭据服务后重试。', retryable: true },
      }
    }
    const backend = this.platform === 'linux'
      ? this.safeStorage.getSelectedStorageBackend?.() ?? 'unknown'
      : this.platform === 'darwin' ? 'keychain' : this.platform === 'win32' ? 'dpapi' : 'unknown'
    if (!encryptionAvailable) {
      return {
        available: false,
        platform: this.platform,
        backend,
        error: { code: 'UNAVAILABLE', message: '系统安全存储不可用。不会以明文保存 API Key。', retryable: true },
      }
    }
    if (this.platform === 'linux' && (backend === 'basic_text' || backend === 'unknown')) {
      return {
        available: false,
        platform: this.platform,
        backend,
        error: {
          code: 'UNSAFE_BACKEND',
          message: 'Linux 未检测到安全密钥环。请启用 GNOME Keyring、KWallet 或 Secret Service 后重试。',
          retryable: true,
        },
      }
    }
    return { available: true, platform: this.platform, backend }
  }

  public hasCredential(credentialId: string): CredentialResult<boolean> {
    if (!this.isValidId(credentialId)) return fail('INVALID_INPUT', '凭据引用无效。', false)
    const file = this.readFile()
    if (!file.success) return file
    return { success: true, data: Boolean(file.data.credentials[credentialId]) }
  }

  public saveCredential(credentialId: string, secret: string, binding?: CredentialBinding): CredentialResult<void> {
    if (!this.isValidId(credentialId) || !secret.trim()) {
      return fail('INVALID_INPUT', '凭据引用或 API Key 无效。', false)
    }
    const availability = this.availability()
    if (!availability.available) return { success: false, error: availability.error! }

    let encrypted: Buffer
    try {
      encrypted = this.safeStorage.encryptString(secret)
    } catch {
      return fail('ENCRYPT_FAILED', '无法加密 API Key，原有配置未被修改。', true)
    }
    try {
      if (this.safeStorage.decryptString(encrypted) !== secret) {
        return fail('ENCRYPT_FAILED', '加密凭据验证失败，原有配置未被修改。', true)
      }
    } catch {
      return fail('DECRYPT_FAILED', '无法验证已加密的 API Key，原有配置未被修改。', true)
    }

    const file = this.readFile()
    if (!file.success) return file
    const next: CredentialFile = {
      version: FILE_VERSION,
      credentials: {
        ...file.data.credentials,
        [credentialId]: { payload: encrypted.toString('base64'), updatedAt: this.now(), ...(binding ? { binding } : {}) },
      },
    }
    return this.writeFile(next)
  }

  /**
   * Replaces a credential and commits its ordinary-storage reference as one
   * recoverable operation. If the reference write fails, the exact prior
   * encrypted record set is restored; plaintext is never used for rollback.
   */
  public saveCredentialWithCommit(
    credentialId: string,
    secret: string,
    binding: CredentialBinding,
    commitReference: () => boolean | void,
  ): CredentialResult<void> {
    const previous = this.readFile()
    if (!previous.success) return previous
    const saved = this.saveCredential(credentialId, secret, binding)
    if (!saved.success) return saved

    try {
      if (commitReference() === false) {
        throw new Error('reference write failed')
      }
      return { success: true, data: undefined }
    } catch {
      const rolledBack = this.writeFile(previous.data)
      if (!rolledBack.success) {
        return fail(
          'ROLLBACK_FAILED',
          '配置引用写入失败，且无法恢复原加密凭据。请勿继续使用并重试保存。',
          true,
        )
      }
      return fail('REFERENCE_WRITE_FAILED', '配置引用写入失败，原加密凭据已恢复。', true)
    }
  }

  /** This method is intentionally main-process only and is never bridged to renderer. */
  public getCredential(credentialId: string): CredentialResult<string> {
    if (!this.isValidId(credentialId)) return fail('INVALID_INPUT', '凭据引用无效。', false)
    const availability = this.availability()
    if (!availability.available) return { success: false, error: availability.error! }
    const file = this.readFile()
    if (!file.success) return file
    const record = file.data.credentials[credentialId]
    if (!record) return fail('NOT_FOUND', '未找到已保存的 API Key。', false)
    try {
      const payload = decodePayload(record.payload)
      if (!payload) return fail('CORRUPTED', '已保存的凭据数据损坏。', false)
      return { success: true, data: this.safeStorage.decryptString(payload) }
    } catch {
      return fail('DECRYPT_FAILED', '无法解密已保存的 API Key，请重新保存凭据。', false)
    }
  }

  public deleteCredential(credentialId: string): CredentialResult<boolean> {
    if (!this.isValidId(credentialId)) return fail('INVALID_INPUT', '凭据引用无效。', false)
    const file = this.readFile()
    if (!file.success) return file
    if (!file.data.credentials[credentialId]) return { success: true, data: false }
    const credentials = { ...file.data.credentials }
    delete credentials[credentialId]
    const written = this.writeFile({ version: FILE_VERSION, credentials })
    return written.success ? { success: true, data: true } : written
  }

  /** Metadata only. This never returns encrypted data or a plaintext credential. */
  public getCredentialBinding(credentialId: string): CredentialResult<CredentialBinding | null> {
    if (!this.isValidId(credentialId)) return fail('INVALID_INPUT', '凭据引用无效。', false)
    const file = this.readFile()
    if (!file.success) return file
    return { success: true, data: file.data.credentials[credentialId]?.binding ?? null }
  }

  public deleteAllCredentials(): CredentialResult<number> {
    const file = this.readFile()
    if (!file.success) return file
    const count = Object.keys(file.data.credentials).length
    const written = this.writeFile({ version: FILE_VERSION, credentials: {} })
    return written.success ? { success: true, data: count } : written
  }

  /** Main-process metadata used to verify scoped bulk deletion. */
  public listCredentialIds(): CredentialResult<string[]> {
    const file = this.readFile()
    if (!file.success) return file
    return { success: true, data: Object.keys(file.data.credentials) }
  }

  private isValidId(value: string): boolean {
    return CREDENTIAL_ID_PATTERN.test(value)
  }

  private readFile(): CredentialResult<CredentialFile> {
    try {
      if (!fs.existsSync(this.filePath)) return { success: true, data: { version: FILE_VERSION, credentials: {} } }
      const raw = fs.readFileSync(this.filePath, 'utf8')
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return fail('CORRUPTED', '凭据存储文件损坏，已拒绝覆盖。', false)
      }
      if (!isCredentialFile(parsed)) return fail('CORRUPTED', '凭据存储文件损坏，已拒绝覆盖。', false)
      return { success: true, data: parsed }
    } catch {
      return fail('STORAGE_READ_FAILED', '无法读取凭据存储文件。', true)
    }
  }

  private writeFile(value: CredentialFile): CredentialResult<void> {
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    try {
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(temporaryPath, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(temporaryPath, this.filePath)
      return { success: true, data: undefined }
    } catch {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath) } catch { /* best effort */ }
      return fail('STORAGE_WRITE_FAILED', '无法写入加密凭据，原有配置未被修改。', true)
    }
  }
}
