import {
  compileContext,
  ContextBudgetExceededError,
  compareCandidates,
  estimateCandidatesJoinedTokens,
  estimateTextTokens,
  formatSectionBody,
  getContextTaskStrategy,
  scoreRelevance,
  serializeCandidates,
  tokenizeForRelevance,
  CONTEXT_ESTIMATION_METHOD,
  type ContextCompilerInput,
  type ContextCandidate,
} from '@/shared/contextCompiler'

function baseInput(overrides: Partial<ContextCompilerInput> = {}): ContextCompilerInput {
  return {
    task_kind: 'chapter_body',
    project: {
      id: 'proj-1',
      name: '星港夜航',
      genre: '科幻',
      tone: '冷峻',
      target_words: 80_000,
      description: '边境港口与走私航线',
    },
    volume: {
      id: 'vol-1',
      title: '第一卷 雾港',
      synopsis: '雾港开端与航线争夺',
      volume_number: 1,
    },
    volume_outline: {
      id: 'vo-1',
      summary: '主角进入雾港并卷入航线争端',
      theme: '信任与背叛',
      main_conflict: '航线控制权',
      key_turning_points: ['初遇线人', '船仓对峙'],
      ending: '暂时夺回导航芯片',
    },
    chapter_outline: {
      id: 'co-1',
      chapter_number: 3,
      title: '夜潮',
      summary: '夜色中与线人交易导航芯片',
      purpose: '推进航线线索',
      opening: '雨夜码头',
      conflict: '买方突然变卦',
      key_events: ['接头', '交火', '撤退'],
      ending: '芯片到手但身份暴露',
      ending_hook: '追踪信号响起',
    },
    characters: [
      {
        id: 'char-1',
        name: '林澈',
        role: '主角',
        notes: '冷静',
        profile_text: '雾港走私船船长，擅长夜航',
      },
      {
        id: 'char-2',
        name: '阿雪',
        role: '线人',
        notes: '',
        profile_text: '码头情报贩子',
      },
    ],
    relations: [
      {
        id: 'rel-1',
        relation_type: '合作',
        description: '松散交易关系',
        source_label: '林澈',
        target_label: '阿雪',
        strength: 40,
      },
    ],
    worldview_entries: [
      {
        id: 'wv-1',
        category: '地理',
        title: '雾港',
        content: '边境自由贸易港，常年浓雾',
      },
    ],
    source_materials: [
      {
        id: 'sm-1',
        title: '芯片规格',
        material_type: '设定',
        content: '导航芯片可解锁第三航道',
        explicitly_selected: true,
      },
      {
        id: 'sm-2',
        title: '无关食谱',
        material_type: '杂记',
        content: '番茄炒蛋需要西红柿和鸡蛋',
        explicitly_selected: false,
      },
    ],
    prior_chapters: [
      {
        id: 'ch-1',
        chapter_number: 1,
        title: '靠港',
        synopsis: '林澈抵达雾港',
        content: '船慢慢靠上雾港旧码头，灯火稀薄。',
        status: 'adopted',
      },
      {
        id: 'ch-2',
        chapter_number: 2,
        title: '旧债',
        synopsis: '阿雪提出交易条件',
        content: '阿雪在雨棚下说出导航芯片的价格。',
        status: 'adopted',
      },
    ],
    narrative_memories: [
      {
        id: 'nm-1',
        memory_type: '事实',
        title: '芯片来源',
        content: '芯片来自失踪科考船',
        importance: 80,
        status: 'approved',
        evidence: ['科考船日志第3页', '港口海关登记'],
      },
      {
        id: 'nm-2',
        memory_type: '事实',
        title: '已归档旧事',
        content: '多年前的商会纷争',
        importance: 10,
        status: 'archived',
        evidence: ['不应出现的证据'],
      },
    ],
    foreshadows: [
      {
        id: 'fs-1',
        title: '追踪信号',
        description: '芯片内置追踪器将在交易后启动',
        status: 'active',
        importance: 75,
        evidence: ['交易后启动的监听记录'],
      },
    ],
    budget: {
      total: 8_000,
      max_output_tokens: 1_500,
      system_reserved_tokens: 200,
    },
    model_params: {
      model: 'test-model',
      temperature: 0.7,
      max_output_tokens: 1_500,
      context_budget: 8_000,
    },
    debug: false,
    ...overrides,
  }
}

describe('tokenEstimate', () => {
  test('空串为 0，非空至少 1；拉丁按 4 字节一 token', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens('a')).toBe(1)
    expect(estimateTextTokens('abcd')).toBe(1)
    expect(estimateTextTokens('abcde')).toBe(2)
  })

  test('中文按字计 token，显著高于旧 chars/4 低估', () => {
    const chinese = '导航芯片可解锁第三航道'
    // Old chars/4 would be ceil(11/4)=3; new method is 1 per CJK char.
    expect(estimateTextTokens(chinese)).toBe(chinese.length)
    expect(estimateTextTokens(chinese)).toBeGreaterThan(Math.ceil(chinese.length / 4))
    // Mixed: CJK + latin
    const mixed = '导航 chip-01'
    expect(estimateTextTokens(mixed)).toBeGreaterThan(estimateTextTokens('chip-01'))
  })

  test('多 section join 计入分隔符，joined 成本 ≥ 各 section 之和', () => {
    const a: ContextCandidate = {
      id: 'a',
      source: 'task_instruction',
      title: '一',
      content: '甲乙丙丁',
      priority: 'required',
      relevance_score: 1,
      importance: 1,
      metadata: {},
    }
    const b: ContextCandidate = {
      id: 'b',
      source: 'project_config',
      title: '二',
      content: '戊己庚辛',
      priority: 'required',
      relevance_score: 1,
      importance: 1,
      metadata: {},
    }
    const partSum =
      estimateTextTokens(formatSectionBody(a.title, a.source, a.content)) +
      estimateTextTokens(formatSectionBody(b.title, b.source, b.content))
    const joined = estimateCandidatesJoinedTokens([a, b])
    expect(joined).toBeGreaterThanOrEqual(partSum)
    expect(serializeCandidates([a, b]).estimated_tokens).toBe(joined)
  })
})

describe('relevance', () => {
  test('CJK bigram：连续中文句子共享子短语得正相关且可复现', () => {
    const focus = '夜色中与线人交易导航芯片'
    const content = '雾港码头的导航芯片交易已经开始'
    const tokens = tokenizeForRelevance(focus)
    expect(tokens.has('导航')).toBe(true)
    expect(tokens.has('航芯')).toBe(true)
    expect(tokens.has('芯片')).toBe(true)
    const score = scoreRelevance(tokens, content)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
    expect(scoreRelevance(tokens, content)).toBe(score)
    expect(scoreRelevance(tokens, '')).toBe(0)
    // Latin still works
    const en = tokenizeForRelevance('OpenAI model gpt')
    expect(en.has('openai') || en.has('model') || en.has('gpt')).toBe(true)
  })

  test('候选排序：priority > relevance > importance > id', () => {
    const a: Pick<ContextCandidate, 'priority' | 'relevance_score' | 'importance' | 'id'> = {
      priority: 'medium',
      relevance_score: 0.9,
      importance: 10,
      id: 'b',
    }
    const b = { ...a, priority: 'high' as const, id: 'a' }
    expect(compareCandidates(b, a)).toBeLessThan(0)
    const c = { ...a, relevance_score: 0.5, id: 'a' }
    expect(compareCandidates(a, c)).toBeLessThan(0)
  })
})

describe('strategies', () => {
  test('四种任务策略 id 与必选来源', () => {
    expect(getContextTaskStrategy('chapter_body').required_sources).toContain('chapter_goal')
    expect(getContextTaskStrategy('outline').task_kind).toBe('outline')
    expect(getContextTaskStrategy('summary').required_sources).toContain('stage_body')
    expect(getContextTaskStrategy('fact_check').required_sources).toContain('stage_body')
  })
})

describe('compileContext', () => {
  test('chapter_body 产出 prompt、selected/discarded trace 与预算', () => {
    const result = compileContext(baseInput())
    expect(result.task_kind).toBe('chapter_body')
    expect(result.prompt.length).toBeGreaterThan(0)
    expect(result.prompt).toContain('任务指令')
    expect(result.prompt).toContain('项目设定')
    expect(result.prompt).toContain('夜潮')
    expect(result.selected.length).toBeGreaterThan(0)
    expect(result.selected.every((item) => item.reason && item.estimated_tokens >= 0)).toBe(true)
    expect(result.budget.estimation_method).toBe(CONTEXT_ESTIMATION_METHOD)
    expect(result.budget.available_for_prompt).toBe(8_000 - 200 - 1_500)
    expect(result.budget.selected_tokens).toBeLessThanOrEqual(result.budget.available_for_prompt)
    expect(result.prompt_structure).toBeNull()
    expect(result.trace.final_prompt).toBeUndefined()
    expect(result.metadata.strategy_id).toBe('chapter_body/v1')
  })

  test('debug=true 时 prompt_structure 与 trace.final_prompt 出现', () => {
    const result = compileContext(baseInput({ debug: true }))
    expect(result.prompt_structure).not.toBeNull()
    expect(result.prompt_structure?.joined_prompt).toBe(result.prompt)
    expect(result.trace.final_prompt).toBe(result.prompt)
  })

  test('archived 叙事记忆进入 discarded 且 reason 为 status_filtered', () => {
    const result = compileContext(baseInput())
    const archived = result.discarded.find((item) => item.id === 'narrative_memory:nm-2')
    expect(archived).toBeDefined()
    expect(archived?.reason.code).toBe('status_filtered')
    expect(archived?.source).toBe('narrative_memory')
  })

  test('紧预算会丢弃可选项并记录 budget_exhausted；selected_tokens 不超可用', () => {
    let requiredJoined = 0
    try {
      compileContext(
        baseInput({
          budget: { total: 80, max_output_tokens: 50, system_reserved_tokens: 20 },
        }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetExceededError)
      requiredJoined = (error as ContextBudgetExceededError).requiredTokens
    }
    expect(requiredJoined).toBeGreaterThan(0)
    // Exactly enough for required join (+ tiny slack that still excludes large optionals).
    const available = requiredJoined + 3
    const total = available + 100 + 50
    const result = compileContext(
      baseInput({
        budget: {
          total,
          max_output_tokens: 100,
          system_reserved_tokens: 50,
        },
      }),
    )
    expect(result.selected.some((item) => item.source === 'task_instruction')).toBe(true)
    expect(result.budget.selected_tokens).toBeLessThanOrEqual(result.budget.available_for_prompt)
    expect(result.budget.selected_tokens).toBe(estimateTextTokens(result.prompt))
    const exhausted = result.discarded.filter((item) => item.reason.code === 'budget_exhausted')
    expect(exhausted.length).toBeGreaterThan(0)
  })

  test('必选项超预算抛 ContextBudgetExceededError 并携带完整 failureTrace', () => {
    expect(() =>
      compileContext(
        baseInput({
          budget: {
            total: 120,
            max_output_tokens: 80,
            system_reserved_tokens: 30,
          },
        }),
      ),
    ).toThrow(ContextBudgetExceededError)

    try {
      compileContext(
        baseInput({
          budget: {
            total: 120,
            max_output_tokens: 80,
            system_reserved_tokens: 30,
          },
        }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetExceededError)
      const budgetError = error as ContextBudgetExceededError
      expect(budgetError.requiredTokens).toBeGreaterThan(budgetError.availableTokens)
      expect(budgetError.requiredItemIds.length).toBeGreaterThan(0)
      expect(budgetError.failureTrace.errors.length).toBeGreaterThan(0)
      expect(budgetError.failureTrace.errors[0]).toContain('超过可用预算')
      expect(budgetError.failureTrace.metadata.strategy_id).toBe('chapter_body/v1')
      expect(budgetError.failureTrace.metadata.prompt_version).toBeTruthy()
      expect(budgetError.failureTrace.budget.available_for_prompt).toBe(budgetError.availableTokens)
      expect(budgetError.failureTrace.discarded.length).toBeGreaterThan(0)
      expect(budgetError.failureTrace.selected).toEqual([])
      expect(budgetError.failureTrace.final_prompt).toBeUndefined()
    }
  })

  test('成功编译的 selected_tokens 等于 joined prompt 估算且不超过 available', () => {
    const result = compileContext(baseInput())
    expect(result.budget.selected_tokens).toBe(estimateTextTokens(result.prompt))
    expect(result.budget.selected_tokens).toBeLessThanOrEqual(result.budget.available_for_prompt)
  })

  test('outline 策略不包含 recent_body / stage_body', () => {
    const result = compileContext(
      baseInput({
        task_kind: 'outline',
        stage: { body: '不应出现的正文' },
      }),
    )
    expect(result.metadata.strategy_id).toBe('outline/v1')
    expect(result.selected.every((item) => item.source !== 'recent_body')).toBe(true)
    expect(result.selected.every((item) => item.source !== 'stage_body')).toBe(true)
    expect(result.prompt).not.toContain('不应出现的正文')
  })

  test('summary 策略必选 stage_body', () => {
    const result = compileContext(
      baseInput({
        task_kind: 'summary',
        stage: {
          body: '林澈在雨夜完成芯片交易，追踪信号随即响起。',
        },
      }),
    )
    expect(result.selected.some((item) => item.source === 'stage_body')).toBe(true)
    expect(result.prompt).toContain('待处理正文')
  })

  test('fact_check 策略包含 stage_body 与 chapter_goal', () => {
    const result = compileContext(
      baseInput({
        task_kind: 'fact_check',
        stage: {
          body: '正文称阿雪交出两枚导航芯片。',
        },
      }),
    )
    expect(result.selected.some((item) => item.source === 'stage_body')).toBe(true)
    expect(result.selected.some((item) => item.source === 'chapter_goal')).toBe(true)
    expect(result.metadata.strategy_id).toBe('fact_check/v1')
  })

  test('fact_check 选中已批准记忆证据，未批准/归档记忆不进入 prompt', () => {
    const result = compileContext(
      baseInput({
        task_kind: 'fact_check',
        stage: {
          body: '正文提到导航芯片来自失踪科考船，并与港口海关登记一致。',
        },
        narrative_memories: [
          {
            id: 'nm-approved',
            memory_type: 'fact',
            title: '芯片来源',
            content: '芯片来自失踪科考船',
            importance: 90,
            status: 'approved',
            evidence: ['科考船日志第3页', '港口海关登记'],
          },
          {
            id: 'nm-proposed',
            memory_type: 'fact',
            title: '未批准记忆',
            content: '不应进入上下文的猜测',
            importance: 99,
            status: 'proposed',
            evidence: ['未批准证据串'],
          },
          {
            id: 'nm-archived',
            memory_type: 'fact',
            title: '已归档记忆',
            content: '归档内容',
            importance: 99,
            status: 'archived',
            evidence: ['归档证据串'],
          },
        ],
      }),
    )
    expect(result.prompt).toContain('科考船日志第3页')
    expect(result.prompt).toContain('港口海关登记')
    expect(result.prompt).toContain('证据：')
    expect(result.selected.some((item) => item.id === 'narrative_memory:nm-approved')).toBe(true)
    expect(result.prompt).not.toContain('未批准证据串')
    expect(result.prompt).not.toContain('不应进入上下文的猜测')
    expect(result.selected.every((item) => item.id !== 'narrative_memory:nm-proposed')).toBe(true)
    const archived = result.discarded.find((item) => item.id === 'narrative_memory:nm-archived')
    expect(archived?.reason.code).toBe('status_filtered')
  })

  test('同一输入两次编译结果确定性一致', () => {
    const input = baseInput({ debug: true })
    const a = compileContext(input)
    const b = compileContext(input)
    expect(a.prompt).toBe(b.prompt)
    expect(a.selected.map((item) => item.id)).toEqual(b.selected.map((item) => item.id))
    expect(a.discarded.map((item) => item.id)).toEqual(b.discarded.map((item) => item.id))
    expect(a.budget).toEqual(b.budget)
  })

  test('trace 项包含 source/reason/token 字段', () => {
    const result = compileContext(baseInput())
    for (const item of [...result.selected, ...result.discarded]) {
      expect(typeof item.source).toBe('string')
      expect(item.reason).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        }),
      )
      expect(typeof item.estimated_tokens).toBe('number')
    }
  })
})
