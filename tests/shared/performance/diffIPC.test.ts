import { EventEmitter } from 'node:events'
import type { IpcMainInvokeEvent } from 'electron'
import { registerRevisionIPC } from '@/main/ipc/revisions.ipc'
import { createIpcRegistry, type IpcRegistrar } from '@/main/ipc/shared'
import { ComputeWorkerClient } from '@/main/workers/computeWorkerClient'
import { NarrativeWorkbenchService, diffChapterContent } from '@/shared/narrativeWorkbench'

class Sender extends EventEmitter {
  public send = jest.fn()
  public isDestroyed = () => false
  public constructor(public id: number) { super() }
}

function fixture() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, value: unknown) => unknown>()
  const registrar = { handle: (channel: string, handler: (event: IpcMainInvokeEvent, value: unknown) => unknown) => handlers.set(channel, handler) }
  const client = new ComputeWorkerClient()
  const run = jest.spyOn(client, 'run')
  const service = {
    getVersionForDiff: jest.fn((_projectId: string, id: string) => ({ id, chapter_id: 'chapter', content: id === 'before' ? '正文' : '正文修订' })),
    getRevision: jest.fn((_projectId: string, id: string) => ({ id, chapter_id: 'chapter', blocks: [], content: 'unused' })),
    diffVersions: jest.fn(), diffRevisions: jest.fn(),
  }
  registerRevisionIPC(createIpcRegistry(registrar as IpcRegistrar), service as unknown as NarrativeWorkbenchService, client)
  const event = (sender: Sender, url = 'file:///app/index.html') => ({ sender, senderFrame: { url } } as unknown as IpcMainInvokeEvent)
  const invoke = async (channel: string, sender: Sender, input: unknown, url?: string) => handlers.get(channel)?.(event(sender, url), input)
  return { invoke, run, service }
}

test('both IPC diff paths pass only immutable chapter fields and send scoped progress', async () => {
  const { invoke, run, service } = fixture()
  const sender = new Sender(1)
  run.mockImplementation(async (_operation, payload, options) => {
    options?.onProgress?.(0.2)
    expect(Object.keys(payload).sort()).toEqual(['after_content', 'before_content', 'chapter_id', 'mode'])
    return diffChapterContent('chapter', '正文', '正文修订') as never
  })
  await expect(invoke('chapter:diff:versions', sender, {
    project_id: 'project', from_version_id: 'before', to_version_id: 'after', request_id: 'request-1',
  })).resolves.toMatchObject({ success: true, data: { from_version_id: 'before', diff: { modified_count: 1 } } })
  expect(sender.send).toHaveBeenCalledWith('chapter:diff:progress', { request_id: 'request-1', progress: 0.2 })
  expect(service.diffVersions).not.toHaveBeenCalled()
  run.mockImplementation(async (_operation, payload) => {
    expect(Object.keys(payload).sort()).toEqual(['after', 'before', 'mode'])
    return diffChapterContent('chapter', '', '') as never
  })
  await expect(invoke('chapter:diff:revisions', sender, {
    project_id: 'project', from_revision_id: 'before', to_revision_id: 'after', request_id: 'request-2',
  })).resolves.toMatchObject({ success: true })
  expect(service.diffRevisions).not.toHaveBeenCalled()
})

test('sender owns cancellation, concurrent request is rejected, and destroyed sender aborts', async () => {
  const { invoke, run } = fixture()
  const owner = new Sender(1)
  const other = new Sender(2)
  run.mockImplementation((_operation, _payload, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => {
      const error = new Error('cancelled'); error.name = 'AbortError'; reject(error)
    })
  }))
  const input = { project_id: 'project', from_version_id: 'before', to_version_id: 'after', request_id: 'request-1' }
  const pending = invoke('chapter:diff:versions', owner, input)
  await expect(invoke('chapter:diff:cancel', other, { request_id: 'request-1' })).resolves.toMatchObject({ data: { cancelled: false } })
  await expect(invoke('chapter:diff:versions', owner, { ...input, request_id: 'request-2' })).resolves.toMatchObject({ success: false })
  await expect(invoke('chapter:diff:cancel', owner, { request_id: 'request-1' })).resolves.toMatchObject({ data: { cancelled: true } })
  await expect(pending).resolves.toMatchObject({ error: { code: 'DIFF_CANCELLED' } })
  expect(owner.listenerCount('destroyed')).toBe(0)
  const second = invoke('chapter:diff:versions', owner, input)
  owner.emit('destroyed')
  await expect(second).resolves.toMatchObject({ error: { code: 'DIFF_CANCELLED' } })
  expect(owner.listenerCount('destroyed')).toBe(0)
})

test('cross chapter and untrusted requests fail before Worker dispatch', async () => {
  const { invoke, run, service } = fixture()
  const sender = new Sender(1)
  service.getVersionForDiff.mockReturnValueOnce({ id: 'before', chapter_id: 'one', content: '' })
    .mockReturnValueOnce({ id: 'after', chapter_id: 'two', content: '' })
  await expect(invoke('chapter:diff:versions', sender, {
    project_id: 'project', from_version_id: 'before', to_version_id: 'after',
  })).resolves.toMatchObject({ success: false })
  service.getVersionForDiff.mockClear()
  await expect(invoke('chapter:diff:versions', sender, {
    project_id: 'project', from_version_id: 'before', to_version_id: 'after',
  }, 'https://untrusted.example/')).resolves.toMatchObject({ success: false })
  expect(service.getVersionForDiff).not.toHaveBeenCalled()
  expect(run).not.toHaveBeenCalled()
})
