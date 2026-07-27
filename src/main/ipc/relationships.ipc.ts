import {
  confirmPhaseAdvance,
  detectNarrativeSignals,
  loadProgress,
  setPhase,
} from '../../shared/relationship/manager'
import { safeError, type IpcRegistry } from './shared'

export function registerRelationshipIPC(
  ipc: IpcRegistry,
  userDataPath: string,
): void {
  ipc.register('relationship:progress', async (_, params) => {
    const progress = loadProgress(userDataPath, params.slug)
    return { success: true, data: progress }
  }, {
    formatError: (error) => ({ success: false, errors: [safeError(error)] }),
  })

  ipc.register('relationship:detectSignals', async (_, params) => {
    const result = detectNarrativeSignals(userDataPath, params.slug, params.narrativeText)
    return { success: true, data: result }
  }, {
    formatError: (error) => ({ success: false, errors: [safeError(error)] }),
  })

  ipc.register('relationship:advancePhase', async (_, params) => {
    const progress = confirmPhaseAdvance(userDataPath, params.slug, params.reason)
    return { success: true, data: progress }
  }, {
    formatError: (error) => ({ success: false, errors: [safeError(error)] }),
  })

  ipc.register('relationship:setPhase', async (_, params) => {
    const progress = setPhase(userDataPath, params.slug, params.phase)
    return { success: true, data: progress }
  }, {
    formatError: (error) => ({ success: false, errors: [safeError(error)] }),
  })
}
