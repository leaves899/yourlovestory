import type {
  ContextCandidate,
  ContextCompilerInput,
  ContextPriority,
  ContextSourceKind,
  ContextTaskStrategy,
} from './models'
import { buildFocusText, scoreRelevance, tokenizeForRelevance } from './relevance'

function taskInstructionText(input: ContextCompilerInput): string {
  const extra = input.extra_instruction?.trim()
  const baseByKind: Record<ContextCompilerInput['task_kind'], string> = {
    chapter_body:
      '请根据给定项目设定、章节目标与相关上下文，续写或生成完整、连贯的本章正文。保持人物口吻与既有事实一致。',
    outline:
      '请根据给定项目设定与资料，生成结构清晰、可执行的大纲（卷纲或章纲），突出冲突、转折与收束。',
    summary:
      '请根据给定章节正文与目标，生成客观、精炼的章节摘要，覆盖关键事件、人物状态变化与未解线索。',
    fact_check:
      '请对照项目事实、资料与伏笔，核查给定正文中的一致性问题，列出矛盾、遗漏与需确认项。',
  }
  const base = baseByKind[input.task_kind]
  return extra ? `${base}\n\n附加指令：\n${extra}` : base
}

function projectConfigText(input: ContextCompilerInput): string {
  const p = input.project
  const lines = [
    `项目：${p.name}`,
    `类型：${p.genre}`,
    `基调：${p.tone}`,
    p.target_words != null ? `目标字数：${p.target_words}` : '',
    p.description?.trim() ? `简介：${p.description.trim()}` : '',
  ]
  return lines.filter((line) => line.length > 0).join('\n')
}

function volumeGoalText(input: ContextCompilerInput): string | null {
  const volume = input.volume
  if (!volume) return null
  const outline = input.volume_outline
  const lines = [
    `卷号：${volume.volume_number}`,
    `标题：${volume.title}`,
    volume.synopsis.trim() ? `卷简介：${volume.synopsis.trim()}` : '',
  ]
  if (outline) {
    lines.push(
      outline.summary.trim() ? `卷纲摘要：${outline.summary.trim()}` : '',
      outline.theme.trim() ? `主题：${outline.theme.trim()}` : '',
      outline.main_conflict.trim() ? `主冲突：${outline.main_conflict.trim()}` : '',
      outline.key_turning_points.length > 0
        ? `关键转折：${outline.key_turning_points.join('；')}`
        : '',
      outline.ending.trim() ? `卷末：${outline.ending.trim()}` : '',
    )
  }
  return lines.filter((line) => line.length > 0).join('\n')
}

function chapterGoalText(input: ContextCompilerInput): string | null {
  const ch = input.chapter_outline
  if (!ch) return null
  const lines = [
    `章号：${ch.chapter_number}`,
    `标题：${ch.title}`,
    ch.summary.trim() ? `摘要：${ch.summary.trim()}` : '',
    ch.purpose.trim() ? `目的：${ch.purpose.trim()}` : '',
    ch.opening.trim() ? `开场：${ch.opening.trim()}` : '',
    ch.conflict.trim() ? `冲突：${ch.conflict.trim()}` : '',
    ch.key_events.length > 0 ? `关键事件：${ch.key_events.join('；')}` : '',
    ch.ending.trim() ? `收束：${ch.ending.trim()}` : '',
    ch.ending_hook.trim() ? `章末钩子：${ch.ending_hook.trim()}` : '',
  ]
  return lines.filter((line) => line.length > 0).join('\n')
}

function candidate(
  id: string,
  source: ContextSourceKind,
  title: string,
  content: string,
  priority: ContextPriority,
  importance: number,
  metadata: ContextCandidate['metadata'] = {},
): ContextCandidate {
  return {
    id,
    source,
    title,
    content,
    priority,
    relevance_score: 0,
    importance,
    metadata,
  }
}

const INACTIVE_STATUSES = new Set(['archived', 'cancelled', 'resolved', 'closed', 'dropped'])

function isActiveStatus(status: string): boolean {
  return !INACTIVE_STATUSES.has(status.trim().toLowerCase())
}

/** Keep only non-empty string evidence lines (JSON-safe, no coercion). */
function sanitizeEvidenceLines(evidence: readonly string[] | undefined): string[] {
  if (!evidence || evidence.length === 0) return []
  return evidence
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * Build unscored candidates from a pure input snapshot.
 * Does not filter by strategy; caller applies strategy gates.
 */
export function buildContextCandidates(input: ContextCompilerInput): ContextCandidate[] {
  const out: ContextCandidate[] = []

  out.push(
    candidate(
      'task_instruction:main',
      'task_instruction',
      '任务指令',
      taskInstructionText(input),
      'required',
      1_000,
    ),
  )

  out.push(
    candidate(
      `project_config:${input.project.id}`,
      'project_config',
      '项目设定',
      projectConfigText(input),
      'required',
      900,
    ),
  )

  const volumeText = volumeGoalText(input)
  if (volumeText && input.volume) {
    out.push(
      candidate(
        `volume_goal:${input.volume.id}`,
        'volume_goal',
        `卷目标：${input.volume.title}`,
        volumeText,
        'high',
        800 + input.volume.volume_number,
      ),
    )
  }

  const chapterText = chapterGoalText(input)
  if (chapterText && input.chapter_outline) {
    out.push(
      candidate(
        `chapter_goal:${input.chapter_outline.id}`,
        'chapter_goal',
        `章目标：${input.chapter_outline.title}`,
        chapterText,
        'required',
        850 + input.chapter_outline.chapter_number,
      ),
    )
  }

  for (const character of input.characters ?? []) {
    const content = [
      `角色：${character.name}`,
      `定位：${character.role}`,
      character.profile_text.trim(),
      character.notes.trim() ? `备注：${character.notes.trim()}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n')
    out.push(
      candidate(
        `character:${character.id}`,
        'character',
        character.name,
        content,
        'high',
        500,
        { role: character.role },
      ),
    )
  }

  for (const relation of input.relations ?? []) {
    const content = [
      `${relation.source_label} → ${relation.target_label}`,
      `关系类型：${relation.relation_type}`,
      relation.description.trim(),
      relation.strength != null ? `强度：${relation.strength}` : '',
    ]
      .filter((line) => line.length > 0)
      .join('\n')
    out.push(
      candidate(
        `relation:${relation.id}`,
        'relation',
        `${relation.source_label}/${relation.target_label}`,
        content,
        'medium',
        relation.strength ?? 200,
      ),
    )
  }

  for (const entry of input.worldview_entries ?? []) {
    out.push(
      candidate(
        `worldview:${entry.id}`,
        'worldview',
        entry.title,
        `分类：${entry.category}\n${entry.content}`,
        'medium',
        300,
        { category: entry.category },
      ),
    )
  }

  for (const material of input.source_materials ?? []) {
    out.push(
      candidate(
        `source_material:${material.id}`,
        'source_material',
        material.title,
        `类型：${material.material_type}\n${material.content}`,
        material.explicitly_selected ? 'high' : 'medium',
        material.explicitly_selected ? 700 : 250,
        {
          material_type: material.material_type,
          explicitly_selected: material.explicitly_selected,
        },
      ),
    )
  }

  const priorChapters = [...(input.prior_chapters ?? [])].sort(
    (a, b) => b.chapter_number - a.chapter_number,
  )

  for (const chapter of priorChapters) {
    const synopsis = chapter.synopsis.trim() || chapter.content.trim().slice(0, 800)
    if (synopsis.length === 0) continue
    out.push(
      candidate(
        `prior_chapter_summary:${chapter.id}`,
        'prior_chapter_summary',
        `前章摘要 #${chapter.chapter_number} ${chapter.title}`,
        synopsis,
        'medium',
        400 + chapter.chapter_number,
        { chapter_number: chapter.chapter_number, status: chapter.status },
      ),
    )
  }

  for (const memory of input.narrative_memories ?? []) {
    const evidenceLines = sanitizeEvidenceLines(memory.evidence)
    const evidenceBlock =
      evidenceLines.length > 0 ? `\n证据：${evidenceLines.join('；')}` : ''
    // Only approved narrative memories may enter context (proposed/rejected/archived out).
    const memoryApproved = memory.status.trim().toLowerCase() === 'approved'
    if (!memoryApproved) {
      out.push(
        candidate(
          `narrative_memory:${memory.id}`,
          'narrative_memory',
          memory.title,
          `${memory.content}${evidenceBlock}`,
          'low',
          memory.importance,
          {
            memory_type: memory.memory_type,
            status: memory.status,
            _status_inactive: true,
            evidence: evidenceLines,
          },
        ),
      )
      continue
    }
    out.push(
      candidate(
        `narrative_memory:${memory.id}`,
        'narrative_memory',
        memory.title,
        `类型：${memory.memory_type}\n${memory.content}${evidenceBlock}`,
        memory.importance >= 70 ? 'high' : 'medium',
        memory.importance,
        {
          memory_type: memory.memory_type,
          status: memory.status,
          evidence: evidenceLines,
        },
      ),
    )
  }

  for (const foreshadow of input.foreshadows ?? []) {
    const evidenceLines = sanitizeEvidenceLines(foreshadow.evidence)
    const evidenceBlock =
      evidenceLines.length > 0 ? `\n证据：${evidenceLines.join('；')}` : ''
    if (!isActiveStatus(foreshadow.status)) {
      out.push(
        candidate(
          `foreshadow:${foreshadow.id}`,
          'foreshadow',
          foreshadow.title,
          `${foreshadow.description}${evidenceBlock}`,
          'low',
          foreshadow.importance,
          { status: foreshadow.status, _status_inactive: true, evidence: evidenceLines },
        ),
      )
      continue
    }
    out.push(
      candidate(
        `foreshadow:${foreshadow.id}`,
        'foreshadow',
        foreshadow.title,
        `${foreshadow.description}${evidenceBlock}`,
        foreshadow.importance >= 70 ? 'high' : 'medium',
        foreshadow.importance,
        { status: foreshadow.status, evidence: evidenceLines },
      ),
    )
  }

  const body = input.stage?.body?.trim()
  if (body) {
    out.push(
      candidate('stage_body:main', 'stage_body', '待处理正文', body, 'required', 950, {
        char_length: body.length,
      }),
    )
  }

  const existing = input.stage?.existing_text?.trim()
  if (existing) {
    out.push(
      candidate('continuation:main', 'continuation', '已生成续写片段', existing, 'high', 750, {
        char_length: existing.length,
      }),
    )
  }

  return out
}

export function scoreCandidates(
  input: ContextCompilerInput,
  candidates: readonly ContextCandidate[],
): ContextCandidate[] {
  const focusTokens = tokenizeFocus(input)
  return candidates.map((item) => ({
    ...item,
    relevance_score: scoreRelevance(focusTokens, `${item.title}\n${item.content}`),
  }))
}

function tokenizeFocus(input: ContextCompilerInput): Set<string> {
  return tokenizeForRelevance(buildFocusText(input))
}

/** Apply strategy allow-list, status filter, capacity, and min relevance. */
export function gateCandidates(
  candidates: readonly ContextCandidate[],
  strategy: ContextTaskStrategy,
): {
  accepted: ContextCandidate[]
  discarded: Array<{
    candidate: ContextCandidate
    code:
      | 'strategy_excluded'
      | 'status_filtered'
      | 'capacity_limit'
      | 'below_relevance_threshold'
      | 'duplicate'
    message: string
  }>
} {
  const allowed = new Set<ContextSourceKind>(strategy.allowed_sources)
  const required = new Set<ContextSourceKind>(strategy.required_sources)
  const capacityBySource = new Map(
    strategy.capacities.map((cap) => [cap.source, cap.max_items] as const),
  )

  const discarded: Array<{
    candidate: ContextCandidate
    code:
      | 'strategy_excluded'
      | 'status_filtered'
      | 'capacity_limit'
      | 'below_relevance_threshold'
      | 'duplicate'
    message: string
  }> = []

  const afterAllow: ContextCandidate[] = []
  const seenIds = new Set<string>()

  for (const item of candidates) {
    if (seenIds.has(item.id)) {
      discarded.push({
        candidate: item,
        code: 'duplicate',
        message: `重复候选已丢弃：${item.id}`,
      })
      continue
    }
    seenIds.add(item.id)

    if (!allowed.has(item.source)) {
      discarded.push({
        candidate: item,
        code: 'strategy_excluded',
        message: `策略 ${strategy.id} 不允许来源 ${item.source}`,
      })
      continue
    }

    if (item.metadata._status_inactive === true) {
      discarded.push({
        candidate: item,
        code: 'status_filtered',
        message: `状态过滤：${String(item.metadata.status ?? 'inactive')}`,
      })
      continue
    }

    afterAllow.push(item)
  }

  // recent_body special handling is applied in buildRecentBodyCandidates + merge
  const bySource = new Map<ContextSourceKind, ContextCandidate[]>()
  for (const item of afterAllow) {
    const list = bySource.get(item.source) ?? []
    list.push(item)
    bySource.set(item.source, list)
  }

  const accepted: ContextCandidate[] = []

  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) return b.relevance_score - a.relevance_score
      if (b.importance !== a.importance) return b.importance - a.importance
      return a.id.localeCompare(b.id)
    })

    const maxItems = capacityBySource.get(source) ?? null
    let kept = sorted
    if (maxItems != null && sorted.length > maxItems) {
      kept = sorted.slice(0, maxItems)
      for (const drop of sorted.slice(maxItems)) {
        discarded.push({
          candidate: drop,
          code: 'capacity_limit',
          message: `来源 ${source} 超过容量上限 ${maxItems}`,
        })
      }
    }

    for (const item of kept) {
      const isRequired = required.has(item.source) || item.priority === 'required'
      const explicitlySelected = item.metadata.explicitly_selected === true
      if (!isRequired && !explicitlySelected && item.relevance_score < strategy.min_relevance) {
        discarded.push({
          candidate: item,
          code: 'below_relevance_threshold',
          message: `相关度 ${item.relevance_score.toFixed(4)} 低于阈值 ${strategy.min_relevance}`,
        })
        continue
      }
      accepted.push(item)
    }
  }

  return { accepted, discarded }
}

/**
 * Inject recent_body candidates from prior chapter bodies using strategy limits.
 */
export function buildRecentBodyCandidates(
  input: ContextCompilerInput,
  strategy: ContextTaskStrategy,
): ContextCandidate[] {
  if (strategy.recent_body_chapter_limit <= 0) return []
  if (!strategy.allowed_sources.includes('recent_body')) return []

  const prior = [...(input.prior_chapters ?? [])]
    .filter((chapter) => chapter.content.trim().length > 0)
    .sort((a, b) => b.chapter_number - a.chapter_number)
    .slice(0, strategy.recent_body_chapter_limit)

  return prior.map((chapter) => {
    const truncated =
      strategy.recent_body_char_limit > 0
        ? chapter.content.slice(-strategy.recent_body_char_limit)
        : chapter.content
    return candidate(
      `recent_body:${chapter.id}`,
      'recent_body',
      `近章正文 #${chapter.chapter_number} ${chapter.title}`,
      truncated,
      'high',
      600 + chapter.chapter_number,
      {
        chapter_number: chapter.chapter_number,
        truncated: truncated.length < chapter.content.length,
      },
    )
  })
}

export function assembleGatedCandidates(input: ContextCompilerInput, strategy: ContextTaskStrategy) {
  const base = buildContextCandidates(input)
  const recent = buildRecentBodyCandidates(input, strategy)
  const scored = scoreCandidates(input, [...base, ...recent])

  // Cap prior summaries by strategy.prior_summary_limit before general capacity
  const priorSummaries = scored
    .filter((item) => item.source === 'prior_chapter_summary')
    .sort((a, b) => {
      const aNum = Number(a.metadata.chapter_number ?? 0)
      const bNum = Number(b.metadata.chapter_number ?? 0)
      return bNum - aNum
    })
  const priorKeepIds = new Set(
    priorSummaries.slice(0, strategy.prior_summary_limit).map((item) => item.id),
  )
  const withPriorCap = scored.map((item) => {
    if (item.source !== 'prior_chapter_summary') return item
    if (strategy.prior_summary_limit <= 0) return item
    if (priorKeepIds.has(item.id)) return item
    return {
      ...item,
      metadata: { ...item.metadata, _over_prior_limit: true },
    }
  })

  const preDiscarded: Array<{
    candidate: ContextCandidate
    code: 'capacity_limit'
    message: string
  }> = []
  const preFiltered = withPriorCap.filter((item) => {
    if (item.metadata._over_prior_limit === true) {
      preDiscarded.push({
        candidate: item,
        code: 'capacity_limit',
        message: `前章摘要超过 prior_summary_limit=${strategy.prior_summary_limit}`,
      })
      return false
    }
    return true
  })

  const gated = gateCandidates(preFiltered, strategy)
  return {
    accepted: gated.accepted,
    discarded: [...preDiscarded, ...gated.discarded],
  }
}
