import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { ContextBudgetExceededError } from '../../shared/contextCompiler'
import type {
  ComputeOperation,
  WorkerEvent,
  WorkerPayloadByOperation,
  WorkerResultByOperation,
  WorkerRequest,
} from './protocol'

interface ComputeWorkerLike {
  postMessage(message: WorkerRequest): void
  on(event: 'message', listener: (event: WorkerEvent) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'exit', listener: (code: number) => void): this
  removeListener(event: 'message' | 'error' | 'exit', listener: (...args: never[]) => void): this
  terminate(): Promise<number> | number
}

export interface ComputeWorkerRunOptions {
  signal?: AbortSignal
  timeoutMs?: number
  onProgress?: (progress: number) => void
}

export interface ComputeWorkerClientOptions {
  workerPath?: string
  workerFactory?: (filename: string) => ComputeWorkerLike
  defaultTimeoutMs?: number
  maxWorkers?: number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function abortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export class ComputeWorkerClient {
  private activeWorkers = 0
  private readonly maxWorkers: number
  private readonly workerPath: string
  private readonly workerFactory: (filename: string) => ComputeWorkerLike
  private readonly defaultTimeoutMs: number

  public constructor(options: ComputeWorkerClientOptions = {}) {
    this.workerPath = options.workerPath ?? path.join(__dirname, 'computeWorker.js')
    this.workerFactory = options.workerFactory
      ?? ((filename) => new Worker(filename, {
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      }) as unknown as ComputeWorkerLike)
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000
    this.maxWorkers = options.maxWorkers ?? 2
  }

  public run<Operation extends ComputeOperation>(
    operation: Operation,
    payload: WorkerPayloadByOperation[Operation],
    options: ComputeWorkerRunOptions = {},
  ): Promise<WorkerResultByOperation[Operation]> {
    const request: WorkerRequest = {
      type: 'run',
      id: randomUUID(),
      operation,
      payload,
    } as WorkerRequest
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs
    if (options.signal?.aborted) return Promise.reject(abortError('Compute worker operation was cancelled'))
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Invalid compute timeout'))
    if (this.activeWorkers >= this.maxWorkers) return Promise.reject(new Error('Compute worker capacity exceeded'))
    let worker: ComputeWorkerLike
    try {
      worker = this.workerFactory(this.workerPath)
    } catch (error: unknown) {
      return Promise.reject(new Error(`Compute worker could not start: ${errorMessage(error)}`))
    }
    this.activeWorkers += 1

    return new Promise<WorkerResultByOperation[Operation]>((resolve, reject) => {
      let settled = false
      const state: {
        timer?: ReturnType<typeof setTimeout>
        abortHandler?: () => void
      } = {}

      const finish = (callback: () => void): void => {
        if (settled) return
        settled = true
        if (state.timer) clearTimeout(state.timer)
        if (state.abortHandler && options.signal) {
          options.signal.removeEventListener('abort', state.abortHandler)
        }
        worker.removeListener('message', onMessage as (...args: never[]) => void)
        worker.removeListener('error', onError as (...args: never[]) => void)
        worker.removeListener('exit', onExit as (...args: never[]) => void)
        worker.on('error', () => undefined)
        const complete = (): void => {
          this.activeWorkers -= 1
          callback()
        }
        try {
          const termination = worker.terminate()
          if (termination && typeof (termination as Promise<number>).then === 'function') {
            void (termination as Promise<number>).then(complete, complete)
          } else {
            complete()
          }
        } catch {
          // A failed cleanup must not replace the operation result.
          complete()
        }
      }

      const onMessage = (event: WorkerEvent): void => {
        if (event.id !== request.id) return
        if (event.type === 'progress') {
          try {
            options.onProgress?.(Math.max(0, Math.min(1, event.progress)))
          } catch {
            // UI observers must not crash the main process or strand computation.
          }
        } else if (event.type === 'result') {
          finish(() => resolve(event.result as WorkerResultByOperation[Operation]))
        } else {
          finish(() => reject(event.budget
            ? new ContextBudgetExceededError(event.message, event.budget)
            : new Error(event.message)))
        }
      }
      const onError = (error: Error): void => {
        finish(() => reject(new Error(`Compute worker failed: ${errorMessage(error)}`)))
      }
      const onExit = (code: number): void => {
        finish(() => reject(new Error(`Compute worker exited before returning a result (code ${code})`)))
      }

      worker.on('message', onMessage)
      worker.on('error', onError)
      worker.on('exit', onExit)

      state.abortHandler = (): void => {
        finish(() => reject(abortError('Compute worker operation was cancelled')))
      }
      if (options.signal?.aborted) {
        state.abortHandler()
        return
      }
      options.signal?.addEventListener('abort', state.abortHandler, { once: true })
      state.timer = setTimeout(() => {
        finish(() => reject(new Error(`Compute worker timed out after ${timeoutMs} ms`)))
      }, timeoutMs)

      try {
        worker.postMessage(request)
      } catch (error: unknown) {
        finish(() => reject(new Error(`Compute worker request failed: ${errorMessage(error)}`)))
      }
    })
  }
}

/** Shared CPU capacity across IPC and Agent calls in one main process. */
export const sharedComputeWorkerClient = new ComputeWorkerClient()
