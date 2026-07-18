import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ChapterOutlineRepository,
  CharacterRepository,
  CurrentProjectRepository,
  OrganizationRepository,
  ProjectConfigRepository,
  ProjectRepository,
  RelationRepository,
  SourceMaterialRepository,
  VolumeOutlineRepository,
  VolumeRepository,
  WorldviewEntryRepository,
  initializeDatabase,
  type SqliteDatabase,
} from '@/main/database'
import {
  EntityNotFoundError,
  OutlineNotEditableError,
  OutlineStatusTransitionError,
  VersionConflictError,
  VolumeDeletionProtectedError,
  NovelProjectService,
  type NovelProjectStores,
} from '@/shared/novelProject'
import {
  parseChapterOutlineCreateParams,
  parseOutlineContextParams,
  parseVolumeCreateParams,
  parseVolumeOutlineCreateParams,
  parseVolumeUpdateParams,
} from '@/main/workbench'

function createStores(database: SqliteDatabase): NovelProjectStores {
  return {
    projects: new ProjectRepository(database),
    configs: new ProjectConfigRepository(database),
    characters: new CharacterRepository(database),
    worldviewEntries: new WorldviewEntryRepository(database),
    organizations: new OrganizationRepository(database),
    relations: new RelationRepository(database),
    sourceMaterials: new SourceMaterialRepository(database),
    currentProject: new CurrentProjectRepository(database),
    outline: {
      volumes: new VolumeRepository(database),
      volumeOutlines: new VolumeOutlineRepository(database),
      chapterOutlines: new ChapterOutlineRepository(database),
    },
  }
}

describe('outline workbench', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-outline-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('isolates volumes and outlines by project and keeps configured ordering', () => {
    const stores = createStores(database)
    const service = new NovelProjectService(stores)
    const first = service.createProject({ slug: 'outline-first', name: 'Outline First' })
    const second = service.createProject({ slug: 'outline-second', name: 'Outline Second' })

    const firstVolume = service.createVolume({
      project_id: first.id,
      volume_number: 1,
      title: 'First Volume',
      sort_order: 2,
    })
    const secondVolume = service.createVolume({
      project_id: first.id,
      volume_number: 2,
      title: 'Second Volume',
      sort_order: 1,
    })
    const otherVolume = service.createVolume({
      project_id: second.id,
      volume_number: 1,
      title: 'Other Volume',
    })
    const firstOutline = service.createVolumeOutline({
      project_id: first.id,
      volume_id: firstVolume.id,
      summary: 'Volume summary',
      key_turning_points: ['turn one'],
      outline: { focus: 'character' },
    })
    const firstChapter = service.createChapterOutline({
      project_id: first.id,
      volume_id: firstVolume.id,
      chapter_number: 1,
      title: 'Opening',
      source_material_ids: [],
    })

    expect(service.listVolumes(first.id).map((volume) => volume.id)).toEqual([
      secondVolume.id,
      firstVolume.id,
    ])
    expect(service.listVolumes(second.id)).toEqual([otherVolume])
    expect(service.listVolumeOutlines(first.id)).toEqual([firstOutline])
    expect(service.listChapterOutlinesByVolume(first.id, firstVolume.id)).toEqual([firstChapter])
    expect(service.listChapterOutlines(second.id)).toEqual([])
    expect(() => service.getVolume(first.id, otherVolume.id)).toThrow(EntityNotFoundError)
    expect(() => service.getChapterOutline(second.id, firstChapter.id)).toThrow(EntityNotFoundError)
  })

  test('repositories provide CRUD, optimistic versions, and guarded outline transitions', () => {
    const projects = new ProjectRepository(database)
    const volumes = new VolumeRepository(database)
    const volumeOutlines = new VolumeOutlineRepository(database)
    const chapterOutlines = new ChapterOutlineRepository(database)
    const project = projects.create({ slug: 'repository', name: 'Repository' })
    const volume = volumes.create({
      project_id: project.id,
      volume_number: 1,
      title: 'Volume',
    })
    const updatedVolume = volumes.update(volume.id, { synopsis: 'updated' }, volume.version)
    expect(updatedVolume?.version).toBe(volume.version + 1)
    expect(() => volumes.update(volume.id, { synopsis: 'stale' }, volume.version)).toThrow(
      VersionConflictError,
    )

    const volumeOutline = volumeOutlines.create({
      project_id: project.id,
      volume_id: volume.id,
    })
    const updatedOutline = volumeOutlines.update(
      volumeOutline.id,
      { summary: 'updated' },
      volumeOutline.version,
    )
    expect(updatedOutline?.version).toBe(volumeOutline.version + 1)
    const confirmed = volumeOutlines.setStatus(updatedOutline!.id, 'confirmed', updatedOutline!.version)
    expect(confirmed?.status).toBe('confirmed')
    expect(() => volumeOutlines.update(confirmed!.id, { summary: 'blocked' })).toThrow(
      OutlineNotEditableError,
    )

    const chapterOutline = chapterOutlines.create({
      project_id: project.id,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'Chapter',
    })
    expect(chapterOutlines.getById(chapterOutline.id)).toEqual(chapterOutline)
    expect(() => volumes.delete(volume.id)).toThrow(VolumeDeletionProtectedError)
  })

  test('coordinates project config, relationships, world settings, and selected materials', () => {
    const service = new NovelProjectService(createStores(database))
    const project = service.createProject({ slug: 'context', name: 'Context' })
    service.updateProjectConfig(project.id, { genre: 'mystery', tone: 'quiet' })
    const character = service.createCharacter({ project_id: project.id, name: 'lead' })
    const organization = service.createOrganization({ project_id: project.id, name: 'group' })
    const worldview = service.createWorldviewEntry({ project_id: project.id, title: 'setting' })
    service.createRelation({
      project_id: project.id,
      source: { type: 'character', id: character.id },
      target: { type: 'organization', id: organization.id },
      relation_type: 'member',
    })
    const material = service.createSourceMaterial({
      project_id: project.id,
      title: 'source',
      content: 'source content',
    })

    const context = service.getOutlineContext(project.id, [material.id])
    expect(context.config.genre).toBe('mystery')
    expect(context.characters).toEqual([character])
    expect(context.organizations).toEqual([organization])
    expect(context.worldview_entries).toEqual([worldview])
    expect(context.relations).toHaveLength(1)
    expect(context.source_materials).toEqual([material])
    expect(context.selected_source_materials).toEqual([material])
    expect(service.selectOutlineSourceMaterials(project.id, [material.id, material.id])).toEqual([
      material,
    ])

    const volume = service.createVolume({ project_id: project.id, volume_number: 1, title: 'Volume' })
    const outline = service.createVolumeOutline({
      project_id: project.id,
      volume_id: volume.id,
      source_material_ids: [material.id],
    })
    expect(outline.source_material_ids).toEqual([material.id])
  })

  test('enforces version conflicts and explicit draft, confirm, lock, and unlock transitions', () => {
    const service = new NovelProjectService(createStores(database))
    const project = service.createProject({ slug: 'states', name: 'States' })
    const volume = service.createVolume({ project_id: project.id, volume_number: 1, title: 'Volume' })
    const volumeOutline = service.createVolumeOutline({
      project_id: project.id,
      volume_id: volume.id,
      summary: 'draft',
    })
    const chapterOutline = service.createChapterOutline({
      project_id: project.id,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'Chapter',
    })

    const edited = service.updateVolumeOutline(
      project.id,
      volumeOutline.id,
      { summary: 'edited' },
      volumeOutline.version,
    )
    expect(edited.version).toBe(volumeOutline.version + 1)
    expect(() =>
      service.updateVolumeOutline(project.id, volumeOutline.id, { summary: 'stale' }, volumeOutline.version),
    ).toThrow(VersionConflictError)

    const confirmed = service.confirmVolumeOutline(project.id, volumeOutline.id, edited.version)
    expect(confirmed.status).toBe('confirmed')
    expect(() => service.updateVolumeOutline(project.id, volumeOutline.id, { summary: 'blocked' })).toThrow(
      OutlineNotEditableError,
    )
    const locked = service.lockVolumeOutline(project.id, volumeOutline.id, confirmed.version)
    expect(locked.status).toBe('locked')
    expect(() => service.lockVolumeOutline(project.id, volumeOutline.id, locked.version)).toThrow(
      OutlineStatusTransitionError,
    )
    const unlocked = service.unlockVolumeOutline(project.id, volumeOutline.id, locked.version)
    expect(unlocked.status).toBe('draft')

    const chapterConfirmed = service.confirmChapterOutline(
      project.id,
      chapterOutline.id,
      chapterOutline.version,
    )
    const chapterLocked = service.lockChapterOutline(
      project.id,
      chapterOutline.id,
      chapterConfirmed.version,
    )
    expect(chapterLocked.status).toBe('locked')
    expect(() =>
      service.updateChapterOutline(project.id, chapterOutline.id, { title: 'blocked' }),
    ).toThrow(OutlineNotEditableError)
    expect(service.unlockChapterOutline(project.id, chapterOutline.id, chapterLocked.version).status).toBe(
      'draft',
    )
  })

  test('protects volume deletion and cascades outline data only through project deletion', () => {
    const stores = createStores(database)
    const service = new NovelProjectService(stores)
    const first = service.createProject({ slug: 'delete-first', name: 'Delete First' })
    const second = service.createProject({ slug: 'delete-second', name: 'Delete Second' })
    const volume = service.createVolume({ project_id: first.id, volume_number: 1, title: 'Volume' })
    const volumeOutline = service.createVolumeOutline({ project_id: first.id, volume_id: volume.id })
    const chapterOutline = service.createChapterOutline({
      project_id: first.id,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'Chapter',
    })

    expect(() => service.deleteVolume(first.id, volume.id)).toThrow(VolumeDeletionProtectedError)
    service.selectProject(second.id)
    service.deleteProject(first.id)
    expect(stores.outline?.volumes.getById(volume.id)).toBeNull()
    expect(stores.outline?.volumeOutlines.getById(volumeOutline.id)).toBeNull()
    expect(stores.outline?.chapterOutlines.getById(chapterOutline.id)).toBeNull()
  })

  test('enforces chapter numbering and per-volume ordering constraints', () => {
    const service = new NovelProjectService(createStores(database))
    const project = service.createProject({ slug: 'numbering', name: 'Numbering' })
    const firstVolume = service.createVolume({ project_id: project.id, volume_number: 1, title: 'First' })
    const secondVolume = service.createVolume({ project_id: project.id, volume_number: 2, title: 'Second' })
    const firstChapter = service.createChapterOutline({
      project_id: project.id,
      volume_id: firstVolume.id,
      chapter_number: 1,
      sort_order: 1,
      title: 'First chapter',
    })
    const secondChapter = service.createChapterOutline({
      project_id: project.id,
      volume_id: firstVolume.id,
      chapter_number: 2,
      sort_order: 2,
      title: 'Second chapter',
    })
    expect(service.listChapterOutlinesByVolume(project.id, firstVolume.id)).toEqual([
      firstChapter,
      secondChapter,
    ])
    expect(() =>
      service.createChapterOutline({
        project_id: project.id,
        volume_id: secondVolume.id,
        chapter_number: 1,
        title: 'Duplicate chapter number',
      }),
    ).toThrow()
    expect(() =>
      service.createChapterOutline({
        project_id: project.id,
        volume_id: firstVolume.id,
        chapter_number: 3,
        sort_order: 2,
        title: 'Duplicate order',
      }),
    ).toThrow()
  })
})

describe('outline IPC input validation', () => {
  test('rejects invalid volume, chapter, source selection, and version payloads', () => {
    expect(() =>
      parseVolumeCreateParams({ project_id: 'p', volume_number: 0, title: 'invalid' }),
    ).toThrow('volume_number')
    expect(() =>
      parseVolumeUpdateParams({
        project_id: 'p',
        volume_id: 'v',
        input: {},
        expected_version: 0,
      }),
    ).toThrow('expected_version')
    expect(() =>
      parseVolumeOutlineCreateParams({
        project_id: 'p',
        volume_id: 'v',
        source_material_ids: [3],
      }),
    ).toThrow('source_material_ids')
    expect(() =>
      parseChapterOutlineCreateParams({
        project_id: 'p',
        volume_id: 'v',
        chapter_number: 0,
        title: 'invalid',
      }),
    ).toThrow('chapter_number')
    expect(() => parseOutlineContextParams({ project_id: 'p', source_material_ids: [''] })).toThrow(
      'source_material_ids',
    )
  })
})
