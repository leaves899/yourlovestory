export interface DatabaseShutdownResult {
  databaseClosed: boolean
  serviceCleanupFailed: boolean
}

interface DisposableResource {
  dispose(): void
}

interface QuiesceableTaskManager extends DisposableResource {
  quiesceForShutdown?(timeoutMs?: number): Promise<void>
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
 * Shut down services then close the database. When awaitQuiesce is true (default),
 * active task completions are drained before any DB close so terminal writes finish.
 */
export async function shutdownDatabaseResources(
  options: ShutdownDatabaseResourcesOptions,
): Promise<DatabaseShutdownResult> {
  let serviceCleanupFailed = false
  const awaitQuiesce = options.awaitQuiesce !== false

  try {
    if (awaitQuiesce && options.taskManager?.quiesceForShutdown) {
      await options.taskManager.quiesceForShutdown(options.quiesceTimeoutMs)
    } else {
      options.taskManager?.dispose()
    }
  } catch {
    serviceCleanupFailed = true
    try {
      options.taskManager?.dispose()
    } catch {
      // keep going toward DB close
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
  }
}
