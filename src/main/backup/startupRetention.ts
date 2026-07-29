import type {
  BackupCreationResult,
  BackupRetentionPolicy,
  PruneResult,
} from '../../shared/backup/types'
import {
  backupCleanupLogDetail,
  standalonePruneLogDetail,
} from '../../shared/backup/types'

/** Fixed startup retention event names for sanitized console warnings. */
export const STARTUP_RETENTION_EVENTS = {
  scheduledCleanup: 'backup.scheduled.cleanup-warning',
  startupPrune: 'backup.startup.prune-warning',
} as const

export type SafeRetentionLogDetail = Readonly<
  Record<string, string | number | boolean | null>
>

export type SafeRetentionLogger = (
  event: string,
  detail: SafeRetentionLogDetail,
) => void

export interface StartupRetentionBackupService {
  createScheduledBackupIfDue: (
    policy: BackupRetentionPolicy,
  ) => Promise<BackupCreationResult | null>
  pruneBackups: (
    policy: BackupRetentionPolicy,
    protectedBackupIds?: readonly string[],
  ) => Promise<PruneResult>
  listBackups: () => Promise<Array<{ createdAt: string }>>
}

export interface RunStartupRetentionOptions {
  backupService: StartupRetentionBackupService
  policy: BackupRetentionPolicy
  /**
   * Optional injectable logger. Defaults to a path-free console.warn of the
   * fixed event name and a JSON detail object (counts/codes only).
   */
  logSafeEvent?: SafeRetentionLogger
}

export interface StartupRetentionResult {
  /** Structured result when a scheduled backup was created; null when not due. */
  scheduled: BackupCreationResult | null
  /** True when a standalone startup prune ran (no scheduled backup this cycle). */
  ranStartupPrune: boolean
  lastBackupAt: string | null
}

function defaultSafeLogger(event: string, detail: SafeRetentionLogDetail): void {
  console.warn(event, JSON.stringify(detail))
}

/**
 * Startup retention: create a scheduled backup when due (with in-call prune),
 * otherwise run one startup prune. Never double-prunes after a scheduled create.
 * Cleanup failures never block app open and never log raw errors/paths.
 */
export async function runStartupBackupRetention(
  options: RunStartupRetentionOptions,
): Promise<StartupRetentionResult> {
  const log = options.logSafeEvent ?? defaultSafeLogger
  const { backupService, policy } = options

  const scheduled = await backupService.createScheduledBackupIfDue(policy)
  if (scheduled) {
    const detail = backupCleanupLogDetail(scheduled)
    if (detail) {
      log(STARTUP_RETENTION_EVENTS.scheduledCleanup, detail)
    }
    return {
      scheduled,
      ranStartupPrune: false,
      lastBackupAt: scheduled.backup.createdAt,
    }
  }

  let pruneOutcome: PruneResult | 'threw'
  try {
    pruneOutcome = await backupService.pruneBackups(policy, [])
  } catch {
    pruneOutcome = 'threw'
  }
  const pruneDetail = standalonePruneLogDetail(pruneOutcome)
  if (pruneDetail) {
    log(STARTUP_RETENTION_EVENTS.startupPrune, pruneDetail)
  }

  const listed = await backupService.listBackups()
  return {
    scheduled: null,
    ranStartupPrune: true,
    lastBackupAt: listed[0]?.createdAt ?? null,
  }
}
