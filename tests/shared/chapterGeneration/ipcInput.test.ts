import {
  parseChapterGenerationStartParams,
  parseChapterPolishStartParams,
} from '@/main/tasks/input'

describe('chapter generation IPC input validation', () => {
  const valid = {
    project_id: 'project-1',
    session_id: 'session-1',
    chapter_outline_id: 'outline-1',
    auto_confirm: false,
    llm: {
      baseUrl: 'https://example.invalid/v1',
      model: 'test-model',
    },
  }

  test('parses a valid typed request', () => {
    expect(parseChapterGenerationStartParams(valid)).toEqual({
      projectId: 'project-1',
      sessionId: 'session-1',
      chapterOutlineId: 'outline-1',
      chapterId: undefined,
      autoConfirm: false,
      llm: {
        baseUrl: 'https://example.invalid/v1',
        model: 'test-model',
        provider: undefined,
        credentialId: undefined,
        contextBudget: undefined,
        maxOutputTokens: undefined,
        temperature: undefined,
        streamingEnabled: undefined,
        maxRetries: undefined,
        retryDelayMs: undefined,
        maxRetryDelayMs: undefined,
        timeoutMs: undefined,
      },
    })
  })

  test.each([
    ['project_id', { ...valid, project_id: '' }],
    ['session_id', { ...valid, session_id: '' }],
    ['chapter_outline_id', { ...valid, chapter_outline_id: '' }],
    ['llm', { ...valid, llm: { model: 'missing base url' } }],
    ['llm.temperature', { ...valid, llm: { ...valid.llm, temperature: 'fast' } }],
    ['llm.streamingEnabled', { ...valid, llm: { ...valid.llm, streamingEnabled: 'yes' } }],
    ['auto_confirm', { ...valid, auto_confirm: 'yes' }],
    ['chapter_id', { ...valid, chapter_id: 3 }],
  ])('rejects invalid %s', (_field, input) => {
    expect(() => parseChapterGenerationStartParams(input)).toThrow()
  })

  test('parses a chapter polish request with paragraph mode', () => {
    expect(parseChapterPolishStartParams({
      project_id: 'project-1',
      session_id: 'session-1',
      chapter_id: 'chapter-1',
      mode: 'paragraph',
      block_id: 'block-1',
      instruction: 'Tighten the paragraph',
      auto_apply: false,
      llm: valid.llm,
    })).toEqual({
      projectId: 'project-1',
      sessionId: 'session-1',
      chapterId: 'chapter-1',
      mode: 'paragraph',
      blockId: 'block-1',
      instruction: 'Tighten the paragraph',
      sourceRevisionId: null,
      autoApply: false,
      llm: {
        baseUrl: 'https://example.invalid/v1',
        model: 'test-model',
        provider: undefined,
        credentialId: undefined,
        contextBudget: undefined,
        maxOutputTokens: undefined,
        temperature: undefined,
        streamingEnabled: undefined,
        maxRetries: undefined,
        retryDelayMs: undefined,
        maxRetryDelayMs: undefined,
        timeoutMs: undefined,
      },
    })
  })

  test('requires a block id for paragraph polish mode', () => {
    expect(() => parseChapterPolishStartParams({
      project_id: 'project-1',
      session_id: 'session-1',
      chapter_id: 'chapter-1',
      mode: 'paragraph',
      llm: valid.llm,
    })).toThrow('block_id')
  })
})
