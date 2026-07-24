import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

type IpcHandler = (_event: unknown, value: unknown) => unknown
const handlers = new Map<string, IpcHandler>()

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler): void => {
      handlers.set(channel, handler)
    },
  },
}))

import { initializeDatabase, type SqliteDatabase } from '@/main/database'
import { createWorkbenchService, registerWorkbenchIPC } from '@/main/workbench'

describe('workbench credential response boundary', () => {
  let root: string
  let database: SqliteDatabase

  beforeEach(() => {
    handlers.clear()
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-workbench-boundary-'))
    database = initializeDatabase(root)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('omits credential references from renderer responses and preserves them on ordinary updates', async () => {
    const service = createWorkbenchService(database, { projectRoot: root })
    const project = service.createProject({ slug: 'boundary', name: 'Boundary' })
    const initial = service.getProjectConfig(project.id)
    service.updateProjectConfig(
      project.id,
      {
        settings: {
          llmCredentialId: 'llm:project:internal',
          nested: { credentialId: 'llm:nested:internal' },
          visible: 'value',
        },
      },
      initial.version,
    )
    registerWorkbenchIPC(service)
    const getHandler = handlers.get('novelProject:config:get')!
    const updateHandler = handlers.get('novelProject:config:update')!

    const response = await getHandler({}, { project_id: project.id })
    expect(JSON.stringify(response)).not.toContain('llm:project:internal')
    expect(JSON.stringify(response)).not.toContain('llm:nested:internal')

    const current = service.getProjectConfig(project.id)
    const updated = await updateHandler({}, {
      project_id: project.id,
      expected_version: current.version,
      input: { settings: { visible: 'updated', nested: {} } },
    })
    expect(JSON.stringify(updated)).not.toContain('llm:project:internal')
    expect(service.getProjectConfig(project.id).settings).toMatchObject({
      llmCredentialId: 'llm:project:internal',
      nested: { credentialId: 'llm:nested:internal' },
      visible: 'updated',
    })

    await expect(updateHandler({}, {
      project_id: project.id,
      expected_version: service.getProjectConfig(project.id).version,
      input: { settings: { llmCredentialId: 'renderer-controlled' } },
    })).rejects.toThrow('不能直接指定凭据引用')
  })
})
