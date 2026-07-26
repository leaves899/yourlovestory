import type { ChapterGenerationService } from '../../shared/chapterGeneration'
import type { TaskManager } from '../tasks'
import {
  parseChapterGenerationStartParams,
  parseChapterPolishStartParams,
} from '../tasks'
import {
  isRecord,
  parseProjectChapterParams,
  readString,
  type IpcRegistrar,
} from './shared'

function parseVersionActionParams(
  value: unknown,
): { projectId: string; versionId: string } {
  if (!isRecord(value)) throw new Error('chapter version input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    versionId: readString(value.version_id, 'version_id'),
  }
}

export function registerChapterIPC(
  ipc: IpcRegistrar,
  dependencies: {
    taskManager?: TaskManager
    chapterGenerationService?: ChapterGenerationService
  },
): void {
  const { taskManager, chapterGenerationService } = dependencies

  ipc.handle('chapterGeneration:start', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.startChapterGeneration(parseChapterGenerationStartParams(params))
    return { success: true, data: { taskId: handle.taskId } }
  })

  ipc.handle('chapterGeneration:versions', async (_, params: unknown) => {
    if (!chapterGenerationService) {
      throw new Error('ChapterGenerationService is not initialized')
    }
    const parsed = parseProjectChapterParams(params)
    return {
      success: true,
      data: chapterGenerationService.listVersions(parsed.projectId, parsed.chapterId),
    }
  })

  ipc.handle('chapterGeneration:version:get', async (_, params: unknown) => {
    if (!chapterGenerationService) {
      throw new Error('ChapterGenerationService is not initialized')
    }
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: chapterGenerationService.getVersion(parsed.projectId, parsed.versionId),
    }
  })

  ipc.handle('chapterGeneration:version:confirm', async (_, params: unknown) => {
    if (!chapterGenerationService) {
      throw new Error('ChapterGenerationService is not initialized')
    }
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: chapterGenerationService.confirmVersion(parsed.projectId, parsed.versionId),
    }
  })

  ipc.handle('chapterGeneration:version:reject', async (_, params: unknown) => {
    if (!chapterGenerationService) {
      throw new Error('ChapterGenerationService is not initialized')
    }
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: chapterGenerationService.rejectVersion(parsed.projectId, parsed.versionId),
    }
  })
}

export function registerChapterPolishIPC(
  ipc: IpcRegistrar,
  taskManager?: TaskManager,
): void {
  ipc.handle('chapterPolish:start', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.startChapterPolish(parseChapterPolishStartParams(params))
    return { success: true, data: { taskId: handle.taskId } }
  })
}
