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
  test('continues assistant cleanup and database close when task cleanup fails', async () => {
    const assistantDispose = jest.fn()
    const databaseClose = jest.fn()

    const result = await shutdownDatabaseResources({
      taskManager: {
        dispose: () => {
          throw new Error('injected task cleanup failure')
        },
      },
      assistantService: { dispose: assistantDispose },
      database: { close: databaseClose },
      awaitQuiesce: false,
    })

    expect(result).toEqual({
      databaseClosed: true,
      serviceCleanupFailed: true,
    })
    expect(assistantDispose).toHaveBeenCalledTimes(1)
    expect(databaseClose).toHaveBeenCalledTimes(1)
  })

  test('continues database close when assistant cleanup fails', async () => {
    const taskDispose = jest.fn()
    const databaseClose = jest.fn()

    const result = await shutdownDatabaseResources({
      taskManager: { dispose: taskDispose },
      assistantService: {
        dispose: () => {
          throw new Error('injected assistant cleanup failure')
        },
      },
      database: { close: databaseClose },
      awaitQuiesce: false,
    })

    expect(result).toEqual({
      databaseClosed: true,
      serviceCleanupFailed: true,
    })
    expect(taskDispose).toHaveBeenCalledTimes(1)
    expect(databaseClose).toHaveBeenCalledTimes(1)
  })

  test('reports an unconfirmed database close as a critical shutdown failure', async () => {
    const result = await shutdownDatabaseResources({
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

  test('quiesces active tasks before database close', async () => {
    let closed = false
    let completionResolved = false
    let resolveCompletion: (() => void) | null = null
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = () => {
        completionResolved = true
        resolve()
      }
    })

    const quiesce = jest.fn(async () => {
      expect(closed).toBe(false)
      resolveCompletion?.()
      await completion
    })
    const databaseClose = jest.fn(() => {
      closed = true
      expect(completionResolved).toBe(true)
    })

    const result = await shutdownDatabaseResources({
      taskManager: {
        dispose: jest.fn(),
        quiesceForShutdown: quiesce,
      },
      assistantService: null,
      database: { close: databaseClose },
      awaitQuiesce: true,
    })

    expect(result.databaseClosed).toBe(true)
    expect(quiesce).toHaveBeenCalledTimes(1)
    expect(databaseClose).toHaveBeenCalledTimes(1)
    expect(closed).toBe(true)
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
