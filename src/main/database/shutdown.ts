export interface DatabaseShutdownResult {
  databaseClosed: boolean
  serviceCleanupFailed: boolean
  /** True only when active task completions fully settled before close. */
  drained: boolean
}

export interface QuiesceResult {
  drained: boolean
}

/** The Electron process may exit only after writers drained and the DB closed. */
export function canExitAfterShutdown(result: DatabaseShutdownResult): boolean {
  return result.drained && result.databaseClosed
}

interface DisposableResource {
  dispose(): void
}

interface QuiesceableTaskManager extends DisposableResource {
  quiesceForShutdown?(timeoutMs?: number): Promise<QuiesceResult | void>
  invalidateActiveRuntimes?(): void
}

interface ClosableDatabaseResource {
  close(): void
}

export interface ShutdownDatabaseResourcesOptions {
  taskManager: QuiesceableTaskManager | null
  assistantService: DisposableResource | null
  database: ClosableDatabaseResource | null
  /** When true, wait for active task completions before closing the database. */
  awaitQuiesce?: boolean
  quiesceTimeoutMs?: number
}

/**
 * Shut down services then close the database.
 * DB close/replace is allowed only when quiesce reports drained=true (or no await).
 * Timeout must never close a live database while async writers may still run.
 */
export async function shutdownDatabaseResources(
  options: ShutdownDatabaseResourcesOptions,
): Promise<DatabaseShutdownResult> {
  let serviceCleanupFailed = false
  let drained = true
  const awaitQuiesce = options.awaitQuiesce !== false

  try {
    if (awaitQuiesce && options.taskManager?.quiesceForShutdown) {
      const result = await options.taskManager.quiesceForShutdown(options.quiesceTimeoutMs)
      if (result && typeof result === 'object' && 'drained' in result) {
        drained = result.drained === true
      }
    } else {
      options.taskManager?.dispose()
    }
  } catch {
    serviceCleanupFailed = true
    if (awaitQuiesce) {
      // Quiesce path: do not close DB when drain/cleanup is uncertain.
      drained = false
    }
    try {
      options.taskManager?.dispose()
    } catch {
      // keep going; DB close still gated on drained for awaitQuiesce
    }
  }

  if (awaitQuiesce && !drained) {
    // Never close/replace the live DB when completions may still write.
    return {
      databaseClosed: false,
      serviceCleanupFailed,
      drained: false,
    }
  }

  try {
    options.assistantService?.dispose()
  } catch {
    serviceCleanupFailed = true
  }

  let databaseClosed = options.database === null
  if (options.database) {
    try {
      options.database.close()
      databaseClosed = true
    } catch {
      databaseClosed = false
    }
  }

  return {
    databaseClosed,
    serviceCleanupFailed,
    drained: true,
  }
}
