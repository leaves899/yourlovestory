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
  type IpcRegistry,
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

function requireTaskManager(taskManager?: TaskManager): TaskManager {
  if (!taskManager) throw new Error('TaskManager is not initialized')
  return taskManager
}

function requireChapterGenerationService(
  service?: ChapterGenerationService,
): ChapterGenerationService {
  if (!service) throw new Error('ChapterGenerationService is not initialized')
  return service
}

export function registerChapterIPC(
  ipc: IpcRegistry,
  dependencies: {
    taskManager?: TaskManager
    chapterGenerationService?: ChapterGenerationService
  },
): void {
  const { taskManager, chapterGenerationService } = dependencies

  ipc.register('chapterGeneration:start', async (_, input: {
    taskManager: TaskManager
    params: ReturnType<typeof parseChapterGenerationStartParams>
  }) => {
    const handle = input.taskManager.startChapterGeneration(input.params)
    return { success: true, data: { taskId: handle.taskId } }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      params: parseChapterGenerationStartParams(value),
    }),
  })

  ipc.register('chapterGeneration:versions', async (_, input: {
    service: ChapterGenerationService
    params: ReturnType<typeof parseProjectChapterParams>
  }) => {
    return {
      success: true,
      data: input.service.listVersions(input.params.projectId, input.params.chapterId),
    }
  }, {
    parse: (value) => ({
      service: requireChapterGenerationService(chapterGenerationService),
      params: parseProjectChapterParams(value),
    }),
  })

  ipc.register('chapterGeneration:version:get', async (_, input: {
    service: ChapterGenerationService
    params: ReturnType<typeof parseVersionActionParams>
  }) => {
    return {
      success: true,
      data: input.service.getVersion(input.params.projectId, input.params.versionId),
    }
  }, {
    parse: (value) => ({
      service: requireChapterGenerationService(chapterGenerationService),
      params: parseVersionActionParams(value),
    }),
  })

  ipc.register('chapterGeneration:version:confirm', async (_, input: {
    service: ChapterGenerationService
    params: ReturnType<typeof parseVersionActionParams>
  }) => {
    return {
      success: true,
      data: input.service.confirmVersion(input.params.projectId, input.params.versionId),
    }
  }, {
    parse: (value) => ({
      service: requireChapterGenerationService(chapterGenerationService),
      params: parseVersionActionParams(value),
    }),
  })

  ipc.register('chapterGeneration:version:reject', async (_, input: {
    service: ChapterGenerationService
    params: ReturnType<typeof parseVersionActionParams>
  }) => {
    return {
      success: true,
      data: input.service.rejectVersion(input.params.projectId, input.params.versionId),
    }
  }, {
    parse: (value) => ({
      service: requireChapterGenerationService(chapterGenerationService),
      params: parseVersionActionParams(value),
    }),
  })
}

export function registerChapterPolishIPC(
  ipc: IpcRegistry,
  taskManager?: TaskManager,
): void {
  ipc.register('chapterPolish:start', async (_, input: {
    taskManager: TaskManager
    params: ReturnType<typeof parseChapterPolishStartParams>
  }) => {
    const handle = input.taskManager.startChapterPolish(input.params)
    return { success: true, data: { taskId: handle.taskId } }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      params: parseChapterPolishStartParams(value),
    }),
  })
}
