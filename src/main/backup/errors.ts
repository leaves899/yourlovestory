import type { BackupError, BackupErrorCode } from '../../shared/backup/types'

const MESSAGES: Record<BackupErrorCode, string> = {
  BACKUP_NOT_FOUND: '找不到指定的数据库备份。',
  BACKUP_INVALID: '数据库备份无效，无法继续操作。',
  BACKUP_CHECKSUM_MISMATCH: '数据库备份校验失败。',
  BACKUP_NOT_ALLOWED: '当前数据库状态不允许创建或恢复备份。',
  DATABASE_UNAVAILABLE: '数据库当前不可用。',
  DATABASE_RECOVERY_REQUIRED: '数据库需要恢复后才能继续使用。',
  RESTORE_FAILED: '数据库恢复失败，已保留现有恢复选项。',
  RESTORE_ROLLBACK_FAILED: '数据库恢复和回滚均失败，需要从恢复中心处理。',
  LOCAL_IO_ERROR: '本地备份操作失败，请重试。',
}

export class BackupOperationError extends Error {
  public constructor(
    public readonly code: BackupErrorCode,
    message = MESSAGES[code],
  ) {
    super(message)
    this.name = 'BackupOperationError'
  }
}

export function toBackupError(error: unknown, fallback: BackupErrorCode): BackupError {
  if (error instanceof BackupOperationError) {
    return { code: error.code, message: error.message }
  }
  return { code: fallback, message: MESSAGES[fallback] }
}

export function backupError(code: BackupErrorCode): BackupOperationError {
  return new BackupOperationError(code)
}
