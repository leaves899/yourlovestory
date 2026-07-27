import {
  getFragment,
  getFragmentsByDate,
  managerDeleteFragment,
  managerIntegrateFragments,
  managerRecordFragment,
  managerUpdateFragment,
} from '../../shared/fragment/manager'
import { getCurrentDate } from '../../shared/fragment/utils'
import type { IpcRegistry } from './shared'

export function registerFragmentIPC(
  ipc: IpcRegistry,
  userDataPath: string,
): void {
  ipc.register('fragment:record', async (_, params) => {
    const { date, slug, ...fragmentData } = params
    const result = managerRecordFragment(userDataPath, slug, fragmentData, date)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipc.register('fragment:list', async (_, params) => ({
    success: true,
    data: getFragmentsByDate(userDataPath, params.slug, params.date ?? getCurrentDate()),
  }))

  ipc.register('fragment:get', async (_, params) => {
    const fragment = getFragment(userDataPath, params.fragment_id)
    return fragment
      ? { success: true, data: fragment }
      : {
          success: false,
          errors: ['\u788e\u7247\u4e0d\u5b58\u5728'],
        }
  })

  ipc.register('fragment:update', async (_, params) => {
    const { fragment_id, slug: _slug, expected_version, ...updates } = params
    const result = managerUpdateFragment(userDataPath, fragment_id, updates, expected_version)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipc.register('fragment:delete', async (_, params) =>
    managerDeleteFragment(userDataPath, params.fragment_id, params.expected_version)
  )

  ipc.register('fragment:integrate', async (_, params) => ({
    success: true,
    data: {
      prompt: managerIntegrateFragments(
        userDataPath,
        params.slug,
        params.date ?? getCurrentDate(),
      ),
    },
  }))
}
