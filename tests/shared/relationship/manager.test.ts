import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as progressStore from '@/shared/relationship/progress_store'
import { handleNarrativeComplete } from '@/shared/relationship/manager'

describe('Relationship Manager', () => {
  let testRoot: string
  const testSlug = 'test-crush'

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relationship-manager-'))
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  test('handleNarrativeComplete 会累积信号、叙事数和阶段历史', () => {
    const result = handleNarrativeComplete(
      testRoot,
      testSlug,
      '今天我们聊天了，知道了她的名字，还加了微信。'
    )

    expect(result.signals).toHaveLength(3)
    expect(result.shouldTransition).toBe(true)
    expect(result.progress.total_narratives).toBe(1)
    expect(result.progress.interaction_narratives).toBe(1)
    expect(result.progress.accumulated_score).toBe(60)
    expect(result.progress.phase_history[0].narrative_count).toBe(1)

    const savedProgress = progressStore.loadProgress(testRoot, testSlug)
    expect(savedProgress.total_narratives).toBe(1)
    expect(savedProgress.signals).toHaveLength(3)
    expect(savedProgress.accumulated_score).toBe(60)
  })

  test('saveProgress 失败时会把错误抛给调用方', () => {
    jest.spyOn(progressStore, 'saveProgress').mockReturnValue({
      success: false,
      error: '保存关系进度数据失败: disk full',
    })

    expect(() =>
      handleNarrativeComplete(
        testRoot,
        testSlug,
        '今天我们聊天了，知道了她的名字，还加了微信。'
      )
    ).toThrow('disk full')
  })
})
