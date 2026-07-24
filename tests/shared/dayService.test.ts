import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as aiClient from '@/shared/ai/aiClient'
import * as relationshipManager from '@/shared/relationship/manager'
import { updateSettings } from '@/shared/persistence/settingsStore'
import {
  deleteDay,
  generateDay,
  getDay,
  listDays,
  runPipeline,
  updateDay,
} from '@/shared/day/dayService'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-day-'))
  fs.mkdirSync(path.join(tmpRoot, 'crushes'), { recursive: true })
})

afterEach(() => {
  jest.restoreAllMocks()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function setupCrushWithDay(
  slug: string,
  dayNumber: number,
  content: string = '# Day 1\n\nToday we met for the first time.'
): string {
  const chatsDir = path.join(tmpRoot, 'crushes', slug, 'memories', 'chats')
  fs.mkdirSync(chatsDir, { recursive: true })
  const dayFile = path.join(chatsDir, `day${dayNumber}.md`)
  fs.writeFileSync(dayFile, content, 'utf-8')
  return dayFile
}

function setupCrushForGeneration(slug: string): void {
  const crushDir = path.join(tmpRoot, 'crushes', slug)
  fs.mkdirSync(crushDir, { recursive: true })
  fs.writeFileSync(path.join(crushDir, 'persona.md'), '# test\n', 'utf-8')
  updateSettings(tmpRoot, {
    credentialId: 'llm:app-default',
    provider: 'anthropic',
    model: 'test-model',
  })
}

const credentialResolver = {
  getCredential: async () => 'sk-test-secret-do-not-expose-123456',
}

describe('runPipeline', () => {
  test('returns an actionable error when a secure credential resolver is unavailable', async () => {
    const result = await runPipeline(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('安全保存')
  })

  test('dry_run returns prompts without generating content', async () => {
    const personFile = path.join(tmpRoot, 'crushes', 'test', 'persona.md')
    fs.mkdirSync(path.dirname(personFile), { recursive: true })
    fs.writeFileSync(personFile, '# Test Persona\n\n测试角色。\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: 'dry run 测试',
      dry_run: true,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    if ('system_prompt' in result.data) {
      expect(result.data.system_prompt).toBeTruthy()
      expect(result.data.user_prompt).toBeTruthy()
      expect(result.data.user_prompt).toContain('dry run 测试')
    } else {
      throw new Error('expected dry_run preview data')
    }
  })

  test('intimate fields are rejected while the crush switch is disabled', async () => {
    const crushDir = path.join(tmpRoot, 'crushes', 'test')
    fs.mkdirSync(crushDir, { recursive: true })
    fs.writeFileSync(path.join(crushDir, 'persona.md'), '# Test Persona\n', 'utf-8')
    fs.writeFileSync(path.join(crushDir, '.intimate_config'), 'intimate=false\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      sex_count: 1,
      dry_run: true,
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('disabled')
  })
})

describe('listDays', () => {
  test('returns empty list when chats directory does not exist', () => {
    fs.mkdirSync(path.join(tmpRoot, 'crushes', 'empty'), { recursive: true })
    const result = listDays(tmpRoot, { slug: 'empty' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  test('returns empty list when chats directory exists without day files', () => {
    const chatsDir = path.join(tmpRoot, 'crushes', 'empty2', 'memories', 'chats')
    fs.mkdirSync(chatsDir, { recursive: true })
    const result = listDays(tmpRoot, { slug: 'empty2' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  test('sorts day files by day_number', () => {
    setupCrushWithDay('test', 3, 'day3 content')
    setupCrushWithDay('test', 1, 'day1 content')
    setupCrushWithDay('test', 2, 'day2 content')

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.total).toBe(3)
    expect(result.data[0].day_number).toBe(1)
    expect(result.data[1].day_number).toBe(2)
    expect(result.data[2].day_number).toBe(3)
  })

  test('truncates content to 200 characters', () => {
    setupCrushWithDay('test', 1, 'x'.repeat(500))

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0].content).toBe('x'.repeat(200))
  })

  test('supports pagination', () => {
    for (let i = 1; i <= 5; i += 1) {
      setupCrushWithDay('test', i, `day${i}`)
    }

    const page1 = listDays(tmpRoot, { slug: 'test', page: 1, page_size: 2 })
    expect(page1.success).toBe(true)
    if (!page1.success) return
    expect(page1.data.length).toBe(2)
    expect(page1.data[0].day_number).toBe(1)
    expect(page1.data[1].day_number).toBe(2)
    expect(page1.total).toBe(5)

    const page3 = listDays(tmpRoot, { slug: 'test', page: 3, page_size: 2 })
    expect(page3.success).toBe(true)
    if (!page3.success) return
    expect(page3.data.length).toBe(1)
    expect(page3.data[0].day_number).toBe(5)
  })

  test('uses default page and page_size', () => {
    setupCrushWithDay('test', 1)

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.length).toBe(1)
  })
})

describe('getDay', () => {
  test('returns an existing day', () => {
    setupCrushWithDay('test', 1, '# Day 1\n\nToday we met.')

    const result = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.content).toContain('Day 1')
    expect(result.data.content).toContain('Today we met')
    expect(result.data.slug).toBe('test')
    expect(result.data.day_number).toBe(1)
    expect(result.data.file_path).toContain('day1.md')
  })

  test('returns error for missing day file', () => {
    setupCrushWithDay('test', 1)

    const result = getDay(tmpRoot, { slug: 'test', day_number: 999 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('Day file not found')
  })

  test('returns error for missing slug directory', () => {
    const result = getDay(tmpRoot, { slug: 'nonexistent', day_number: 1 })
    expect(result.success).toBe(false)
  })
})

describe('updateDay', () => {
  test('updates an existing day file', () => {
    setupCrushWithDay('test', 1, 'original')

    const result = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      content: '# Day 1\n\nUpdated content',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.content).toBe('# Day 1\n\nUpdated content')

    const dayFile = path.join(tmpRoot, 'crushes', 'test', 'memories', 'chats', 'day1.md')
    expect(fs.readFileSync(dayFile, 'utf-8')).toBe('# Day 1\n\nUpdated content')
  })

  test('returns error when updating a missing day file', () => {
    const result = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 999,
      content: 'new',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('Day file not found')
  })
})

describe('deleteDay', () => {
  test('deletes an existing day file', () => {
    const dayFile = setupCrushWithDay('test', 1, 'content')

    const result = deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.slug).toBe('test')
    expect(result.data.day_number).toBe(1)
    expect(fs.existsSync(dayFile)).toBe(false)
  })

  test('getDay fails after delete', () => {
    setupCrushWithDay('test', 1, 'content')

    deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    const getResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(getResult.success).toBe(false)
  })

  test('returns error when deleting a missing day file', () => {
    const result = deleteDay(tmpRoot, { slug: 'test', day_number: 999 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('Day file not found')
  })
})

describe('generateDay', () => {
  test('allows overwriting an existing day file', async () => {
    setupCrushWithDay('test', 1, '# Day 1\n\nOld content')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: 'New summary',
    })

    if (!result.success) {
      expect(result.errors[0]).not.toContain('已存在')
    }
  })

  test('requires a secure credential resolver for a new day', async () => {
    const crushDir = path.join(tmpRoot, 'crushes', 'test')
    fs.mkdirSync(crushDir, { recursive: true })
    fs.writeFileSync(path.join(crushDir, 'persona.md'), '# test\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: '测试',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('安全保存')
  })

  test('updates relationship after the day file is written and returns relationship data', async () => {
    setupCrushForGeneration('test')
    const narrative = '今天我们聊天了，知道了她的名字，还加了微信。'
    const progressFile = path.join(tmpRoot, 'crushes', 'test', 'progress.json')
    const expectedRelationship = {
      signals: [
        {
          type: 'has_dialogue',
          description: '有对话',
          score: 20,
          detected_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      shouldTransition: true,
      transitionMessage: '关系可以推进',
      progress: {
        crush_slug: 'test',
        current_phase: 0 as const,
        phase_name: '陌生人',
        total_narratives: 1,
        interaction_narratives: 1,
        flirting_signals: 0,
        accumulated_score: 60,
        threshold: 60,
        signals: [],
        phase_history: [
          {
            phase: 0 as const,
            phase_name: '陌生人',
            started_at: '2026-01-01T00:00:00.000Z',
            narrative_count: 1,
          },
        ],
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    }

    jest.spyOn(aiClient, 'generateNarrative').mockResolvedValue(narrative)
    const handleNarrativeCompleteSpy = jest
      .spyOn(relationshipManager, 'handleNarrativeComplete')
      .mockImplementation((projectRoot, slug, narrativeText) => {
        const dayFile = path.join(projectRoot, 'crushes', slug, 'memories', 'chats', 'day1.md')
        expect(narrativeText).toBe(narrative)
        expect(fs.existsSync(dayFile)).toBe(true)
        expect(fs.readFileSync(dayFile, 'utf-8')).toBe(narrative)
        expect(fs.existsSync(progressFile)).toBe(false)
        return expectedRelationship
      })

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: '测试摘要',
    }, credentialResolver)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(handleNarrativeCompleteSpy).toHaveBeenCalledWith(tmpRoot, 'test', narrative)
    expect(result.warnings).toBeUndefined()
    if ('content' in result.data) {
      expect(result.data.content).toBe(narrative)
      expect(result.data.relationship).toEqual(expectedRelationship)
    } else {
      throw new Error('expected generated day data')
    }
  })

  test('keeps day generation successful when relationship update fails', async () => {
    setupCrushForGeneration('test')
    const narrative = '今天我们聊天了，知道了她的名字，还加了微信。'

    jest.spyOn(aiClient, 'generateNarrative').mockResolvedValue(narrative)
    jest.spyOn(relationshipManager, 'handleNarrativeComplete').mockImplementation(() => {
      throw new Error('disk full')
    })

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: '测试摘要',
    }, credentialResolver)

    const dayFile = path.join(tmpRoot, 'crushes', 'test', 'memories', 'chats', 'day1.md')

    expect(result.success).toBe(true)
    expect(fs.existsSync(dayFile)).toBe(true)
    expect(fs.readFileSync(dayFile, 'utf-8')).toBe(narrative)
    if (!result.success) return
    expect(result.warnings?.[0]).toContain('关系进度更新失败')
    expect(result.warnings?.[0]).toContain('disk full')
    if ('content' in result.data) {
      expect(result.data.relationship).toBeUndefined()
    } else {
      throw new Error('expected generated day data')
    }
  })

  test('dry_run does not trigger relationship update', async () => {
    const crushDir = path.join(tmpRoot, 'crushes', 'test')
    fs.mkdirSync(crushDir, { recursive: true })
    fs.writeFileSync(path.join(crushDir, 'persona.md'), '# test\n', 'utf-8')

    const handleNarrativeCompleteSpy = jest.spyOn(
      relationshipManager,
      'handleNarrativeComplete'
    )

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      dry_run: true,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.summary).toBe('')
    if ('system_prompt' in result.data) {
      expect(result.data.system_prompt).toBeTruthy()
      expect(result.data.user_prompt).toBeTruthy()
    } else {
      throw new Error('expected dry_run preview data')
    }
    expect(handleNarrativeCompleteSpy).not.toHaveBeenCalled()
  })
})

describe('day workflow', () => {
  test('rejects traversal slugs and forged day numbers', () => {
    expect(getDay(tmpRoot, { slug: '..', day_number: 1 }).success).toBe(false)
    expect(getDay(tmpRoot, { slug: 'test', day_number: 0 }).success).toBe(false)
    expect(getDay(tmpRoot, { slug: 'test', day_number: 1.5 }).success).toBe(false)
  })

  test('list -> get -> update -> verify -> delete -> verify', () => {
    setupCrushWithDay('test', 1, '# Day 1\n\nToday we met for the first time.')

    const listResult = listDays(tmpRoot, { slug: 'test' })
    expect(listResult.success).toBe(true)
    if (!listResult.success) return
    expect(listResult.data.length).toBeGreaterThanOrEqual(1)

    const getResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(getResult.success).toBe(true)
    if (!getResult.success) return
    expect(getResult.data.content).toContain('Day 1')

    const updateResult = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      content: '# Day 1\n\nUpdated content',
    })
    expect(updateResult.success).toBe(true)

    const verifyResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success) return
    expect(verifyResult.data.content).toBe('# Day 1\n\nUpdated content')

    const deleteResult = deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(deleteResult.success).toBe(true)

    const deletedResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(deletedResult.success).toBe(false)
  })
})
