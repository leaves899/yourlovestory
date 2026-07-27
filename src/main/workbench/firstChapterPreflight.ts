import { evaluateFirstChapterWorkflow } from '../../shared/firstChapterWorkflow'
import { ChapterGenerationBoundaryError } from '../../shared/novelProject'
import type { StartChapterGenerationInput } from '../tasks'
import type { WorkbenchService } from './workbenchService'

export function assertChapterGenerationPreflight(
  workbench: WorkbenchService,
  input: StartChapterGenerationInput,
): void {
  const projectId = input.projectId
  const snapshot = evaluateFirstChapterWorkflow({
    targetChapterOutlineId: input.chapterOutlineId,
    project: workbench.getProject(projectId),
    config: workbench.getProjectConfig(projectId),
    characters: workbench.listCharacters(projectId),
    relations: workbench.listRelations(projectId),
    worldviewEntries: workbench.listWorldviewEntries(projectId),
    organizations: workbench.listOrganizations(projectId),
    sourceMaterials: workbench.listSourceMaterials(projectId),
    volumes: workbench.listVolumes(projectId),
    volumeOutlines: workbench.listVolumeOutlines(projectId),
    chapterOutlines: workbench.listChapterOutlines(projectId),
    chapterVersions: [],
    modelCredentialConfigured: true,
    modelEndpointValid: true,
    generationTaskRunning: false,
  })
  const blocking = snapshot.checks.filter((check) => check.blocking)
  if (blocking.length === 0) return
  throw new ChapterGenerationBoundaryError(
    `Chapter generation preflight failed: ${blocking.map((check) => check.title).join('；')}`,
  )
}
