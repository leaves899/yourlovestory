import {
  confirmPhaseAdvance,
  detectNarrativeSignals,
  loadProgress,
  setPhase,
} from '../../shared/relationship/manager'
import { safeError, type IpcRegistrar } from './shared'

export function registerRelationshipIPC(
  ipc: IpcRegistrar,
  userDataPath: string,
): void {
  ipc.handle('relationship:progress', async (_, params) => {
    try {
      const progress = loadProgress(userDataPath, params.slug)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipc.handle('relationship:detectSignals', async (_, params) => {
    try {
      const result = detectNarrativeSignals(userDataPath, params.slug, params.narrativeText)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipc.handle('relationship:advancePhase', async (_, params) => {
    try {
      const progress = confirmPhaseAdvance(userDataPath, params.slug, params.reason)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipc.handle('relationship:setPhase', async (_, params) => {
    try {
      const progress = setPhase(userDataPath, params.slug, params.phase)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })
}
