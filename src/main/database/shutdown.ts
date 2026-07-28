export interface DatabaseShutdownResult {
  databaseClosed: boolean
  serviceCleanupFailed: boolean
}

interface DisposableResource {
  dispose(): void
}

interface ClosableDatabaseResource {
  close(): void
}

export interface ShutdownDatabaseResourcesOptions {
  taskManager: DisposableResource | null
  assistantService: DisposableResource | null
  database: ClosableDatabaseResource | null
}

export function shutdownDatabaseResources(
  options: ShutdownDatabaseResourcesOptions,
): DatabaseShutdownResult {
  let serviceCleanupFailed = false

  try {
    options.taskManager?.dispose()
  } catch {
    serviceCleanupFailed = true
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
