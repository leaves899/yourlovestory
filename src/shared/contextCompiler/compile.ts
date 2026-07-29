import { assembleGatedCandidates } from './candidates'
import { ContextBudgetExceededError } from './errors'
import type {
  CompiledContext,
  ContextBudgetSummary,
  ContextCandidate,
  ContextCompilerInput,
  ContextCompileTrace,
  ContextDiscardReasonCode,
  ContextReason,
  ContextSelectReasonCode,
  ContextTraceItem,
  PromptMetadata,
} from './models'
import { compareCandidates } from './relevance'
import {
  estimateCandidatePromptTokens,
  estimateCandidatesJoinedTokens,
  serializeCandidates,
} from './serialize'
import { CONTEXT_PROMPT_VERSION, getContextTaskStrategy } from './strategies'
import { estimateTextTokens, TOKEN_ESTIMATION_METHOD, TOKEN_ESTIMATION_NOTE } from './tokenEstimate'

function resolveSystemReserved(input: ContextCompilerInput): number {
  if (input.budget.system_reserved_tokens != null) {
    return Math.max(0, input.budget.system_reserved_tokens)
  }
  if (input.budget.system_prompt != null) {
    return estimateTextTokens(input.budget.system_prompt)
  }
  return 0
}

function computeBudgetSummary(
  input: ContextCompilerInput,
  selectedTokens: number,
  discardedTokens: number,
): ContextBudgetSummary {
  const system_reserved = resolveSystemReserved(input)
  const max_output_reserved = Math.max(0, input.budget.max_output_tokens)
  const total_budget = Math.max(0, input.budget.total)
  const available_for_prompt = Math.max(0, total_budget - system_reserved - max_output_reserved)
  return {
    total_budget,
    system_reserved,
    max_output_reserved,
    available_for_prompt,
    selected_tokens: selectedTokens,
    discarded_tokens: discardedTokens,
    remaining_tokens: Math.max(0, available_for_prompt - selectedTokens),
    estimation_method: TOKEN_ESTIMATION_METHOD,
    estimation_note: TOKEN_ESTIMATION_NOTE,
  }
}

function toTraceItem(
  candidate: ContextCandidate,
  reason: ContextReason,
  estimated_tokens: number,
): ContextTraceItem {
  return {
    id: candidate.id,
    source: candidate.source,
    title: candidate.title,
    priority: candidate.priority,
    relevance_score: candidate.relevance_score,
    importance: candidate.importance,
    estimated_tokens,
    reason,
  }
}

function selectReasonFor(
  candidate: ContextCandidate,
  strategyRequired: ReadonlySet<string>,
): ContextSelectReasonCode {
  if (strategyRequired.has(candidate.source) || candidate.priority === 'required') {
    return 'required_by_strategy'
  }
  if (candidate.metadata.explicitly_selected === true) {
    return 'explicit_selection'
  }
  if (candidate.relevance_score >= 0.25) {
    return 'high_relevance'
  }
  if (candidate.priority === 'high') {
    return 'priority_slot'
  }
  return 'within_budget'
}

function reasonMessage(code: ContextSelectReasonCode | ContextDiscardReasonCode, detail?: string): string {
  const base: Record<ContextSelectReasonCode | ContextDiscardReasonCode, string> = {
    required_by_strategy: '策略必选来源',
    high_relevance: '高相关度入选',
    within_budget: '预算内可选入选',
    priority_slot: '优先级槽位入选',
    explicit_selection: '显式选中资料入选',
    below_relevance_threshold: '相关度低于阈值',
    budget_exhausted: '预算已耗尽',
    strategy_excluded: '策略排除该来源',
    duplicate: '重复候选',
    status_filtered: '状态过滤',
    capacity_limit: '来源容量上限',
  }
  return detail ? `${base[code]}：${detail}` : base[code]
}

function buildMetadata(input: ContextCompilerInput, strategyId: string): PromptMetadata {
  return {
    prompt_version: CONTEXT_PROMPT_VERSION,
    task_kind: input.task_kind,
    strategy_id: strategyId,
    model: input.model_params?.model ?? null,
    temperature: input.model_params?.temperature ?? null,
    max_output_tokens: input.model_params?.max_output_tokens ?? input.budget.max_output_tokens,
    context_budget: input.model_params?.context_budget ?? input.budget.total,
  }
}

function pushGatedDiscards(
  gatedDiscarded: readonly {
    candidate: ContextCandidate
    code: ContextDiscardReasonCode
    message: string
  }[],
  discardedTrace: ContextTraceItem[],
): void {
  for (const gate of gatedDiscarded) {
    discardedTrace.push(
      toTraceItem(
        gate.candidate,
        { code: gate.code, message: gate.message },
        estimateCandidatePromptTokens(gate.candidate),
      ),
    )
  }
}

/**
 * Compile a pure ContextCompilerInput into a prompt package + selection trace.
 * Throws ContextBudgetExceededError when required candidates cannot fit the hard budget.
 * Selection costs always include final serialization join separators.
 */
export function compileContext(input: ContextCompilerInput): CompiledContext {
  const strategy = getContextTaskStrategy(input.task_kind)
  const requiredSources = new Set(strategy.required_sources)
  const warnings: string[] = []
  const errors: string[] = []

  const { accepted, discarded: gatedDiscarded } = assembleGatedCandidates(input, strategy)

  for (const source of strategy.required_sources) {
    if (!accepted.some((item) => item.source === source)) {
      warnings.push(`策略必选来源缺失：${source}`)
    }
  }

  const ordered = [...accepted].sort(compareCandidates)
  const budgetPreview = computeBudgetSummary(input, 0, 0)
  const available = budgetPreview.available_for_prompt
  const metadata = buildMetadata(input, strategy.id)

  const requiredOrdered = ordered.filter(
    (item) => requiredSources.has(item.source) || item.priority === 'required',
  )
  const optionalOrdered = ordered.filter(
    (item) => !(requiredSources.has(item.source) || item.priority === 'required'),
  )

  const selected: ContextCandidate[] = []
  const selectedTrace: ContextTraceItem[] = []
  const discardedTrace: ContextTraceItem[] = []
  pushGatedDiscards(gatedDiscarded, discardedTrace)

  const requiredJoinedTokens = estimateCandidatesJoinedTokens(requiredOrdered)
  const requiredIds = requiredOrdered.map((item) => item.id)

  if (requiredJoinedTokens > available) {
    const errorMessage =
      `必选项序列化估算 ${requiredJoinedTokens} tokens 超过可用预算 ${available} tokens` +
      '（已计入 section 分隔符）'
    for (const item of requiredOrdered) {
      discardedTrace.push(
        toTraceItem(
          item,
          {
            code: 'budget_exhausted',
            message: reasonMessage(
              'budget_exhausted',
              `必选项合计 ${requiredJoinedTokens} > 可用 ${available}`,
            ),
          },
          estimateCandidatePromptTokens(item),
        ),
      )
    }
    for (const item of optionalOrdered) {
      discardedTrace.push(
        toTraceItem(
          item,
          {
            code: 'budget_exhausted',
            message: reasonMessage('budget_exhausted', '必选项已超预算，可选未装载'),
          },
          estimateCandidatePromptTokens(item),
        ),
      )
    }
    const discardedTokens = discardedTrace.reduce((sum, item) => sum + item.estimated_tokens, 0)
    const failureTrace: ContextCompileTrace = {
      task_kind: input.task_kind,
      selected: [],
      discarded: discardedTrace,
      budget: computeBudgetSummary(input, requiredJoinedTokens, discardedTokens),
      warnings: [...warnings],
      errors: [errorMessage],
      metadata,
      // Never attach final_prompt on budget failure by default.
    }
    throw new ContextBudgetExceededError(errorMessage, {
      requiredTokens: requiredJoinedTokens,
      availableTokens: available,
      requiredItemIds: requiredIds,
      failureTrace,
    })
  }

  for (const item of requiredOrdered) {
    selected.push(item)
    const code = selectReasonFor(item, requiredSources)
    selectedTrace.push(
      toTraceItem(item, { code, message: reasonMessage(code) }, estimateCandidatePromptTokens(item)),
    )
  }

  for (const item of optionalOrdered) {
    const nextJoined = estimateCandidatesJoinedTokens([...selected, item])
    if (nextJoined > available) {
      discardedTrace.push(
        toTraceItem(
          item,
          {
            code: 'budget_exhausted',
            message: reasonMessage(
              'budget_exhausted',
              `加入后序列化 ${nextJoined} > 可用 ${available}`,
            ),
          },
          estimateCandidatePromptTokens(item),
        ),
      )
      continue
    }
    selected.push(item)
    const code = selectReasonFor(item, requiredSources)
    selectedTrace.push(
      toTraceItem(item, { code, message: reasonMessage(code) }, estimateCandidatePromptTokens(item)),
    )
  }

  const structure = serializeCandidates(selected)
  if (structure.estimated_tokens > available) {
    // Hard invariant: selection used the same join estimator; this must never fire.
    throw new ContextCompilerInvariantError(
      `joined prompt tokens ${structure.estimated_tokens} exceeded available ${available}`,
    )
  }

  const discardedTokens = discardedTrace.reduce((sum, item) => sum + item.estimated_tokens, 0)
  const budget = computeBudgetSummary(input, structure.estimated_tokens, discardedTokens)
  if (budget.selected_tokens > budget.available_for_prompt) {
    throw new ContextCompilerInvariantError(
      `selected_tokens ${budget.selected_tokens} > available_for_prompt ${budget.available_for_prompt}`,
    )
  }

  const debug = input.debug === true
  const trace: ContextCompileTrace = {
    task_kind: input.task_kind,
    selected: selectedTrace,
    discarded: discardedTrace,
    budget,
    warnings: [...warnings],
    errors: [...errors],
    metadata,
    ...(debug ? { final_prompt: structure.joined_prompt } : {}),
  }

  return {
    task_kind: input.task_kind,
    prompt: structure.joined_prompt,
    selected: selectedTrace,
    discarded: discardedTrace,
    budget,
    warnings,
    errors,
    metadata,
    prompt_structure: debug ? structure : null,
    trace,
  }
}

class ContextCompilerInvariantError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'ContextCompilerInvariantError'
  }
}
