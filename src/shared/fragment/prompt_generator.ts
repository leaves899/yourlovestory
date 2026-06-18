/**
 * 碎片 Prompt 生成器（TS 等价实现，取代 src/scripts/fragment/prompt_generator.py）。
 *
 * 完整 Prompt 矩阵（3来源 × 4情绪 + 跳过 = 13种组合）
 */
import {
  DIRECTION_PROMPTS,
  DIRECTION_MOOD_MAP,
  THEME_PROMPTS,
  MOOD_MODIFIERS,
  type Fragment,
} from './models'

// ============================================================
// Prompt 矩阵
// ============================================================

const PROMPT_MATRIX: Record<string, Record<string, string>> = {
  user: {
    positive: '记录一下，今天我给ta发了什么',
    negative: '今天我给ta发了什么，让ta在意了？',
    neutral: '今天我给ta发了什么？',
    mixed: '今天我给ta发了什么，心情复杂',
    __skip__: '记录一下，今天我给ta发了什么',
  },
  crush: {
    positive: 'ta今天说了什么让你开心的话？',
    negative: 'ta今天说了什么让你在意的话？',
    neutral: 'ta今天说了什么？',
    mixed: 'ta今天说了什么，心情复杂',
    __skip__: 'ta今天说了什么？',
  },
  ambient: {
    positive: '在【环境】时，看到ta的【行为】，感到开心',
    negative: '在【环境】时，看到ta的【行为】，感到在意',
    neutral: '在【环境】时，看到ta的【行为】',
    mixed: '在【环境】时，看到ta的【行为】，心情复杂',
    __skip__: '在【环境】时，看到ta的【行为】',
  },
}

const CONNECTORS = ['，然后', '，接着', '，同时', '，另外']
const MAX_TOTAL_LENGTH = 1000

// ============================================================
// 单碎片 Prompt
// ============================================================

function getBasePrompt(origin: string, mood: string | null): string {
  const originMap = PROMPT_MATRIX[origin]
  if (!originMap) return ''
  const moodKey = mood ?? '__skip__'
  return originMap[moodKey] ?? ''
}

export function generateSingleFragmentPrompt(
  fragment: Fragment,
  direction?: string | null
): string {
  const mode = fragment.writing_mode

  if (mode === 'guided' && direction) {
    let prompt = DIRECTION_PROMPTS[direction] ?? ''
    if (fragment.mood) {
      prompt += `，${MOOD_MODIFIERS[fragment.mood]}`
    }
    return prompt
  }

  if (mode === 'themed' && fragment.theme) {
    const themePrompt = THEME_PROMPTS[fragment.theme] ?? ''
    const base = getBasePrompt(fragment.origin, fragment.mood)
    return `${themePrompt}。${base}`
  }

  if (mode === 'blind') {
    const base = getBasePrompt(fragment.origin, fragment.mood)
    return `${base}（盲写模式，隐藏对话历史）`
  }

  // raw（默认）
  return getBasePrompt(fragment.origin, fragment.mood)
}

// ============================================================
// 多碎片 Prompt
// ============================================================

export function generateMultiFragmentPrompt(
  fragments: Fragment[],
  direction?: string | null
): string {
  if (fragments.length === 0) return ''

  if (fragments.length === 1) {
    return generateSingleFragmentPrompt(fragments[0], direction)
  }

  const origins = mergeOrigins(fragments)
  const mood = mergeMoods(fragments)
  const content = concatContents(fragments)

  let prompt: string
  if (direction && DIRECTION_PROMPTS[direction]) {
    prompt = DIRECTION_PROMPTS[direction]
    if (mood) {
      prompt += `，${MOOD_MODIFIERS[mood]}`
    }
  } else {
    const originPrompts = origins.map((o) => getBasePrompt(o, mood))
    prompt = originPrompts.join(' + ')
  }

  if (content) {
    prompt += `\n\n${content}`
  }

  return prompt
}

// ============================================================
// 合并/拼接辅助函数
// ============================================================

export function mergeOrigins(fragments: Fragment[]): string[] {
  const seen = new Set<string>()
  const origins: string[] = []
  for (const f of fragments) {
    if (!seen.has(f.origin)) {
      seen.add(f.origin)
      origins.push(f.origin)
    }
  }
  return origins
}

export function mergeMoods(fragments: Fragment[]): string | null {
  const moods = fragments.filter((f) => f.mood !== null).map((f) => f.mood as string)

  if (moods.length === 0) return null
  if (moods.length === 1) return moods[0]

  const unique = new Set(moods)
  if (unique.size === 1) return moods[0]
  return 'mixed'
}

export function concatContents(fragments: Fragment[]): string {
  const contents = fragments.filter((f) => f.content && f.content.trim().length > 0)

  if (contents.length === 0) return ''
  if (contents.length === 1) return contents[0].content

  let result = contents[0].content
  for (let i = 1; i < contents.length; i++) {
    const connector = CONNECTORS[(i - 1) % CONNECTORS.length]
    result += `${connector}${contents[i].content}`
  }

  if (result.length > MAX_TOTAL_LENGTH) {
    result = result.slice(0, MAX_TOTAL_LENGTH - 3) + '...'
  }

  return result
}
