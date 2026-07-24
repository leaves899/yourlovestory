import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ChapterRepository,
  ProjectRepository,
  initializeDatabase,
  migrations,
  runMigrations,
  type Migration,
  type SqliteDatabase,
} from '@/main/database'

let tempRoot: string
let database: SqliteDatabase | undefined

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-database-'))
  database = initializeDatabase(tempRoot)
})

afterEach(() => {
  database?.close()
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('SQLite database initialization', () => {
  test('creates the userData database and enables required pragmas', () => {
    expect(fs.existsSync(path.join(tempRoot, 'data', 'yourcrush.sqlite'))).toBe(true)
    expect(database?.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database?.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(database?.pragma('busy_timeout', { simple: true })).toBe(5000)

    const tableNames = database!
      .prepare<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => row.name)

    expect(tableNames).toEqual(
      expect.arrayContaining([
        'schema_migrations',
        'projects',
        'project_configs',
        'llm_configs',
        'characters',
        'worldview_entries',
        'organizations',
        'relations',
        'arcs',
        'chapters',
        'chapter_revisions',
        'chapter_versions',
        'foreshadows',
        'foreshadow_events',
        'narrative_memories',
        'source_materials',
        'fragments',
        'tasks',
        'chat_sessions',
        'chat_messages',
        'skills',
        'project_skills',
        'postprocess_reports',
        'roadmap_items',
        'volumes',
        'volume_outlines',
        'chapter_outlines',
      ]),
    )

    const llmColumns = database!
      .prepare<{ name: string }>('PRAGMA table_info(llm_configs)')
      .all()
      .map((column) => column.name)
    expect(llmColumns).toContain('credential_id')
    expect(llmColumns).not.toContain('api_key')
  })

  test('does not reapply an already recorded migration', () => {
    const firstRun = database!
      .prepare<{ version: number }>('SELECT version FROM schema_migrations')
      .all()
    expect(firstRun).toHaveLength(migrations.length)

    const secondRun = runMigrations(database!)
    expect(secondRun).toHaveLength(migrations.length)
    expect(
      database!.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM schema_migrations').get(),
    ).toEqual({ count: migrations.length })
  })

  test('rolls back all statements when a migration fails', () => {
    const failingMigrations: readonly Migration[] = [
      {
        version: 3,
        name: 'temporary table',
        up: 'CREATE TABLE rollback_probe (id INTEGER PRIMARY KEY)',
      },
      {
        version: 4,
        name: 'failing migration',
        up: 'INSERT INTO table_that_does_not_exist (id) VALUES (1)',
      },
    ]

    expect(() => runMigrations(database!, failingMigrations)).toThrow()
    expect(() => database!.prepare('SELECT * FROM rollback_probe').all()).toThrow()
    expect(
      database!.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM schema_migrations').get(),
    ).toEqual({ count: migrations.length })
  })

  test('upgrades an existing database through independent credential reference and cleanup migrations', () => {
    database?.close()
    const legacy = initializeDatabase(tempRoot, {
      filename: path.join(tempRoot, 'legacy-upgrade.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 7),
    })
    database = legacy
    const before = legacy.prepare<{ name: string }>('PRAGMA table_info(llm_configs)').all()
    expect(before.map((column) => column.name)).toContain('api_key')
    expect(before.map((column) => column.name)).not.toContain('credential_id')

    runMigrations(legacy, migrations.filter((migration) => migration.version < 8))
    const during = legacy.prepare<{ name: string }>('PRAGMA table_info(llm_configs)').all()
    expect(during.map((column) => column.name)).toEqual(
      expect.arrayContaining(['api_key', 'credential_id']),
    )

    runMigrations(legacy)
    const after = legacy.prepare<{ name: string }>('PRAGMA table_info(llm_configs)').all()
    expect(after.map((column) => column.name)).toContain('credential_id')
    expect(after.map((column) => column.name)).not.toContain('api_key')
  })
})

describe('project and chapter repositories', () => {
  test('supports project and chapter create, read, update, list, and delete', () => {
    const projects = new ProjectRepository(database!)
    const chapters = new ChapterRepository(database!)

    const project = projects.create({
      slug: 'demo-project',
      name: 'Demo Project',
      description: 'A repository test project',
    })
    expect(projects.getById(project.id)).toEqual(project)
    expect(projects.getBySlug(project.slug)).toEqual(project)
    expect(projects.list()).toHaveLength(1)

    const chapter = chapters.create({
      project_id: project.id,
      chapter_number: 1,
      title: 'Opening',
      synopsis: 'A test chapter',
    })
    expect(chapters.getById(chapter.id)).toEqual(chapter)
    expect(chapters.listByProject(project.id)).toEqual([chapter])

    const updatedProject = projects.update(project.id, {
      name: 'Updated Demo Project',
      status: 'archived',
    })
    expect(updatedProject?.name).toBe('Updated Demo Project')
    expect(updatedProject?.status).toBe('archived')

    const updatedChapter = chapters.update(chapter.id, {
      title: 'Updated Opening',
      status: 'drafting',
      content: 'Draft content',
    })
    expect(updatedChapter?.title).toBe('Updated Opening')
    expect(updatedChapter?.status).toBe('drafting')
    expect(updatedChapter?.content).toBe('Draft content')

    expect(projects.delete(project.id)).toBe(true)
    expect(projects.getById(project.id)).toBeNull()
    expect(chapters.getById(chapter.id)).toBeNull()
    expect(projects.delete(project.id)).toBe(false)
  })
})
