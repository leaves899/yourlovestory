import {
  CharacterRepository,
  ChapterRepository,
  ChapterRevisionRepository,
  ChapterVersionRepository,
  ChapterOutlineRepository,
  CurrentProjectRepository,
  FragmentRepository,
  ForeshadowRepository,
  NarrativeMemoryRepository,
  PostprocessReportRepository,
  OrganizationRepository,
  ProjectConfigRepository,
  ProjectRepository,
  RelationRepository,
  SkillRepository,
  SourceMaterialRepository,
  WorldviewEntryRepository,
  VolumeOutlineRepository,
  VolumeRepository,
} from '../database'
import type { SqliteDatabase } from '../database'
import { getCrush, listCrushes } from '../../shared/crush/crushStore'
import { loadCrushContext } from '../../shared/crush/contextLoader'
import { getFragment as getLegacyFragment } from '../../shared/fragment/manager'
import { listLegacyFragments as listLegacyFragmentDays } from '../../shared/fragment/storage'
import type {
  CrushSnapshot,
  LegacyFragmentSource,
  CrushSource,
  NovelProjectStores,
  LegacyFragmentSnapshot,
  LegacyCrushSnapshot,
} from '../../shared/novelProject'
import { ChapterGenerationService } from '../../shared/chapterGeneration'
import { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import { NovelProjectService as NovelProjectServiceClass } from '../../shared/novelProject'

export interface WorkbenchServiceOptions {
  projectRoot?: string
}

export class WorkbenchService extends NovelProjectServiceClass {
  public readonly projects: ProjectRepository
  public readonly configs: ProjectConfigRepository
  public readonly characters: CharacterRepository
  public readonly worldviewEntries: WorldviewEntryRepository
  public readonly organizations: OrganizationRepository
  public readonly relations: RelationRepository
  public readonly sourceMaterials: SourceMaterialRepository
  public readonly currentProject: CurrentProjectRepository
  public readonly volumes: VolumeRepository
  public readonly volumeOutlines: VolumeOutlineRepository
  public readonly chapterOutlines: ChapterOutlineRepository
  public readonly chapters: ChapterRepository
  public readonly chapterVersions: ChapterVersionRepository
  public readonly chapterGeneration: ChapterGenerationService
  public readonly chapterRevisions: ChapterRevisionRepository
  public readonly narrativeMemories: NarrativeMemoryRepository
  public readonly foreshadows: ForeshadowRepository
  public readonly skills: SkillRepository
  public readonly postprocessReports: PostprocessReportRepository
  public readonly narrative: NarrativeWorkbenchService

  public constructor(database: SqliteDatabase, options: WorkbenchServiceOptions = {}) {
    const projects = new ProjectRepository(database)
    const configs = new ProjectConfigRepository(database)
    const characters = new CharacterRepository(database)
    const worldviewEntries = new WorldviewEntryRepository(database)
    const organizations = new OrganizationRepository(database)
    const relations = new RelationRepository(database)
    const legacyFragments = new FragmentRepository(database)
    const sourceMaterials = new SourceMaterialRepository(database)
    const currentProject = new CurrentProjectRepository(database)
    const volumes = new VolumeRepository(database)
    const volumeOutlines = new VolumeOutlineRepository(database)
    const chapterOutlines = new ChapterOutlineRepository(database)
    const chapters = new ChapterRepository(database)
    const chapterVersions = new ChapterVersionRepository(database)
    const chapterRevisions = new ChapterRevisionRepository(database)
    const narrativeMemories = new NarrativeMemoryRepository(database)
    const foreshadows = new ForeshadowRepository(database)
    const skills = new SkillRepository(database)
    const postprocessReports = new PostprocessReportRepository(database)
    const stores: NovelProjectStores = {
      projects,
      configs,
      characters,
      worldviewEntries,
      organizations,
      relations,
      sourceMaterials,
      currentProject,
      outline: {
        volumes,
        volumeOutlines,
        chapterOutlines,
      },
    }
    const crushSource = options.projectRoot ? createCrushSource(options.projectRoot) : undefined
    const legacyFragmentSource = options.projectRoot
      ? createLegacyFragmentSource(options.projectRoot, legacyFragments)
      : undefined
    super(stores, crushSource, legacyFragmentSource)
    this.projects = projects
    this.configs = configs
    this.characters = characters
    this.worldviewEntries = worldviewEntries
    this.organizations = organizations
    this.relations = relations
    this.sourceMaterials = sourceMaterials
    this.currentProject = currentProject
    this.volumes = volumes
    this.volumeOutlines = volumeOutlines
    this.chapterOutlines = chapterOutlines
    this.chapters = chapters
    this.chapterVersions = chapterVersions
    this.chapterRevisions = chapterRevisions
    this.narrativeMemories = narrativeMemories
    this.foreshadows = foreshadows
    this.skills = skills
    this.postprocessReports = postprocessReports
    this.chapterGeneration = new ChapterGenerationService({
      project: this,
      chapters,
      versions: chapterVersions,
      memories: narrativeMemories,
      foreshadows,
    })
    this.narrative = new NarrativeWorkbenchService({
      stores: {
        project: this,
        chapters,
        versions: chapterVersions,
        memories: narrativeMemories,
        foreshadows,
        revisions: chapterRevisions,
        skills,
        reports: postprocessReports,
      },
    })
  }

  public listChapters(projectId: string) {
    return this.chapters.listByProject(projectId)
  }

  public getChapter(projectId: string, chapterId: string) {
    const chapter = this.chapters.getById(chapterId)
    return chapter?.project_id === projectId ? chapter : null
  }
}

function createCrushSource(projectRoot: string): CrushSource {
  return {
    list: (): LegacyCrushSnapshot[] => {
      const result = listCrushes(projectRoot)
      if (!result.success || !('data' in result) || !Array.isArray(result.data)) return []
      return result.data.map((meta) => ({
        slug: meta.slug,
        name: meta.name ?? meta.slug,
        nickname: meta.nickname ?? '',
        gender: meta.gender ?? '',
        description: meta.description ?? '',
        intimate_enabled: meta.intimate_enabled === true,
        created_at: meta.created_at ?? '',
        updated_at: meta.updated_at ?? '',
      }))
    },
    getBySlug: (slug: string): CrushSnapshot | null => {
      const result = getCrush(projectRoot, slug)
      if (!result.success || !('data' in result) || Array.isArray(result.data)) return null
      const context = loadCrushContext(projectRoot, slug)
      return {
        meta: {
          name: result.data.name,
          nickname: result.data.nickname,
          slug: result.data.slug,
          gender: result.data.gender,
          description: result.data.description,
          intimate_enabled: result.data.intimate_enabled,
        },
        context,
      }
    },
  }
}

function createLegacyFragmentSource(
  projectRoot: string,
  sqliteFragments: FragmentRepository,
): LegacyFragmentSource {
  const fromJournal = (): LegacyFragmentSnapshot[] => {
    const crushes = listCrushes(projectRoot)
    if (!crushes.success || !('data' in crushes) || !Array.isArray(crushes.data)) return []
    return crushes.data.flatMap((crush) =>
      listLegacyFragmentDays(projectRoot, crush.slug).flatMap((day) =>
        day.fragments.map((fragment) => ({
          id: fragment.id,
          source: 'journal-json' as const,
          date: fragment.date,
          time: fragment.time,
          origin: fragment.origin,
          mood: fragment.mood,
          content: fragment.content,
          env_tags: fragment.env_tags,
          behavior_tags: fragment.behavior_tags,
          custom_tags: fragment.custom_tags,
          writing_mode: fragment.writing_mode,
          theme: fragment.theme,
          crush_slug: fragment.crush_slug,
        })),
      ),
    )
  }

  const fromSqlite = (projectId: string): LegacyFragmentSnapshot[] =>
    sqliteFragments.listByProject(projectId).map((fragment) => ({
      id: fragment.id,
      source: 'sqlite-library',
      source_project_id: fragment.project_id,
      date: fragment.date,
      time: fragment.time,
      origin: fragment.origin,
      mood: fragment.mood,
      content: fragment.content,
      env_tags: fragment.env_tags,
      behavior_tags: fragment.behavior_tags,
      custom_tags: fragment.custom_tags,
      writing_mode: fragment.writing_mode,
      theme: fragment.theme,
      crush_slug: null,
    }))

  return {
    list: (projectId?: string): LegacyFragmentSnapshot[] => {
      const fragments = projectId === undefined
        ? fromJournal()
        : [...fromJournal(), ...fromSqlite(projectId)]
      return [...new Map(fragments.map((fragment) => [fragment.id, fragment])).values()]
    },
    getById: (fragmentId: string): LegacyFragmentSnapshot | null => {
      const fragment = getLegacyFragment(projectRoot, fragmentId)
      if (fragment) {
        return {
          id: fragment.id,
          source: 'journal-json',
          date: fragment.date,
          time: fragment.time,
          origin: fragment.origin,
          mood: fragment.mood,
          content: fragment.content,
          env_tags: fragment.env_tags,
          behavior_tags: fragment.behavior_tags,
          custom_tags: fragment.custom_tags,
          writing_mode: fragment.writing_mode,
          theme: fragment.theme,
          crush_slug: fragment.crush_slug,
        }
      }
      const sqliteFragment = sqliteFragments.getById(fragmentId)
      return sqliteFragment
        ? fromSqlite(sqliteFragment.project_id).find((item) => item.id === fragmentId) ?? null
        : null
    },
  }
}

export function createWorkbenchService(
  database: SqliteDatabase,
  options: WorkbenchServiceOptions = {},
): WorkbenchService {
  return new WorkbenchService(database, options)
}
