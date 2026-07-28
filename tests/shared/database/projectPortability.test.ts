import { initializeDatabase, type SqliteDatabase } from '../../../src/main/database'
import {
  ProjectPortabilityCoordinator,
  ProjectPortabilityService,
} from '../../../src/main/projectPortability'
import {
  sha256,
  stableStringify,
  type ProjectArchiveV1,
} from '../../../src/shared/projectPortability'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const PROJECT_ID = 'project-source'
const LLM_ID = 'llm-source'
const CHARACTER_ID = 'character-source'
const MATERIAL_ID = 'material-source'
const TEST_SECRET = 'test-api-key-must-not-export'
const LOCAL_PATH = 'C:\\Users\\private-user\\source.txt'

function seed(database: SqliteDatabase): void {
  database.prepare(
    `INSERT INTO projects (
      id, slug, name, description, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(PROJECT_ID, 'portable-story', '可移植故事', '完整正文不应被替换', 'active', 1, '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO llm_configs (
      id, project_id, name, provider, base_url, model, context_budget,
      max_output_tokens, temperature, streaming_enabled, is_default,
      created_at, updated_at, credential_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    LLM_ID,
    PROJECT_ID,
    '默认模型',
    'openai-compatible',
    'https://example.test/v1',
    'model',
    10000,
    2000,
    0.7,
    1,
    1,
    '2026-01-01',
    '2026-01-01',
    TEST_SECRET,
  )
  database.prepare(
    `INSERT INTO project_configs (
      project_id, default_llm_config_id, genre, tone, target_words, context_budget,
      settings_json, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(PROJECT_ID, LLM_ID, '悬疑', '克制', 100000, 10000, '{}', 1, '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO characters (
      id, project_id, name, role, profile_json, notes, sort_order, created_at,
      updated_at, crush_slug, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    CHARACTER_ID,
    PROJECT_ID,
    '角色',
    '主角',
    '{}',
    '用户正文中的 api_key 字样必须保留',
    0,
    '2026-01-01',
    '2026-01-01',
    'legacy-crush',
    1,
  )
  database.prepare(
    `INSERT INTO source_materials (
      id, project_id, title, material_type, uri, content, metadata_json, created_at,
      updated_at, character_id, fragment_id, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    MATERIAL_ID,
    PROJECT_ID,
    '素材',
    'text',
    LOCAL_PATH,
    '本机路径被移除，但这段小说正文必须完整保留。',
    '{}',
    '2026-01-01',
    '2026-01-01',
    CHARACTER_ID,
    'legacy-fragment',
    1,
  )
}

describe('ProjectPortabilityService', () => {
  let database: SqliteDatabase
  let temporaryDirectory: string

  beforeEach(() => {
    database = initializeDatabase('', { filename: ':memory:' })
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-portability-'))
    seed(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  })

  test('exports a credential-free archive and imports independent projects repeatedly', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const built = service.buildArchive(PROJECT_ID)

    expect(built.json).not.toContain(TEST_SECRET)
    expect(built.json).not.toContain(LOCAL_PATH)
    expect(built.json).not.toContain('private-user')
    expect(built.json).toContain('用户正文中的 api_key 字样必须保留')
    expect(built.archive.payload.characters[0].crush_slug).toBeNull()
    expect(built.archive.payload.source_materials[0].fragment_id).toBeNull()
    expect(built.archive.payload.source_materials[0].uri).toBeNull()

    const inspected = await service.inspectArchiveJson(built.json)
    const first = service.importArchive(inspected)
    const second = service.importArchive(inspected)

    expect(first.projectId).not.toBe(PROJECT_ID)
    expect(second.projectId).not.toBe(first.projectId)
    expect(first.projectSlug).toBe('portable-story-imported')
    expect(second.projectSlug).toBe('portable-story-imported-2')
    expect(database.prepare<{ credential_id: string }>(
      'SELECT credential_id FROM llm_configs WHERE project_id = ?',
    ).get(first.projectId)?.credential_id).toBe('')
    expect(database.prepare<{ uri: string | null }>(
      'SELECT uri FROM source_materials WHERE project_id = ?',
    ).get(first.projectId)?.uri).toBeNull()
    expect(database.pragma('foreign_key_check')).toEqual([])
  })

  test('rejects checksum changes before writing', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const archive = JSON.parse(service.buildArchive(PROJECT_ID).json) as ProjectArchiveV1
    archive.payload.projects[0].name = '篡改'
    await expect(service.inspectArchiveJson(JSON.stringify(archive))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_CHECKSUM_MISMATCH',
    })
    expect(database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM projects').get()?.count)
      .toBe(1)
  })

  test('rejects unsupported versions, extra fields, duplicates, and dangling references', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const original = JSON.parse(service.buildArchive(PROJECT_ID).json) as ProjectArchiveV1
    const future = JSON.parse(JSON.stringify(original)) as ProjectArchiveV1
    future.manifest.formatVersion = 2 as 1
    await expect(service.inspectArchiveJson(JSON.stringify(future))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_UNSUPPORTED_VERSION',
    })

    const extra = JSON.parse(JSON.stringify(original)) as ProjectArchiveV1 & { path?: string }
    extra.path = 'C:\\renderer-controlled.json'
    await expect(service.inspectArchiveJson(JSON.stringify(extra))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_INVALID',
    })

    const duplicate = JSON.parse(JSON.stringify(original)) as ProjectArchiveV1
    duplicate.payload.characters.push({ ...duplicate.payload.characters[0] })
    duplicate.manifest.payloadSha256 = sha256(stableStringify(duplicate.payload))
    await expect(service.inspectArchiveJson(JSON.stringify(duplicate))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_CONFLICT',
    })

    const dangling = JSON.parse(JSON.stringify(original)) as ProjectArchiveV1
    dangling.payload.source_materials[0].character_id = 'missing-character'
    dangling.manifest.payloadSha256 = sha256(stableStringify(dangling.payload))
    await expect(service.inspectArchiveJson(JSON.stringify(dangling))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_INVALID',
    })
    expect(database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM projects').get()?.count)
      .toBe(1)
  })

  test('rolls back every inserted row after an injected failure', async () => {
    const exporter = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const archive = await exporter.inspectArchiveJson(exporter.buildArchive(PROJECT_ID).json)
    const importer = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
      faultInjection: (stage) => {
        if (stage === 'after-character') throw new Error('injected')
      },
    })
    expect(() => importer.importArchive(archive)).toThrow(
      expect.objectContaining({ code: 'PROJECT_IMPORT_FAILED' }),
    )
    expect(database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM projects').get()?.count)
      .toBe(1)
    expect(database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM characters').get()?.count)
      .toBe(1)
  })

  test('uses one-time opaque tokens and rejects duplicate or concurrent commits', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const coordinator = new ProjectPortabilityCoordinator(service, temporaryDirectory)
    const sourceFile = path.join(temporaryDirectory, 'input.yourcrush-project.json')
    fs.writeFileSync(sourceFile, service.buildArchive(PROJECT_ID).json)

    const firstPreview = await coordinator.inspectFile(sourceFile)
    const [first, duplicate] = await Promise.allSettled([
      coordinator.commitImport(firstPreview.importToken),
      coordinator.commitImport(firstPreview.importToken),
    ])
    expect(first.status).toBe('fulfilled')
    expect(duplicate).toMatchObject({
      status: 'rejected',
      reason: { code: 'PROJECT_IMPORT_ALREADY_USED' },
    })

    const canceledPreview = await coordinator.inspectFile(sourceFile)
    await expect(coordinator.cancelImport(canceledPreview.importToken)).resolves.toEqual({
      canceled: true,
    })
    await expect(coordinator.commitImport(canceledPreview.importToken)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_ALREADY_USED',
    })
    await coordinator.dispose()
  })

  test('rejects files above the configured size limit before parsing', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const coordinator = new ProjectPortabilityCoordinator(service, temporaryDirectory)
    const oversized = path.join(temporaryDirectory, 'oversized.json')
    fs.writeFileSync(oversized, '')
    fs.truncateSync(oversized, 50 * 1024 * 1024 + 1)
    await expect(coordinator.inspectFile(oversized)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_TOO_LARGE',
    })
    await coordinator.dispose()
  })
})
