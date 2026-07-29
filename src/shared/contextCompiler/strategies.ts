import type { ContextTaskKind, ContextTaskStrategy } from './models'

export const CONTEXT_PROMPT_VERSION = 'context-compiler/v1'

const chapterGoalSources = [
  'task_instruction',
  'project_config',
  'volume_goal',
  'chapter_goal',
] as const

export const CHAPTER_BODY_STRATEGY: ContextTaskStrategy = {
  id: 'chapter_body/v1',
  task_kind: 'chapter_body',
  allowed_sources: [
    ...chapterGoalSources,
    'character',
    'relation',
    'worldview',
    'source_material',
    'prior_chapter_summary',
    'recent_body',
    'narrative_memory',
    'foreshadow',
    'continuation',
  ],
  required_sources: ['task_instruction', 'project_config', 'chapter_goal'],
  capacities: [
    { source: 'character', max_items: 12 },
    { source: 'relation', max_items: 12 },
    { source: 'worldview', max_items: 16 },
    { source: 'source_material', max_items: 12 },
    { source: 'prior_chapter_summary', max_items: 8 },
    { source: 'recent_body', max_items: 2 },
    { source: 'narrative_memory', max_items: 16 },
    { source: 'foreshadow', max_items: 12 },
  ],
  min_relevance: 0.05,
  recent_body_chapter_limit: 2,
  recent_body_char_limit: 2_400,
  prior_summary_limit: 8,
}

export const OUTLINE_STRATEGY: ContextTaskStrategy = {
  id: 'outline/v1',
  task_kind: 'outline',
  allowed_sources: [
    'task_instruction',
    'project_config',
    'volume_goal',
    'character',
    'relation',
    'worldview',
    'source_material',
    'prior_chapter_summary',
    'narrative_memory',
    'foreshadow',
  ],
  required_sources: ['task_instruction', 'project_config'],
  capacities: [
    { source: 'character', max_items: 16 },
    { source: 'relation', max_items: 12 },
    { source: 'worldview', max_items: 20 },
    { source: 'source_material', max_items: 16 },
    { source: 'prior_chapter_summary', max_items: 12 },
    { source: 'narrative_memory', max_items: 20 },
    { source: 'foreshadow', max_items: 16 },
  ],
  min_relevance: 0.02,
  recent_body_chapter_limit: 0,
  recent_body_char_limit: 0,
  prior_summary_limit: 12,
}

export const SUMMARY_STRATEGY: ContextTaskStrategy = {
  id: 'summary/v1',
  task_kind: 'summary',
  allowed_sources: [
    'task_instruction',
    'project_config',
    'chapter_goal',
    'stage_body',
    'continuation',
  ],
  required_sources: ['task_instruction', 'stage_body'],
  capacities: [],
  min_relevance: 0,
  recent_body_chapter_limit: 0,
  recent_body_char_limit: 0,
  prior_summary_limit: 0,
}

export const FACT_CHECK_STRATEGY: ContextTaskStrategy = {
  id: 'fact_check/v1',
  task_kind: 'fact_check',
  allowed_sources: [
    'task_instruction',
    'project_config',
    'volume_goal',
    'chapter_goal',
    'source_material',
    'narrative_memory',
    'foreshadow',
    'stage_body',
    'continuation',
  ],
  required_sources: ['task_instruction', 'chapter_goal', 'stage_body'],
  capacities: [
    { source: 'source_material', max_items: 12 },
    { source: 'narrative_memory', max_items: 16 },
    { source: 'foreshadow', max_items: 12 },
  ],
  min_relevance: 0.02,
  recent_body_chapter_limit: 0,
  recent_body_char_limit: 0,
  prior_summary_limit: 0,
}

const strategyByKind: Record<ContextTaskKind, ContextTaskStrategy> = {
  chapter_body: CHAPTER_BODY_STRATEGY,
  outline: OUTLINE_STRATEGY,
  summary: SUMMARY_STRATEGY,
  fact_check: FACT_CHECK_STRATEGY,
}

export function getContextTaskStrategy(taskKind: ContextTaskKind): ContextTaskStrategy {
  return strategyByKind[taskKind]
}

export function listContextTaskStrategies(): ContextTaskStrategy[] {
  return [
    CHAPTER_BODY_STRATEGY,
    OUTLINE_STRATEGY,
    SUMMARY_STRATEGY,
    FACT_CHECK_STRATEGY,
  ]
}
