import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  CharacterRepository,
  CurrentProjectRepository,
  OrganizationRepository,
  ProjectConfigRepository,
  ProjectRepository,
  RelationRepository,
  SourceMaterialRepository,
  WorldviewEntryRepository,
  initializeDatabase,
  migrations,
  runMigrations,
  type SqliteDatabase,
} from '@/main/database'
import {
  CurrentProjectDeletionError,
  EntityNotFoundError,
  InvalidRelationEndpointError,
  NovelProjectService,
  VersionConflictError,
  type CrushSource,
  type LegacyFragmentSource,
  type NovelProjectStores,
} from '@/shared/novelProject'
import {
  parseProjectCreateParams,
  parseProjectUpdateParams,
  parseRelationCreateParams,
  parseSourceMaterialListParams,
  parseSourceMaterialSelectionParams,
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
  }
}

describe('NovelProjectService', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-novel-project-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('isolates multiple projects, filters materials, and selects prompt inputs', () => {
    const service = new NovelProjectService(createStores(database))
    const first = service.createProject({ slug: 'alpha', name: 'Alpha' })
    const second = service.createProject({ slug: 'beta', name: 'Beta' })
    const firstCharacter = service.createCharacter({
      project_id: first.id,
      name: '角色甲',
      role: 'lead',
    })
    const secondCharacter = service.createCharacter({
      project_id: second.id,
      name: '角色乙',
      role: 'support',
    })
    const firstMaterial = service.createSourceMaterial({
      project_id: first.id,
      character_id: firstCharacter.id,
      title: '第一份素材',
      content: '第一项目内容',
    })
    const secondMaterial = service.createSourceMaterial({
      project_id: second.id,
      character_id: secondCharacter.id,
      title: '第二份素材',
      content: '第二项目内容',
    })

    expect(service.listCharacters(first.id)).toEqual([firstCharacter])
    expect(service.listCharacters(second.id)).toEqual([secondCharacter])
    expect(service.listSourceMaterials(first.id, { character_id: firstCharacter.id })).toEqual([
      firstMaterial,
    ])
    expect(service.listSourceMaterials(first.id, { character_id: secondCharacter.id })).toEqual([])
    expect(service.selectSourceMaterialsForPrompt(first.id, [firstMaterial.id, firstMaterial.id])).toEqual([
      firstMaterial,
    ])
    expect(() => service.getSourceMaterial(first.id, secondMaterial.id)).toThrow(EntityNotFoundError)
  })

  test('protects current project deletion and cascades project data', () => {
    const stores = createStores(database)
    const service = new NovelProjectService(stores)
    const first = service.createProject({ slug: 'current', name: 'Current' })
    const second = service.createProject({ slug: 'other', name: 'Other' })
    service.selectProject(first.id)
    const character = service.createCharacter({ project_id: first.id, name: '角色甲' })
    const material = service.createSourceMaterial({
      project_id: first.id,
      character_id: character.id,
      title: '可删除素材',
    })

    expect(() => service.deleteProject(first.id)).toThrow(CurrentProjectDeletionError)
    service.selectProject(second.id)
    service.deleteProject(first.id)

    expect(stores.projects.getById(first.id)).toBeNull()
    expect(stores.characters.getById(character.id)).toBeNull()
    expect(stores.sourceMaterials.getById(material.id)).toBeNull()
    expect(service.getCurrentProject()?.id).toBe(second.id)
  })

  test('supports cross-entity relations and cleans them when an endpoint is deleted', () => {
    const stores = createStores(database)
    const service = new NovelProjectService(stores)
    const project = service.createProject({ slug: 'relations', name: 'Relations' })
    const character = service.createCharacter({ project_id: project.id, name: '角色甲' })
    const organization = service.createOrganization({ project_id: project.id, name: '组织甲' })
    const worldview = service.createWorldviewEntry({
      project_id: project.id,
      title: '地点甲',
      content: '世界观内容',
    })
    const characterOrganization = service.createRelation({
      project_id: project.id,
      source: { type: 'character', id: character.id },
      target: { type: 'organization', id: organization.id },
      relation_type: 'member',
    })
    service.createRelation({
      project_id: project.id,
      source: { type: 'organization', id: organization.id },
      target: { type: 'worldview', id: worldview.id },
      relation_type: 'located-in',
    })

    expect(service.listRelations(project.id)).toHaveLength(2)
    expect(() =>
      service.createRelation({
        project_id: project.id,
        source: { type: 'character', id: character.id },
        target: { type: 'character', id: character.id },
        relation_type: 'self',
      }),
    ).toThrow(InvalidRelationEndpointError)

    service.deleteOrganization(project.id, organization.id)
    expect(service.listRelations(project.id)).toEqual([])
    expect(stores.relations.getById(characterOrganization.id)).toBeNull()
  })

  test('rejects stale versions and keeps unrelated project relations isolated', () => {
    const stores = createStores(database)
    const service = new NovelProjectService(stores)
    const first = service.createProject({ slug: 'versioned', name: 'Versioned' })
    const second = service.createProject({ slug: 'isolated', name: 'Isolated' })
    const updated = service.updateProject(first.id, { name: 'Versioned Updated' }, first.version)
    expect(updated.version).toBe(first.version + 1)
    expect(() => service.updateProject(first.id, { name: 'Stale Write' }, first.version)).toThrow(
      VersionConflictError,
    )
    expect(service.listRelations(second.id)).toEqual([])
  })

  test('supports project configuration and update/delete operations for every workbench entity', () => {
    const service = new NovelProjectService(createStores(database))
    const project = service.createProject({ slug: 'crud', name: 'CRUD' })
    const config = service.getProjectConfig(project.id)
    const updatedConfig = service.updateProjectConfig(
      project.id,
      { genre: 'mystery', settings: { pacing: 'steady' } },
      config.version,
    )
    expect(updatedConfig.genre).toBe('mystery')
    expect(updatedConfig.version).toBe(config.version + 1)

    const character = service.createCharacter({ project_id: project.id, name: '角色甲' })
    const organization = service.createOrganization({ project_id: project.id, name: '组织甲' })
    const worldview = service.createWorldviewEntry({ project_id: project.id, title: '设定甲' })
    const relation = service.createRelation({
      project_id: project.id,
      source: { type: 'character', id: character.id },
      target: { type: 'organization', id: organization.id },
      relation_type: 'member',
    })
    const material = service.createSourceMaterial({ project_id: project.id, title: '素材甲' })

    expect(service.updateCharacter(project.id, character.id, { role: 'updated' }, character.version)?.role).toBe(
      'updated',
    )
    expect(service.updateOrganization(project.id, organization.id, { description: 'updated' })?.description).toBe(
      'updated',
    )
    expect(service.updateWorldviewEntry(project.id, worldview.id, { content: 'updated' })?.content).toBe(
      'updated',
    )
    expect(service.updateRelation(project.id, relation.id, { description: 'updated' })?.description).toBe(
      'updated',
    )
    expect(service.updateSourceMaterial(project.id, material.id, { content: 'updated' })?.content).toBe(
      'updated',
    )

    service.deleteRelation(project.id, relation.id)
    service.deleteWorldviewEntry(project.id, worldview.id)
    service.deleteSourceMaterial(project.id, material.id)
    expect(service.listRelations(project.id)).toEqual([])
  })

  test('maps a Crush without importing intimate content when disabled and imports a legacy fragment', () => {
    const crushSource: CrushSource = {
      getBySlug: (slug) => ({
        meta: {
          name: '角色原名',
          nickname: '角色昵称',
          slug,
          gender: 'unknown',
          description: '角色描述',
          intimate_enabled: false,
        },
        context: {
          persona: 'persona',
          memory: 'memory',
          weekday: 'weekday',
          contextSummary: 'summary',
          intimateKnowledge: null,
          intimateEnabled: false,
        },
      }),
    }
    const fragmentSource: LegacyFragmentSource = {
      getById: (fragmentId) => ({
        id: fragmentId,
        date: '2026-07-18',
        time: '10:00',
        origin: 'user',
        mood: 'neutral',
        content: '旧碎片内容',
        env_tags: ['室内'],
        behavior_tags: ['对话'],
        custom_tags: [],
        writing_mode: 'raw',
        theme: null,
        crush_slug: 'mapped-crush',
      }),
    }
    const service = new NovelProjectService(createStores(database), crushSource, fragmentSource)
    const project = service.createProject({ slug: 'mapped', name: 'Mapped' })
    const character = service.mapCrushToCharacter({
      project_id: project.id,
      crush_slug: 'mapped-crush',
    })
    expect(character.crush_slug).toBe('mapped-crush')
    expect(character.profile.intimate_knowledge).toBeUndefined()

    const material = service.createSourceMaterialFromFragment({
      project_id: project.id,
      fragment_id: 'legacy-fragment-1',
    })
    expect(material.material_type).toBe('fragment')
    expect(material.character_id).toBe(character.id)
    expect(service.createSourceMaterialFromFragment({
      project_id: project.id,
      fragment_id: 'legacy-fragment-1',
    })).toEqual(material)
  })

  test('preserves character relations while upgrading a Goal 1/2 database to the workbench schema', () => {
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-legacy-upgrade-'))
    const legacyDatabase = initializeDatabase(legacyRoot, { migrations: migrations.slice(0, 2) })
    legacyDatabase
      .prepare('INSERT INTO projects (id, slug, name) VALUES (?, ?, ?)')
      .run('legacy-project', 'legacy', 'Legacy')
    legacyDatabase
      .prepare('INSERT INTO characters (id, project_id, name) VALUES (?, ?, ?)')
      .run('legacy-character-a', 'legacy-project', '角色甲')
    legacyDatabase
      .prepare('INSERT INTO characters (id, project_id, name) VALUES (?, ?, ?)')
      .run('legacy-character-b', 'legacy-project', '角色乙')
    legacyDatabase
      .prepare(
        `INSERT INTO relations (
          id, project_id, source_character_id, target_character_id, relation_type
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        'legacy-relation',
        'legacy-project',
        'legacy-character-a',
        'legacy-character-b',
        'friend',
      )
    runMigrations(legacyDatabase)
    const relations = new RelationRepository(legacyDatabase).listByProject('legacy-project')
    expect(relations[0]).toEqual(
      expect.objectContaining({
        source_entity_type: 'character',
        source_entity_id: 'legacy-character-a',
        target_entity_type: 'character',
        target_entity_id: 'legacy-character-b',
      }),
    )
    legacyDatabase.close()
    fs.rmSync(legacyRoot, { recursive: true, force: true })
  })
})

describe('Workbench IPC input validation', () => {
  test('rejects malformed project, relation, material filter, and selection payloads', () => {
    expect(() => parseProjectCreateParams({ name: 'missing slug' })).toThrow('slug')
    expect(() => parseProjectUpdateParams({ project_id: 'p', input: {}, expected_version: 0 })).toThrow(
      'expected_version',
    )
    expect(() =>
      parseRelationCreateParams({
        project_id: 'p',
        source: { type: 'character', id: 'a' },
        target: { type: 'organization', id: 'b' },
        relation_type: 'member',
        metadata: { invalid: undefined },
      }),
    ).toThrow('metadata')
    expect(() => parseSourceMaterialListParams({ project_id: 'p', character_id: 3 })).toThrow(
      'character_id',
    )
    expect(() =>
      parseSourceMaterialSelectionParams({ project_id: 'p', material_ids: [''] }),
    ).toThrow('material_ids')
  })
})
