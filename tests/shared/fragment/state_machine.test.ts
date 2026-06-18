/**
 * fragment state_machine 单元测试（TS 等价验证）。
 *
 * 移植自 tests/unit/test_fragment_state_machine.py 的断言。
 */
import {
  getStatus,
  getEditState,
  canEdit,
  canGenerate,
  canRegenerate,
  canDelete,
  canIntegrate,
  canAddFragment,
  transitionToCompleted,
  transitionToExpired,
  canUndoIntegration,
  undoIntegration,
} from '@/shared/fragment/state_machine'
import type { FragmentDay } from '@/shared/fragment/models'

function makeDay(overrides: Partial<FragmentDay> = {}): FragmentDay {
  return {
    date: '2026-05-30', crush_slug: 'example', fragments: [],
    completed: false, direction: null, writing_context: null,
    version: 1, integration_date: null,
    created_at: '2026-05-30T00:00:00', updated_at: '2026-05-30T00:00:00',
    ...overrides,
  }
}

describe('getStatus', () => {
  test('completed 始终返回 completed', () => {
    expect(getStatus('2026-05-30', true, '2026-05-30')).toBe('completed')
    expect(getStatus('2020-01-01', true, '2026-05-30')).toBe('completed')
  })

  test('今天 → in_progress', () => {
    expect(getStatus('2026-05-30', false, '2026-05-30')).toBe('in_progress')
  })

  test('7 天内 → unfinished', () => {
    expect(getStatus('2026-05-29', false, '2026-05-30')).toBe('unfinished')
    expect(getStatus('2026-05-23', false, '2026-05-30')).toBe('unfinished')
  })

  test('超过 7 天 → expired', () => {
    expect(getStatus('2026-05-22', false, '2026-05-30')).toBe('expired')
  })
})

describe('getEditState', () => {
  test('completed → readonly_final', () => {
    expect(getEditState(true, null)).toBe('readonly_final')
    expect(getEditState(true, 'content')).toBe('readonly_final')
  })

  test('无 context → editable', () => {
    expect(getEditState(false, null)).toBe('editable')
    expect(getEditState(false, '')).toBe('editable')
    expect(getEditState(false, '   ')).toBe('editable')
  })

  test('有 context → readonly_regenerable', () => {
    expect(getEditState(false, 'some content')).toBe('readonly_regenerable')
  })
})

describe('权限检查', () => {
  test('canEdit: 仅 editable 可编辑', () => {
    expect(canEdit('editable')).toBe(true)
    expect(canEdit('readonly_regenerable')).toBe(false)
    expect(canEdit('readonly_final')).toBe(false)
  })

  test('canGenerate: 仅 editable 可生成', () => {
    expect(canGenerate('editable')).toBe(true)
    expect(canGenerate('readonly_regenerable')).toBe(false)
  })

  test('canRegenerate: 仅 readonly_regenerable 可重新生成', () => {
    expect(canRegenerate('editable')).toBe(false)
    expect(canRegenerate('readonly_regenerable')).toBe(true)
    expect(canRegenerate('readonly_final')).toBe(false)
  })

  test('canDelete: completed 不可删除', () => {
    expect(canDelete('in_progress', true)).toBe(false)
    expect(canDelete('in_progress', false)).toBe(true)
    expect(canDelete('expired', false)).toBe(true)
  })

  test('canIntegrate', () => {
    expect(canIntegrate('in_progress')).toBe(true)
    expect(canIntegrate('unfinished')).toBe(true)
    expect(canIntegrate('expired')).toBe(false)
    expect(canIntegrate('completed')).toBe(false)
  })

  test('canAddFragment: 仅 in_progress 可添加', () => {
    expect(canAddFragment('in_progress')).toBe(true)
    expect(canAddFragment('unfinished')).toBe(false)
    expect(canAddFragment('expired')).toBe(false)
    expect(canAddFragment('completed')).toBe(false)
  })
})

describe('状态转换', () => {
  test('transitionToCompleted', () => {
    const day = makeDay()
    const result = transitionToCompleted(day, '叙事内容')
    expect(result.completed).toBe(true)
    expect(result.writing_context).toBe('叙事内容')
    expect(result.version).toBe(2)
  })

  test('transitionToExpired', () => {
    const day = makeDay({ version: 5 })
    const result = transitionToExpired(day)
    expect(result.version).toBe(6)
    expect(result.updated_at).not.toBe(day.updated_at)
  })
})

describe('撤销整合', () => {
  test('canUndoIntegration: completed + today integration', () => {
    const day = makeDay({ completed: true, integration_date: '2026-05-30' })
    expect(canUndoIntegration(day, '2026-05-30')).toBe(true)
  })

  test('canUndoIntegration: not completed', () => {
    const day = makeDay({ completed: false, integration_date: '2026-05-30' })
    expect(canUndoIntegration(day, '2026-05-30')).toBe(false)
  })

  test('canUndoIntegration: no integration_date', () => {
    const day = makeDay({ completed: true, integration_date: null })
    expect(canUndoIntegration(day, '2026-05-30')).toBe(false)
  })

  test('undoIntegration resets fields', () => {
    const day = makeDay({ completed: true, integration_date: '2026-05-30', version: 3 })
    const result = undoIntegration(day)
    expect(result.completed).toBe(false)
    expect(result.writing_context).toBeNull()
    expect(result.integration_date).toBeNull()
    expect(result.version).toBe(4)
  })
})
