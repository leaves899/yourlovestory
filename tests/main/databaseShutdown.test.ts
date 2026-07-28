import {
  DatabaseRuntimeStatus,
  shutdownDatabaseResources,
} from '@/main/database'
import type { DatabaseStatus } from '@/shared/backup/types'

const readyStatus = (): DatabaseStatus => ({
  state: 'ready',
  integrity: 'ok',
  schemaVersion: 8,
  message: null,
  lastBackupAt: null,
  backupAllowed: true,
  backupEligibility: 'safe',
  backupBlockedReason: null,
})

describe('database restore shutdown boundary', () => {
  test('continues assistant cleanup and database close when task cleanup fails', () => {
    const assistantDispose = jest.fn()
    const databaseClose = jest.fn()

    const result = shutdownDatabaseResources({
      taskManager: {
        dispose: () => {
          throw new Error('injected task cleanup failure')
        },
      },
      assistantService: { dispose: assistantDispose },
      database: { close: databaseClose },
    })

    expect(result).toEqual({
      databaseClosed: true,
      serviceCleanupFailed: true,
    })
    expect(assistantDispose).toHaveBeenCalledTimes(1)
    expect(databaseClose).toHaveBeenCalledTimes(1)
  })

  test('continues database close when assistant cleanup fails', () => {
    const taskDispose = jest.fn()
    const databaseClose = jest.fn()

    const result = shutdownDatabaseResources({
      taskManager: { dispose: taskDispose },
      assistantService: {
        dispose: () => {
          throw new Error('injected assistant cleanup failure')
        },
      },
      database: { close: databaseClose },
    })

    expect(result).toEqual({
      databaseClosed: true,
      serviceCleanupFailed: true,
    })
    expect(taskDispose).toHaveBeenCalledTimes(1)
    expect(databaseClose).toHaveBeenCalledTimes(1)
  })

  test('reports an unconfirmed database close as a critical shutdown failure', () => {
    const result = shutdownDatabaseResources({
      taskManager: null,
      assistantService: null,
      database: {
        close: () => {
          throw new Error('injected database close failure')
        },
      },
    })

    expect(result).toEqual({
      databaseClosed: false,
      serviceCleanupFailed: false,
    })
  })

  test('isolates status event sink failures from authoritative state transitions', () => {
    const runtimeStatus = new DatabaseRuntimeStatus(readyStatus(), () => {
      throw new Error('injected renderer event failure')
    })

    expect(() => runtimeStatus.beginRestore()).not.toThrow()
    expect(runtimeStatus.get()).toMatchObject({
      state: 'restoring',
      backupAllowed: false,
    })
    expect(() => runtimeStatus.requireRecovery()).not.toThrow()
    expect(runtimeStatus.get()).toMatchObject({
      state: 'recovery-required',
      backupAllowed: false,
    })
  })
})
