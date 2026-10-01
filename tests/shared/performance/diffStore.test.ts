import { webcrypto } from 'node:crypto'
import { useNarrativeStore } from '@/renderer/stores/narrativeStore'
import narrativeService from '@/renderer/services/narrativeService'
import type { ChapterDiff } from '@/shared/narrativeWorkbench'

jest.mock('@/renderer/services/narrativeService', () => ({ __esModule: true, default: {
  onDiffProgress: jest.fn(() => jest.fn()), diffVersions: jest.fn(), diffRevisions: jest.fn(),
  cancelDiff: jest.fn(), listBlocks: jest.fn(), listRevisions: jest.fn(), listVersions: jest.fn(),
  listMemories: jest.fn(), listProposals: jest.fn(), listForeshadows: jest.fn(), listSkills: jest.fn(),
} }))

const service = jest.mocked(narrativeService)
const result: ChapterDiff = { changes: [], added_count: 0, removed_count: 0, unchanged_count: 0, modified_count: 1 }

beforeAll(() => Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }))
beforeEach(() => {
  jest.clearAllMocks()
  useNarrativeStore.setState({ projectId: 'project', chapterId: 'chapter', diffRequestId: null,
    diff: null, error: null, diffCancelling: false, diffMessage: null, diffProgress: 0 })
})

test('progress is scoped to request id, duplicate run is ignored, and late project result is fenced', async () => {
  let resolve: ((value: { diff: ChapterDiff }) => void) | undefined
  service.diffVersions.mockImplementation(() => new Promise((finish) => { resolve = finish }))
  const pending = useNarrativeStore.getState().compareVersions('before', 'after')
  const id = useNarrativeStore.getState().diffRequestId
  const listener = service.onDiffProgress.mock.calls[0]?.[0]
  listener?.({ request_id: 'wrong-id', progress: 0.8 })
  expect(useNarrativeStore.getState().diffProgress).toBe(0)
  listener?.({ request_id: id ?? '', progress: 0.2 })
  expect(useNarrativeStore.getState().diffProgress).toBe(0.2)
  await useNarrativeStore.getState().compareVersions('other', 'after')
  expect(service.diffVersions).toHaveBeenCalledTimes(1)
  useNarrativeStore.setState({ projectId: 'different-project' })
  resolve?.({ diff: result })
  await pending
  expect(useNarrativeStore.getState().diff).toBeNull()
  expect(useNarrativeStore.getState().diffRequestId).toBeNull()
})

test('cancel routes the active id and suppresses a late successful result', async () => {
  let resolve: ((value: { from_revision_id: null; to_revision_id: null; diff: ChapterDiff }) => void) | undefined
  service.diffRevisions.mockImplementation(() => new Promise((finish) => { resolve = finish }))
  service.cancelDiff.mockResolvedValue({ cancelled: true })
  const pending = useNarrativeStore.getState().compareRevisions('before', 'after')
  const id = useNarrativeStore.getState().diffRequestId
  await useNarrativeStore.getState().cancelDiff()
  expect(service.cancelDiff).toHaveBeenCalledWith(id)
  resolve?.({ from_revision_id: null, to_revision_id: null, diff: result })
  await pending
  expect(useNarrativeStore.getState().diff).toBeNull()
  expect(useNarrativeStore.getState().diffMessage).toBe('章节对比已取消')
})

test('chapter switch cancels previous computation and ignores old response', async () => {
  let resolve: ((value: { diff: ChapterDiff }) => void) | undefined
  service.diffVersions.mockImplementation(() => new Promise((finish) => { resolve = finish }))
  service.cancelDiff.mockResolvedValue({ cancelled: true })
  service.listBlocks.mockResolvedValue([])
  service.listRevisions.mockResolvedValue([])
  service.listVersions.mockResolvedValue([])
  const pending = useNarrativeStore.getState().compareVersions('before', 'after')
  const id = useNarrativeStore.getState().diffRequestId
  await useNarrativeStore.getState().loadChapter('project', 'different-outline-id')
  expect(service.cancelDiff).toHaveBeenCalledWith(id)
  resolve?.({ diff: result })
  await pending
  expect(useNarrativeStore.getState().chapterId).toBe('different-outline-id')
  expect(useNarrativeStore.getState().diff).toBeNull()
})
