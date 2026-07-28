import {
  DATABASE_STATUS_CHANGED_CHANNEL,
  type DatabaseStatus,
} from '../../shared/backup/types'

export { DATABASE_STATUS_CHANGED_CHANNEL }

export type DatabaseStatusSink = (status: DatabaseStatus) => void

export class DatabaseRuntimeStatus {
  public constructor(
    private status: DatabaseStatus,
    private readonly emit: DatabaseStatusSink = () => undefined,
  ) {}

  public get(): DatabaseStatus {
    return this.status
  }

  public replace(status: DatabaseStatus): void {
    this.status = status
    try {
      this.emit(status)
    } catch {
      // Runtime state is authoritative; renderer notification is best effort.
    }
  }

  public beginRestore(): void {
    this.replace({
      ...this.status,
      state: 'restoring',
      message: '数据库正在恢复，业务功能已暂停。',
      backupAllowed: false,
      backupEligibility: 'database-unavailable',
      backupBlockedReason: '数据库恢复进行中。',
    })
  }

  public requireRecovery(): void {
    this.replace({
      ...this.status,
      state: 'recovery-required',
      integrity: 'unknown',
      message: '数据库恢复未完成，请从恢复中心重试。',
      backupAllowed: false,
      backupEligibility: 'database-unavailable',
      backupBlockedReason: '数据库恢复未完成。',
    })
  }
}
