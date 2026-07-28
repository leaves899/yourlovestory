import type {
  BackupRecord,
  BackupRetentionPolicy,
  BackupVerificationResult,
  CreateBackupOptions,
  PruneResult,
  RestorePreparationResult,
} from '../../shared/backup/types'

export * from '../../shared/backup/types'

export interface BackupService {
  createBackup(options: CreateBackupOptions): Promise<BackupRecord>
  listBackups(): Promise<BackupRecord[]>
  verifyBackup(id: string): Promise<BackupVerificationResult>
  restoreBackup(id: string): Promise<RestorePreparationResult>
  pruneBackups(
    policy: BackupRetentionPolicy,
    protectedBackupIds?: readonly string[],
  ): Promise<PruneResult>
}

export const DEFAULT_BACKUP_RETENTION_POLICY: BackupRetentionPolicy = {
  maxBackups: 10,
  maxAgeDays: 30,
}
