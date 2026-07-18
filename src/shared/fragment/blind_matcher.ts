/**
 * Blind 模式匹配器。
 *
 * 降级路径：直接实现字符级 Jaccard（不引入 JS 语义模型）。
 * 关键词匹配 30% + 语义相似度（字符 Jaccard）70%。
 */
import * as fs from 'fs'
import * as path from 'path'

const KEYWORD_WEIGHT = 0.3
const SEMANTIC_WEIGHT = 0.7
const DEFAULT_THRESHOLD = 0.6
const MIN_THRESHOLD = 0.5
const MAX_THRESHOLD = 0.8

interface Candidate {
  content: string
  source: string
}

interface MatchResult {
  content: string
  score: number
  source: string
}

interface Persona {
  crush_replies: string[]
  personality: string[]
  behavior_patterns: string[]
}

export class BlindMatcher {
  crushSlug: string
  projectRoot: string | null
  persona: Persona

  constructor(crushSlug: string, projectRoot?: string | null) {
    this.crushSlug = crushSlug
    this.projectRoot = projectRoot ?? null
    this.persona = this.loadPersona()
  }

  matchReplies(
    userInput: string,
    limit: number = 1,
    threshold: number = DEFAULT_THRESHOLD
  ): MatchResult[] {
    if (!userInput || !userInput.trim()) return []

    threshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, threshold))
    limit = Math.min(limit, 3)

    const candidates = this.getCandidates()
    if (candidates.length === 0) return []

    const scored = candidates
      .map((c) => ({
        content: c.content,
        score: this.calculateTotalScore(userInput, c.content),
        source: c.source,
      }))
      .filter((s) => s.score >= threshold)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, limit)
  }

  calculateTotalScore(text1: string, text2: string): number {
    const keywordScore = this.keywordMatch(text1, text2)
    const semanticScore = this.semanticSimilarity(text1, text2)
    return keywordScore * KEYWORD_WEIGHT + semanticScore * SEMANTIC_WEIGHT
  }

  keywordMatch(text1: string, text2: string): number {
    if (!text1 || !text2) return 0

    const words1 = this.simpleTokenize(text1)
    const words2 = this.simpleTokenize(text2)

    if (words1.length === 0 || words2.length === 0) return 0

    const set1 = new Set(words1)
    const set2 = new Set(words2)

    const intersection = [...set1].filter((w) => set2.has(w)).length
    const union = new Set([...set1, ...set2]).size

    return union === 0 ? 0 : intersection / union
  }

  /** 语义相似度（降级：字符级 Jaccard） */
  semanticSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0

    const chars1 = new Set(text1)
    const chars2 = new Set(text2)

    if (chars1.size === 0 || chars2.size === 0) return 0

    const intersection = [...chars1].filter((c) => chars2.has(c)).length
    const union = new Set([...chars1, ...chars2]).size

    return union === 0 ? 0 : intersection / union
  }

  private simpleTokenize(text: string): string[] {
    // 移除标点，按空格/字符分割
    const cleaned = text.replace(/[^\w\s]/g, '')
    const words = cleaned.split(/\s+/).filter(Boolean)

    const ngrams: string[] = []
    for (const word of words) {
      if (word.length >= 2) {
        ngrams.push(word)
        for (let i = 0; i < word.length - 1; i++) {
          ngrams.push(word.slice(i, i + 2))
        }
      }
    }
    return ngrams
  }

  getDefaultReply(): string {
    return 'ta只是想和你聊天，这是ta表达亲近的方式'
  }

  isSemanticAvailable(): boolean {
    return false // TS 版直接降级
  }

  // ============================================================
  // 内部方法（暴露用于测试）
  // ============================================================

  getCandidates(): Candidate[] {
    const candidates: Candidate[] = []
    for (const reply of this.persona.crush_replies) {
      candidates.push({ content: reply, source: 'crush_replies' })
    }
    for (const trait of this.persona.personality) {
      candidates.push({ content: trait, source: 'personality' })
    }
    for (const pattern of this.persona.behavior_patterns) {
      candidates.push({ content: pattern, source: 'behavior_patterns' })
    }
    return candidates
  }

  parsePersona(content: string): Persona {
    const result: Persona = {
      crush_replies: [],
      personality: [],
      behavior_patterns: [],
    }

    // \Z 在 JS 中不是合法断言（会被当字面量 Z），用 $ 匹配字符串结尾，
    // 未启用 m flag，$ 只匹配字符串结尾。
    const repliesMatch = content.match(/##\s*说话习惯[^#]*?\n(.*?)(?=\n##|$)/s)
    if (repliesMatch) result.crush_replies = this.extractListItems(repliesMatch[1])

    const personalityMatch = content.match(/##\s*情绪模式[^#]*?\n(.*?)(?=\n##|$)/s)
    if (personalityMatch) result.personality = this.extractListItems(personalityMatch[1])

    const behaviorMatch = content.match(/##\s*行为偏好[^#]*?\n(.*?)(?=\n##|$)/s)
    if (behaviorMatch) result.behavior_patterns = this.extractListItems(behaviorMatch[1])

    return result
  }

  private extractListItems(text: string): string[] {
    const items: string[] = []
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        items.push(trimmed.slice(2))
      } else if (trimmed.startsWith('「') && trimmed.endsWith('」')) {
        items.push(trimmed.slice(1, -1))
      }
    }
    return items
  }

  private loadPersona(): Persona {
    if (!this.projectRoot) return { crush_replies: [], personality: [], behavior_patterns: [] }

    const personaPath = path.join(
      this.projectRoot, 'crushes', this.crushSlug, 'persona.md'
    )
    if (!fs.existsSync(personaPath)) return { crush_replies: [], personality: [], behavior_patterns: [] }

    try {
      const content = fs.readFileSync(personaPath, 'utf-8')
      return this.parsePersona(content)
    } catch {
      return { crush_replies: [], personality: [], behavior_patterns: [] }
    }
  }
}
