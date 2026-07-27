import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initializeDatabase, type SqliteDatabase } from '@/main/database'
import { assertChapterGenerationPreflight } from '@/main/workbench/firstChapterPreflight'
import { WorkbenchService } from '@/main/workbench'
import type { StartChapterGenerationInput } from '@/main/tasks'

describe('chapter generation backend preflight', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-preflight-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('uses the shared evaluator before the task boundary', () => {
    const workbench = new WorkbenchService(database)
    const project = workbench.createProject({
      slug: 'backend-preflight',
      name: 'Backend Preflight',
      description: 'A protagonist follows a letter home.',
    })
    const protagonist = workbench.createCharacter({
      project_id: project.id,
      name: 'Protagonist',
      role: 'protagonist',
    })
    const companion = workbench.createCharacter({
      project_id: project.id,
      name: 'Companion',
      role: 'core',
    })
    workbench.createRelation({
      project_id: project.id,
      source: { type: 'character', id: protagonist.id },
      target: { type: 'character', id: companion.id },
      relation_type: 'allies',
    })
    const volume = workbench.createVolume({
      project_id: project.id,
      volume_number: 1,
      title: 'Volume One',
    })
    const volumeOutline = workbench.createVolumeOutline({
      project_id: project.id,
      volume_id: volume.id,
      summary: 'The journey starts.',
    })
    const chapterOutline = workbench.createChapterOutline({
      project_id: project.id,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'The Letter',
      summary: 'The letter arrives.',
    })
    workbench.confirmVolumeOutline(project.id, volumeOutline.id, volumeOutline.version)
    workbench.confirmChapterOutline(project.id, chapterOutline.id, chapterOutline.version)
    const input: StartChapterGenerationInput = {
      projectId: project.id,
      sessionId: 'session-1',
      chapterOutlineId: chapterOutline.id,
      autoConfirm: false,
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    }

    expect(() => assertChapterGenerationPreflight(workbench, input)).toThrow('缺少世界观条目')

    workbench.createWorldviewEntry({
      project_id: project.id,
      category: 'rule',
      title: 'Letters',
      content: 'Letters identify their recipient.',
    })
    expect(() => assertChapterGenerationPreflight(workbench, input)).not.toThrow()
  })
})
