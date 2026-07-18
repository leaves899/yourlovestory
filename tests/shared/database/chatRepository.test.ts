import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ChatRepository,
  initializeDatabase,
  ProjectRepository,
  type SqliteDatabase,
} from '@/main/database'

describe('ChatRepository', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-chat-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('persists ordered sessions and messages with structured metadata', () => {
    const project = new ProjectRepository(database).create({
      slug: 'chat-project',
      name: 'Chat Project',
    })
    const chats = new ChatRepository(database)
    const session = chats.create({
      project_id: project.id,
      title: '创作会话',
      agent_config: { model: 'writer-model' },
    })

    const user = chats.append({
      session_id: session.id,
      role: 'user',
      content: '整理这一章的冲突',
      metadata: { message: { role: 'user', content: '整理这一章的冲突', timestamp: 1 } },
    })
    const assistant = chats.append({
      session_id: session.id,
      role: 'assistant',
      content: '可以先确认主冲突。',
      metadata: { message: { role: 'assistant', content: [], timestamp: 2 } },
    })

    expect(chats.listByProject(project.id)).toEqual([session])
    expect(chats.listBySession(session.id)).toEqual([user, assistant])
    expect(chats.getById(session.id)?.agent_config).toEqual({ model: 'writer-model' })

    const archived = chats.update(session.id, { status: 'archived' })
    expect(archived?.status).toBe('archived')
    expect(() => chats.append({ session_id: session.id, role: 'user', content: '继续' })).toThrow()
  })
})
