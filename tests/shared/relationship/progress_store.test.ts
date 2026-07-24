import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  createInitialProgress,
  initializeProgress,
  loadProgress,
  saveProgress,
  recordSignals,
  advancePhase,
  incrementNarrativeCount,
  setPhase,
} from '@/shared/relationship/progress_store'
import type { PhaseSignal } from '@/shared/relationship/models'

describe('Progress Store', () => {
  test('拒绝路径穿越 crush slug', () => {
    expect(() => loadProgress(testRoot, '..')).toThrow()
  })

  let testRoot: string
  const testSlug = 'test-crush'

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'))
  })

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true })
  })

  describe('loadProgress', () => {
    test('返回默认数据', () => {
      const progress = loadProgress(testRoot, testSlug)

      expect(progress.current_phase).toBe(0)
      expect(progress.phase_name).toBe('陌生人')
      expect(progress.total_narratives).toBe(0)
      expect(progress.accumulated_score).toBe(0)
      expect(progress.threshold).toBe(60)
      expect(progress.phase_history).toHaveLength(1)
      expect(progress.phase_history[0].phase).toBe(0)
    })

    test('加载已存在的数据', () => {
      const progress = loadProgress(testRoot, testSlug)
      progress.current_phase = 1
      progress.phase_name = '认识'
      saveProgress(testRoot, progress)

      const loaded = loadProgress(testRoot, testSlug)
      expect(loaded.current_phase).toBe(1)
      expect(loaded.phase_name).toBe('认识')
    })
  })

  describe('createInitialProgress', () => {
    test('按指定阶段创建初始进度', () => {
      const progress = createInitialProgress(testSlug, 3)

      expect(progress.current_phase).toBe(3)
      expect(progress.phase_name).toBe('表白')
      expect(progress.threshold).toBe(-1)
      expect(progress.phase_history).toHaveLength(1)
      expect(progress.phase_history[0].phase).toBe(3)
    })
  })

  describe('saveProgress', () => {
    test('保存成功', () => {
      const progress = loadProgress(testRoot, testSlug)
      const result = saveProgress(testRoot, progress)

      expect(result.success).toBe(true)
      expect(result.error).toBe('')
    })

    test('更新 updated_at', () => {
      const progress = loadProgress(testRoot, testSlug)
      const oldUpdatedAt = progress.updated_at

      // 清空 updated_at，保存后应该被更新
      const newProgress = { ...progress, updated_at: '' }
      saveProgress(testRoot, newProgress)

      const loaded = loadProgress(testRoot, testSlug)
      expect(loaded.updated_at).not.toBe('')
      expect(loaded.updated_at).toBeDefined()
    })
  })

  describe('initializeProgress', () => {
    test('首次初始化会写入指定起点', () => {
      const result = initializeProgress(testRoot, testSlug, 2)

      expect(result.success).toBe(true)
      expect(result.progress.current_phase).toBe(2)
      expect(loadProgress(testRoot, testSlug).current_phase).toBe(2)
    })

    test('已有进度时不覆盖原始阶段', () => {
      initializeProgress(testRoot, testSlug, 1)
      const result = initializeProgress(testRoot, testSlug, 4)

      expect(result.success).toBe(true)
      expect(result.progress.current_phase).toBe(1)
      expect(loadProgress(testRoot, testSlug).current_phase).toBe(1)
    })
  })

  describe('recordSignals', () => {
    test('记录信号', () => {
      const signals: PhaseSignal[] = [
        { type: 'has_dialogue', description: '有对话', score: 20, detected_at: '' },
      ]

      const progress = recordSignals(testRoot, testSlug, signals)
      expect(progress.signals).toHaveLength(1)
      expect(progress.accumulated_score).toBe(20)
    })

    test('更新交互叙事计数', () => {
      const signals: PhaseSignal[] = [
        { type: 'has_dialogue', description: '有对话', score: 20, detected_at: '' },
      ]

      const progress = recordSignals(testRoot, testSlug, signals)
      expect(progress.interaction_narratives).toBe(1)
    })

    test('更新暧昧信号计数', () => {
      const signals: PhaseSignal[] = [
        { type: 'physical_contact', description: '身体接触', score: 25, detected_at: '' },
      ]

      const progress = recordSignals(testRoot, testSlug, signals)
      expect(progress.flirting_signals).toBe(1)
    })
  })

  describe('advancePhase', () => {
    test('推进到下一阶段', () => {
      const progress = advancePhase(testRoot, testSlug, '测试推进')

      expect(progress.current_phase).toBe(1)
      expect(progress.phase_name).toBe('认识')
      expect(progress.phase_history).toHaveLength(2)
      expect(progress.phase_history[0].ended_at).toBeDefined()
      expect(progress.phase_history[0].transition_reason).toBe('测试推进')
    })

    test('已是最高阶段时不推进', () => {
      // 先推进到最高阶段
      setPhase(testRoot, testSlug, 4)
      const progress = advancePhase(testRoot, testSlug)

      expect(progress.current_phase).toBe(4)
      expect(progress.phase_history).toHaveLength(2) // 默认 + 手动设置
    })
  })

  describe('incrementNarrativeCount', () => {
    test('增加叙事计数', () => {
      const progress = incrementNarrativeCount(testRoot, testSlug)

      expect(progress.total_narratives).toBe(1)
      expect(progress.phase_history[0].narrative_count).toBe(1)
    })
  })

  describe('setPhase', () => {
    test('手动设置阶段', () => {
      const progress = setPhase(testRoot, testSlug, 2)

      expect(progress.current_phase).toBe(2)
      expect(progress.phase_name).toBe('暧昧')
      expect(progress.phase_history).toHaveLength(2)
      expect(progress.phase_history[1].transition_reason).toBe('手动调整')
    })

    test('设置相同阶段时不操作', () => {
      const progress = setPhase(testRoot, testSlug, 0)

      expect(progress.current_phase).toBe(0)
      expect(progress.phase_history).toHaveLength(1)
    })
  })
})
