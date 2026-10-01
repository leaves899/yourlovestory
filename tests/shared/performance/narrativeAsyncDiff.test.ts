import { NarrativeWorkbenchService, type NarrativeWorkbenchStores } from '@/shared/narrativeWorkbench'
import type { Chapter } from '@/shared/chapterGeneration'
import { EntityNotFoundError } from '@/shared/novelProject'

function fixture() {
  const chapter: Chapter = { id: 'actual-chapter', project_id: 'project', chapter_number: 7,
    arc_id: null, title: '', content: '正文', synopsis: '', status: 'completed', version: 1,
    target_words: null, actual_words: null, created_at: '', updated_at: '' }
  const chapters = { getById: jest.fn((id: string) => id === chapter.id ? chapter : null),
    getByProjectAndNumber: jest.fn(() => chapter) }
  const revisions = { listByChapter: jest.fn(() => []), getCurrentByChapter: jest.fn(() => null),
    getById: jest.fn((id: string) => ({ id, chapter_id: chapter.id, blocks: [], content: '正文' })) }
  const project = { getChapterOutline: jest.fn((projectId: string, id: string) => {
    if (projectId !== 'project' || id !== 'independent-outline') throw new EntityNotFoundError('Chapter outline', id)
    return { chapter_number: 7 }
  }) }
  const versions = { getById: jest.fn((id: string) => ({ id, chapter_id: chapter.id, content: id === 'before' ? '正文' : '修订正文' })) }
  const computeDiff = jest.fn(async () => ({ changes: [], unchanged_count: 0, added_count: 0, removed_count: 0, modified_count: 1 }))
  const service = new NarrativeWorkbenchService({ stores: { chapters, revisions, project, versions } as unknown as NarrativeWorkbenchStores,
    computeDiff })
  return { chapter, chapters, revisions, versions, project, computeDiff, service }
}

test('read lists resolve distinct outline and chapter ids; valid ungenerated outline stays empty', () => {
  const { chapters, revisions, service } = fixture()
  expect(service.listRevisions('project', 'independent-outline')).toEqual([])
  expect(chapters.getByProjectAndNumber).toHaveBeenCalledWith('project', 7)
  expect(revisions.listByChapter).toHaveBeenCalledWith('actual-chapter')
  expect(service.getChapterBlocks('project', 'independent-outline')).toHaveLength(1)
  chapters.getByProjectAndNumber.mockReturnValue(null as never)
  expect(service.listRevisions('project', 'independent-outline')).toEqual([])
  expect(service.getChapterBlocks('project', 'independent-outline')).toEqual([])
  expect(() => service.listRevisions('other-project', 'independent-outline')).toThrow(EntityNotFoundError)
  expect(() => service.getChapterBlocks('project', 'missing-id')).toThrow(EntityNotFoundError)
})

test('async service passes only snapshot fields and Agent cancellation signal to pure compute port', async () => {
  const { computeDiff, service } = fixture()
  const signal = new AbortController().signal
  await expect(service.diffVersionsAsync('project', 'before', 'after', signal)).resolves.toMatchObject({ diff: { modified_count: 1 } })
  expect(computeDiff).toHaveBeenLastCalledWith({ mode: 'content', chapter_id: 'actual-chapter', before_content: '正文', after_content: '修订正文' }, { signal })
  await service.diffRevisionsAsync('project', 'before', 'after', signal)
  expect(computeDiff).toHaveBeenLastCalledWith({ mode: 'blocks', before: [], after: [] }, { signal })
  await expect(service.diffVersionsAsync('other-project', 'before', 'after')).rejects.toThrow(EntityNotFoundError)
  expect(computeDiff).toHaveBeenCalledTimes(2)
})
