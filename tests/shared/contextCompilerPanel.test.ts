import {
  buildStageCompileViews,
  parseStageCompileView,
  selectContextCompilerTask,
  type ContextTextStage,
} from '@/renderer/components/contextCompilerTrace'
import type { TaskView } from '@/renderer/stores/taskStore'

function sampleTrace(withFinal: boolean) {
  return {
    task_kind: 'chapter_body',
    selected: [
      {
        id: 'task_instruction:main',
        source: 'task_instruction',
        title: '任务指令',
        priority: 'required',
        relevance_score: 1,
        importance: 1000,
        estimated_tokens: 42,
        reason: { code: 'required_by_strategy', message: '策略必选来源' },
      },
      {
        id: 'source_material:sm-1',
        source: 'source_material',
        title: '设定',
        priority: 'high',
        relevance_score: 0.4,
        importance: 700,
        estimated_tokens: 18,
        reason: { code: 'explicit_selection', message: '显式选中' },
      },
    ],
    discarded: [
      {
        id: 'narrative_memory:nm-2',
        source: 'narrative_memory',
        title: '归档记忆',
        priority: 'low',
        relevance_score: 0.1,
        importance: 10,
        estimated_tokens: 12,
        reason: { code: 'status_filtered', message: '状态过滤' },
      },
    ],
    budget: {
      total_budget: 32_000,
      system_reserved: 80,
      max_output_reserved: 2_048,
      available_for_prompt: 29_872,
      selected_tokens: 60,
      discarded_tokens: 12,
      remaining_tokens: 29_812,
      estimation_method: 'chars_div_4_ceil',
      estimation_note: 'note',
    },
    warnings: [],
    errors: [],
    metadata: {
      prompt_version: 'context-compiler/v1',
      task_kind: 'chapter_body',
      strategy_id: 'chapter_body/v1',
      model: 'test-model',
      temperature: 0.2,
      max_output_tokens: 2_048,
      context_budget: 32_000,
    },
    ...(withFinal ? { final_prompt: 'SECRET_FINAL_PROMPT_BODY' } : {}),
  }
}

function sampleStageCompile(withFinal: boolean) {
  return {
    prompt_version: 'context-compiler/v1',
    model_params: {
      model: 'test-model',
      temperature: 0.2,
      max_output_tokens: 2_048,
      context_budget: 32_000,
    },
    trace: sampleTrace(withFinal),
  }
}

function makeTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-gen-1',
    project_id: 'project-1',
    chapter_id: 'chapter-1',
    parent_task_id: null,
    task_type: 'chapter-generation',
    status: 'completed',
    stage: 'review',
    progress: 1,
    input: {
      request: {
        chapter_outline_id: 'outline-1',
        debug: false,
      },
    },
    checkpoint: {
      stage: 'review',
      stage_compiles: {
        body: sampleStageCompile(true),
        summary: sampleStageCompile(false),
        fact_check: sampleStageCompile(false),
      },
    },
    result: {
      chapter_id: 'chapter-1',
      stage_compiles: {
        body: sampleStageCompile(true),
      },
    },
    error_message: null,
    cancel_requested: false,
    started_at: '2026-01-01T00:00:00.000Z',
    finished_at: '2026-01-01T00:01:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:01:00.000Z',
    ...overrides,
  }
}

describe('ContextCompilerPanel pure helpers', () => {
  test('默认 uiDebug=false 时绝不暴露 final_prompt（即使 raw 含密钥）', () => {
    const stage: ContextTextStage = 'body'
    const hidden = parseStageCompileView(stage, sampleStageCompile(true), false)
    expect(hidden).not.toBeNull()
    expect(hidden!.final_prompt).toBeNull()
    expect(JSON.stringify(hidden)).not.toContain('SECRET_FINAL_PROMPT_BODY')

    const views = buildStageCompileViews(makeTask(), false)
    expect(views.length).toBe(3)
    for (const view of views) {
      expect(view.final_prompt).toBeNull()
    }
    expect(JSON.stringify(views)).not.toContain('SECRET_FINAL_PROMPT_BODY')
  })

  test('uiDebug=true 时仅当 trace 含 final_prompt 才展示', () => {
    const withPrompt = parseStageCompileView('body', sampleStageCompile(true), true)
    const withoutPrompt = parseStageCompileView('summary', sampleStageCompile(false), true)
    expect(withPrompt?.final_prompt).toBe('SECRET_FINAL_PROMPT_BODY')
    expect(withoutPrompt?.final_prompt).toBeNull()
  })

  test('解析 selected/discarded 的 source_kind、source_id、reason、tokens 与预算/模型', () => {
    const view = parseStageCompileView('body', sampleStageCompile(false), false)!
    expect(view.prompt_version).toBe('context-compiler/v1')
    expect(view.model).toBe('test-model')
    expect(view.max_output_tokens).toBe(2_048)
    expect(view.context_budget).toBe(32_000)
    expect(view.budget).toEqual(
      expect.objectContaining({
        total_budget: 32_000,
        selected_tokens: 60,
        max_output_reserved: 2_048,
      }),
    )
    expect(view.selected[0]).toEqual(
      expect.objectContaining({
        source_kind: 'task_instruction',
        source_id: 'main',
        reason_code: 'required_by_strategy',
        tokens: 42,
      }),
    )
    expect(view.selected[1]).toEqual(
      expect.objectContaining({
        source_kind: 'source_material',
        source_id: 'sm-1',
        reason_code: 'explicit_selection',
        tokens: 18,
      }),
    )
    expect(view.discarded[0]).toEqual(
      expect.objectContaining({
        source_kind: 'narrative_memory',
        source_id: 'nm-2',
        reason_code: 'status_filtered',
        tokens: 12,
      }),
    )
  })

  test('优先当前 active task，否则取最近 chapter-generation', () => {
    const older = makeTask({
      id: 'task-old',
      updated_at: '2026-01-01T00:00:00.000Z',
    })
    const newer = makeTask({
      id: 'task-new',
      updated_at: '2026-01-02T00:00:00.000Z',
    })
    const otherOutline = makeTask({
      id: 'task-other',
      updated_at: '2026-01-03T00:00:00.000Z',
      input: { request: { chapter_outline_id: 'outline-2' } },
    })
    expect(selectContextCompilerTask([older, newer, otherOutline], 'task-old', 'outline-1')?.id).toBe(
      'task-old',
    )
    expect(selectContextCompilerTask([older, newer, otherOutline], null, 'outline-1')?.id).toBe(
      'task-new',
    )
    expect(selectContextCompilerTask([older, newer, otherOutline], null, 'outline-2')?.id).toBe(
      'task-other',
    )
  })

  test('大纲 trace 从结果读取并沿用相同预算和 Debug 门禁', () => {
    const task = makeTask({
      task_type: 'outline-generation', chapter_id: null,
      input: { request: { outline_id: 'volume-outline-1' } },
      checkpoint: null, result: { stage_compiles: { outline: sampleStageCompile(true) } },
    })
    const hidden = buildStageCompileViews(task, false)
    expect(hidden).toHaveLength(1)
    expect(hidden[0].stage).toBe('outline')
    expect(hidden[0].budget?.total_budget).toBe(32_000)
    expect(hidden[0].final_prompt).toBeNull()
    expect(buildStageCompileViews(task, true)[0].final_prompt).toBe('SECRET_FINAL_PROMPT_BODY')
  })

  test('大纲来源面板只选择目标卷的任务，不借用另一卷或章节的 trace', () => {
    const chapter = makeTask()
    const target = makeTask({ id: 'outline-task', task_type: 'outline-generation', input: { request: { outline_id: 'target-outline' } } })
    const other = makeTask({ id: 'other-task', task_type: 'outline-generation', input: { request: { outline_id: 'other-outline' } }, updated_at: '2026-01-03T00:00:00.000Z' })
    expect(selectContextCompilerTask([chapter, target, other], 'other-task', 'target-outline', 'outline-generation')?.id).toBe('outline-task')
    expect(selectContextCompilerTask([chapter, other], 'other-task', 'target-outline', 'outline-generation')).toBeNull()
  })
})
