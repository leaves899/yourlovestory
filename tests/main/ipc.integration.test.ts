import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

interface IpcHandler {
  (event: unknown, params?: unknown): unknown
}

interface ServiceResponse<T = unknown> {
  success: boolean
  data?: T
  errors?: string[]
}

const mockHandlers = new Map<string, IpcHandler>()
const mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-ipc-'))
const mockApp = {
  getPath: (name: string): string => (name === 'userData' ? mockUserDataPath : mockUserDataPath),
  getAppPath: (): string => mockUserDataPath,
  getName: (): string => 'yourcrush-test',
  getVersion: (): string => 'test-version',
  quit: (): void => undefined,
}

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler): void => {
      mockHandlers.set(channel, handler)
    },
  },
  app: mockApp,
}))

import { setupIPC } from '../../src/main/ipc'
import type { Fragment } from '../../src/shared/fragment/models'

async function invoke<T>(channel: string, params?: unknown): Promise<T> {
  const handler = mockHandlers.get(channel)
  if (!handler) throw new Error(`IPC handler is not registered: ${channel}`)
  return (await handler({}, params)) as T
}

describe('主进程 IPC 集成', () => {
  beforeAll(() => {
    setupIPC()
  })

  afterAll(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true })
  })

  test('注册碎片 IPC 并完成记录、读取、更新、删除全链路', async () => {
    const date = new Date().toISOString().slice(0, 10)
    const slug = 'ipc-integration'
    const recorded = await invoke<ServiceResponse<Fragment>>('fragment:record', {
      date,
      slug,
      origin: 'user',
      mood: 'neutral',
      content: 'IPC 集成测试内容',
      writing_mode: 'raw',
    })

    expect(recorded.success).toBe(true)
    expect(recorded.data).toBeDefined()
    const fragmentId = recorded.data!.id

    const listed = await invoke<ServiceResponse<Fragment[]>>('fragment:list', { slug, date })
    expect(listed.success).toBe(true)
    expect(listed.data).toHaveLength(1)
    expect(listed.data![0].id).toBe(fragmentId)

    const fetched = await invoke<ServiceResponse<Fragment>>('fragment:get', {
      fragment_id: fragmentId,
    })
    expect(fetched.success).toBe(true)
    expect(fetched.data!.content).toBe('IPC 集成测试内容')

    const updated = await invoke<ServiceResponse<Fragment>>('fragment:update', {
      fragment_id: fragmentId,
      slug,
      content: 'IPC 集成测试更新内容',
    })
    expect(updated.success).toBe(true)
    expect(updated.data!.content).toBe('IPC 集成测试更新内容')

    const deleted = await invoke<ServiceResponse>('fragment:delete', {
      fragment_id: fragmentId,
    })
    expect(deleted.success).toBe(true)

    const afterDelete = await invoke<ServiceResponse<Fragment[]>>('fragment:list', { slug, date })
    expect(afterDelete.success).toBe(true)
    expect(afterDelete.data).toHaveLength(0)
  })

  test('设置 IPC 写入临时 userData 并可读回', async () => {
    const settings = { provider: 'test', model: 'test-model', intimate: false }
    const updated = await invoke<ServiceResponse>('settings:update', settings)
    expect(updated).toEqual({ success: true })

    const loaded = await invoke<ServiceResponse<Record<string, unknown>>>('settings:get')
    expect(loaded).toEqual({ success: true, data: settings })
  })

  test('没有初始化 TaskManager 时拒绝任务 IPC', async () => {
    await expect(invoke('task:get', { taskId: 'missing-task' })).rejects.toThrow(
      'TaskManager is not initialized',
    )
  })
})
