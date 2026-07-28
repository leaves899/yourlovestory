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

function cloneArchive(archive: ProjectArchiveV1): ProjectArchiveV1 {
  return JSON.parse(JSON.stringify(archive)) as ProjectArchiveV1
}

function refreshPayloadChecksum(archive: ProjectArchiveV1): void {
  archive.manifest.payloadSha256 = sha256(stableStringify(archive.payload))
}

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
  database.prepare(
    `INSERT INTO worldview_entries (
      id, project_id, category, title, content, metadata_json, sort_order,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('world-source', PROJECT_ID, '地点', '旧城', '世界观正文', '{}', 0, '2026-01-01', '2026-01-01', 1)
  database.prepare(
    `INSERT INTO organizations (
      id, project_id, name, description, metadata_json, sort_order,
      created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('org-source', PROJECT_ID, '调查局', '组织正文', '{}', 0, '2026-01-01', '2026-01-01', 1)
  database.prepare(
    `INSERT INTO relations (
      id, project_id, source_character_id, target_character_id, relation_type,
      description, strength, metadata_json, source_entity_type, source_entity_id,
      target_entity_type, target_entity_id, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'relation-source',
    PROJECT_ID,
    CHARACTER_ID,
    null,
    'member-of',
    '跨类型关系',
    0.8,
    '{}',
    'character',
    CHARACTER_ID,
    'organization',
    'org-source',
    1,
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO arcs (
      id, project_id, parent_arc_id, name, synopsis, status, sort_order,
      metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('arc-source', PROJECT_ID, null, '主线', '主线梗概', 'planned', 0, '{}', '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO volumes (
      id, project_id, volume_number, title, synopsis, status, sort_order,
      target_words, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('volume-source', PROJECT_ID, 1, '第一卷', '卷梗概', 'planned', 0, 50000, 1, '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO volume_outlines (
      id, project_id, volume_id, status, summary, theme, main_conflict,
      key_turning_points_json, ending, outline_json, source_material_ids_json,
      metadata_json, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'volume-outline-source',
    PROJECT_ID,
    'volume-source',
    'confirmed',
    '卷摘要',
    '真相',
    '冲突',
    '["转折"]',
    '卷结尾',
    '{}',
    `["${MATERIAL_ID}"]`,
    '{}',
    1,
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO chapter_outlines (
      id, project_id, volume_id, chapter_number, sort_order, title, summary,
      purpose, opening, conflict, key_events_json, ending, ending_hook, status,
      outline_json, source_material_ids_json, metadata_json, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'chapter-outline-source',
    PROJECT_ID,
    'volume-source',
    1,
    0,
    '第一章大纲',
    '章摘要',
    '引入',
    '开场',
    '章冲突',
    '["事件"]',
    '章结尾',
    '钩子',
    'confirmed',
    '{}',
    `["${MATERIAL_ID}"]`,
    '{}',
    1,
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO chapters (
      id, project_id, arc_id, chapter_number, title, status, synopsis, content,
      target_words, actual_words, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'chapter-source',
    PROJECT_ID,
    'arc-source',
    1,
    '第一章',
    'review',
    '章节梗概',
    '章节正文',
    3000,
    4,
    '2026-01-01',
    '2026-01-01',
    1,
  )
  database.prepare(
    `INSERT INTO chapter_revisions (
      id, chapter_id, revision_number, content, summary, reason, is_current,
      created_at, parent_revision_id, operation, blocks_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('revision-1', 'chapter-source', 1, '初稿', '摘要', '创建', 0, '2026-01-01', null, 'manual', '[]')
  database.prepare(
    `INSERT INTO chapter_revisions (
      id, chapter_id, revision_number, content, summary, reason, is_current,
      created_at, parent_revision_id, operation, blocks_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('revision-2', 'chapter-source', 2, '修订稿', '摘要', '润色', 1, '2026-01-02', 'revision-1', 'polish', '[]')
  database.prepare(
    `INSERT INTO tasks (
      id, project_id, chapter_id, task_type, status, stage, progress, input_json,
      checkpoint_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'task-runtime-secret',
    PROJECT_ID,
    'chapter-source',
    'chapter-generation',
    'completed',
    'done',
    1,
    '{}',
    '{"runtime":"checkpoint-must-not-export"}',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO chapter_versions (
      id, chapter_id, task_id, version_number, content, summary, fact_check_json,
      status, is_current, created_at, reviewed_at, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'version-source',
    'chapter-source',
    'task-runtime-secret',
    1,
    '版本正文',
    '版本摘要',
    '{"passed":true,"summary":"","findings":[]}',
    'approved',
    1,
    '2026-01-01',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO foreshadows (
      id, project_id, title, description, status, planned_payoff_chapter_id,
      actual_payoff_chapter_id, importance, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'foreshadow-source',
    PROJECT_ID,
    '旧钥匙',
    '伏笔正文',
    'planted',
    'chapter-source',
    null,
    3,
    '{}',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO foreshadow_events (
      id, foreshadow_id, chapter_id, event_type, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('foreshadow-event-source', 'foreshadow-source', 'chapter-source', 'planted', '埋设', '2026-01-01')
  database.prepare(
    `INSERT INTO narrative_memories (
      id, project_id, memory_type, title, content, source_chapter_id, importance,
      metadata_json, created_at, updated_at, status, source_version_id, evidence_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'memory-source',
    PROJECT_ID,
    'fact',
    '事实',
    '叙事记忆',
    'chapter-source',
    2,
    '{}',
    '2026-01-01',
    '2026-01-01',
    'approved',
    'version-source',
    '["证据"]',
  )
  database.prepare(
    `INSERT INTO narrative_memory_proposals (
      id, project_id, source_chapter_id, source_version_id, memory_type, title,
      content, confidence, evidence_json, status, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'proposal-source',
    PROJECT_ID,
    'chapter-source',
    'version-source',
    'event',
    '提案',
    '提案正文',
    0.9,
    '["证据"]',
    'proposed',
    '{}',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO roadmap_items (
      id, project_id, parent_item_id, title, description, item_type, status,
      priority, sort_order, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('roadmap-root', PROJECT_ID, null, '路线根', '描述', 'milestone', 'planned', 1, 0, '{}', '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO roadmap_items (
      id, project_id, parent_item_id, title, description, item_type, status,
      priority, sort_order, metadata_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('roadmap-child', PROJECT_ID, 'roadmap-root', '路线子项', '描述', 'task', 'planned', 0, 1, '{}', '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO skills (
      id, name, description, version, prompt_template, config_schema_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'skill-global',
    'continuity-check',
    '连续性检查',
    '1',
    'global-prompt-must-not-export',
    '{}',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO project_skills (
      project_id, skill_id, enabled, config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(PROJECT_ID, 'skill-global', 1, '{"strict":true}', '2026-01-01', '2026-01-01')
  database.prepare(
    `INSERT INTO chat_sessions (
      id, project_id, title, session_type, status, agent_config_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'chat-runtime-secret',
    PROJECT_ID,
    'runtime-chat-must-not-export',
    'assistant',
    'active',
    '{}',
    '2026-01-01',
    '2026-01-01',
  )
  database.prepare(
    `INSERT INTO chat_messages (
      id, session_id, role, content, sequence, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run('message-runtime-secret', 'chat-runtime-secret', 'user', 'chat-body-must-not-export', 1, '{}', '2026-01-01')
  database.prepare(
    `INSERT INTO postprocess_reports (
      id, project_id, chapter_id, task_id, report_type, status, summary,
      details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'report-runtime-secret',
    PROJECT_ID,
    'chapter-source',
    'task-runtime-secret',
    'fact-check',
    'completed',
    'report-must-not-export',
    '{}',
    '2026-01-01',
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
    const built = await service.buildArchive(PROJECT_ID)

    expect(built.json).not.toContain(TEST_SECRET)
    expect(built.json).not.toContain(LOCAL_PATH)
    expect(built.json).not.toContain('private-user')
    expect(built.json).not.toContain('checkpoint-must-not-export')
    expect(built.json).not.toContain('chat-body-must-not-export')
    expect(built.json).not.toContain('report-must-not-export')
    expect(built.json).not.toContain('global-prompt-must-not-export')
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
    expect(database.prepare<{ task_id: string | null }>(
      `SELECT chapter_versions.task_id
       FROM chapter_versions
       JOIN chapters ON chapters.id = chapter_versions.chapter_id
       WHERE chapters.project_id = ?`,
    ).get(first.projectId)?.task_id).toBeNull()
    expect(database.prepare<{ count: number }>(
      'SELECT COUNT(*) AS count FROM roadmap_items WHERE project_id = ?',
    ).get(first.projectId)?.count).toBe(2)
    expect(database.prepare<{ count: number }>(
      'SELECT COUNT(*) AS count FROM project_skills WHERE project_id = ?',
    ).get(first.projectId)?.count).toBe(1)
    expect(database.pragma('foreign_key_check')).toEqual([])
  })

  test('rejects checksum changes before writing', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const archive = JSON.parse((await service.buildArchive(PROJECT_ID)).json) as ProjectArchiveV1
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
    const original = JSON.parse((await service.buildArchive(PROJECT_ID)).json) as ProjectArchiveV1
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
    const archive = await exporter.inspectArchiveJson((await exporter.buildArchive(PROJECT_ID)).json)
    for (const failureStage of [
      'after-project',
      'after-character',
      'after-chapter',
      'after-narrative-memory',
      'after-project-skill',
    ]) {
      const importer = new ProjectPortabilityService(database, {
        appVersion: '0.2.0-alpha.1',
        schemaVersion: 8,
        faultInjection: (stage) => {
          if (stage === failureStage) throw new Error('injected')
        },
      })
      expect(() => importer.importArchive(archive)).toThrow(
        expect.objectContaining({ code: 'PROJECT_IMPORT_FAILED' }),
      )
      expect(
        database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM projects').get()?.count,
      ).toBe(1)
      expect(
        database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM characters').get()?.count,
      ).toBe(1)
    }
  })

  test('uses one-time opaque tokens and rejects duplicate or concurrent commits', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const coordinator = new ProjectPortabilityCoordinator(service, temporaryDirectory)
    const sourceFile = path.join(temporaryDirectory, 'input.yourcrush-project.json')
    fs.writeFileSync(sourceFile, (await service.buildArchive(PROJECT_ID)).json)

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

  test('self-validates exports and enforces the archive byte boundary', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const baseline = await service.buildArchive(PROJECT_ID)
    const exact = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
      archiveMaxBytes: Buffer.byteLength(baseline.json),
    })
    await expect(exact.buildArchive(PROJECT_ID)).resolves.toMatchObject({
      recordCounts: baseline.recordCounts,
    })
    const tooSmall = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
      archiveMaxBytes: Buffer.byteLength(baseline.json) - 1,
    })
    await expect(tooSmall.buildArchive(PROJECT_ID)).rejects.toMatchObject({
      code: 'PROJECT_EXPORT_TOO_LARGE',
    })

    database.prepare('UPDATE projects SET status = ? WHERE id = ?').run('invalid-status', PROJECT_ID)
    await expect(service.buildArchive(PROJECT_ID)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_INVALID',
    })
  })

  test('binds manifest identity to payload and canonicalizes warning messages', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const original = JSON.parse((await service.buildArchive(PROJECT_ID)).json) as ProjectArchiveV1
    for (const field of ['sourceProjectId', 'projectName'] as const) {
      const forged = cloneArchive(original)
      forged.manifest[field] = 'attacker-controlled'
      await expect(service.inspectArchiveJson(JSON.stringify(forged))).rejects.toMatchObject({
        code: 'PROJECT_IMPORT_INVALID',
      })
    }

    const forgedWarning = cloneArchive(original)
    forgedWarning.manifest.warnings[0].message = 'archive-controlled warning'
    const inspected = await service.inspectArchiveJson(JSON.stringify(forgedWarning))
    expect(inspected.manifest.warnings[0].message).not.toContain('archive-controlled')

    const duplicateWarning = cloneArchive(original)
    duplicateWarning.manifest.warnings.push({ ...duplicateWarning.manifest.warnings[0] })
    await expect(service.inspectArchiveJson(JSON.stringify(duplicateWarning))).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_INVALID',
    })
  })

  test('rejects enum, range, uniqueness, ownership, and cycle violations before insert', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const original = JSON.parse((await service.buildArchive(PROJECT_ID)).json) as ProjectArchiveV1
    const cases: Array<{
      code: 'PROJECT_IMPORT_INVALID' | 'PROJECT_IMPORT_CONFLICT'
      mutate: (archive: ProjectArchiveV1) => void
    }> = [
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => { archive.payload.chapters[0].status = 'unknown' },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => { archive.payload.narrative_memory_proposals[0].confidence = 2 },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => { archive.payload.projects[0].created_at = '2026-02-31' },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          archive.payload.project_skills.push({ ...archive.payload.project_skills[0] })
        },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          const duplicate = { ...archive.payload.chapter_revisions[1], id: 'revision-duplicate' }
          archive.payload.chapter_revisions.push(duplicate)
        },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          const duplicate = { ...archive.payload.volumes[0], id: 'volume-duplicate' }
          archive.payload.volumes.push(duplicate)
        },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          const duplicate = { ...archive.payload.chapters[0], id: 'chapter-duplicate' }
          archive.payload.chapters.push(duplicate)
        },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          const duplicate = { ...archive.payload.chapter_versions[0], id: 'version-duplicate' }
          archive.payload.chapter_versions.push(duplicate)
        },
      },
      {
        code: 'PROJECT_IMPORT_CONFLICT',
        mutate: (archive) => {
          const duplicate = { ...archive.payload.volume_outlines[0], id: 'outline-duplicate' }
          archive.payload.volume_outlines.push(duplicate)
        },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => {
          archive.payload.arcs[0].parent_arc_id = archive.payload.arcs[0].id
        },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => {
          archive.payload.roadmap_items[0].parent_item_id = 'roadmap-child'
        },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => {
          archive.payload.chapter_revisions[0].parent_revision_id = 'revision-2'
        },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => {
          archive.payload.relations[0].source_character_id = null
        },
      },
      {
        code: 'PROJECT_IMPORT_INVALID',
        mutate: (archive) => {
          archive.payload.chapters.push({
            ...archive.payload.chapters[0],
            id: 'chapter-second',
            chapter_number: 2,
          })
          archive.payload.chapter_revisions[0].chapter_id = 'chapter-second'
        },
      },
    ]
    for (const entry of cases) {
      const archive = cloneArchive(original)
      entry.mutate(archive)
      refreshPayloadChecksum(archive)
      await expect(service.inspectArchiveJson(JSON.stringify(archive))).rejects.toMatchObject({
        code: entry.code,
      })
    }
  })

  test('only preserves credential-free http(s) source URIs and strips query and fragment', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    for (const unsafe of [
      'ftp://example.test/private',
      'smb://server/share/private',
      'ssh://example.test/private',
      'custom:private-value',
      'C:drive-relative-secret',
      'https://user:password@example.test/private',
    ]) {
      database.prepare('UPDATE source_materials SET uri = ? WHERE id = ?').run(unsafe, MATERIAL_ID)
      const built = await service.buildArchive(PROJECT_ID)
      expect(built.archive.payload.source_materials[0].uri).toBeNull()
      expect(Buffer.from(built.json, 'utf8').includes(Buffer.from(unsafe, 'utf8'))).toBe(false)
    }

    const portable = 'https://example.test/source?token=secret-token#private-fragment'
    database.prepare('UPDATE source_materials SET uri = ? WHERE id = ?').run(portable, MATERIAL_ID)
    const built = await service.buildArchive(PROJECT_ID)
    expect(built.archive.payload.source_materials[0].uri).toBe('https://example.test/source')
    expect(Buffer.from(built.json, 'utf8').includes(Buffer.from('secret-token', 'utf8'))).toBe(false)
    expect(Buffer.from(built.json, 'utf8').includes(Buffer.from('private-fragment', 'utf8'))).toBe(false)
  })

  test('expires tokens without retaining staged entries and enforces active staging limits', async () => {
    const service = new ProjectPortabilityService(database, {
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
    })
    const sourceFile = path.join(temporaryDirectory, 'limits.yourcrush-project.json')
    fs.writeFileSync(sourceFile, (await service.buildArchive(PROJECT_ID)).json)
    const coordinator = new ProjectPortabilityCoordinator(service, temporaryDirectory, {
      tokenTtlMs: 20,
      maxActiveTokens: 1,
      maxStagedBytes: fs.statSync(sourceFile).size,
    })
    const preview = await coordinator.inspectFile(sourceFile)
    await expect(coordinator.inspectFile(sourceFile)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_LIMIT_REACHED',
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await expect(coordinator.commitImport(preview.importToken)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_EXPIRED',
    })
    const stagingRoot = path.join(temporaryDirectory, 'project-import-staging')
    expect(
      fs.readdirSync(stagingRoot, { recursive: true }).filter((entry) => String(entry).endsWith('.json')),
    ).toEqual([])
    const next = await coordinator.inspectFile(sourceFile)
    await expect(coordinator.cancelImport(next.importToken)).resolves.toEqual({ canceled: true })
    await coordinator.dispose()

    const byteLimited = new ProjectPortabilityCoordinator(service, temporaryDirectory, {
      maxActiveTokens: 8,
      maxStagedBytes: fs.statSync(sourceFile).size - 1,
    })
    await expect(byteLimited.inspectFile(sourceFile)).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_LIMIT_REACHED',
    })
    await byteLimited.dispose()
  })
})
