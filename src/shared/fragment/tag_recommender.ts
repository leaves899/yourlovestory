/**
 * 标签推荐器。
 *
 * 降频策略：连续跳过 3 次 → 阈值 50%→70%、连续接受 3 次 → 恢复 50%。
 */
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// 常量
// ============================================================

const DEFAULT_THRESHOLD = 0.5
const REDUCED_THRESHOLD = 0.7
const SKIP_THRESHOLD = 3
const ACCEPT_THRESHOLD = 3

// ============================================================
// 标签库
// ============================================================

interface Tag {
  id: string
  name: string
  aliases: string[]
  keywords: string[]
}

interface TagLibrary {
  version?: string
  env_tags: Tag[]
  behavior_tags: Tag[]
}

interface SessionStats {
  skip_count: number
  accept_count: number
  threshold: number
}

function getDefaultTagLibrary(): TagLibrary {
  return {
    version: '1.0.0',
    env_tags: [
      { id: 'work', name: '工作', aliases: ['上班', '公司', '办公室'], keywords: ['工作', '上班', '公司'] },
      { id: 'home', name: '家', aliases: ['家里', '房间'], keywords: ['家', '房间', '卧室'] },
      { id: 'school', name: '学校', aliases: ['教室', '图书馆'], keywords: ['学校', '教室', '图书馆'] },
      { id: 'cafe', name: '咖啡厅', aliases: ['咖啡店', '星巴克'], keywords: ['咖啡', '星巴克'] },
      { id: 'park', name: '公园', aliases: ['花园', '绿地'], keywords: ['公园', '花园'] },
    ],
    behavior_tags: [
      { id: 'cute', name: '可爱', aliases: ['萌', '软萌'], keywords: ['可爱', '萌', '表情包'] },
      { id: 'cool', name: '酷', aliases: ['帅气', '高冷'], keywords: ['酷', '帅', '高冷'] },
      { id: 'shy', name: '害羞', aliases: ['腼腆', '不好意思'], keywords: ['害羞', '腼腆', '脸红'] },
      { id: 'happy', name: '开心', aliases: ['高兴', '快乐'], keywords: ['开心', '高兴', '笑'] },
      { id: 'sad', name: '难过', aliases: ['伤心', '失落'], keywords: ['难过', '伤心', '失落'] },
    ],
  }
}

// ============================================================
// TagRecommender
// ============================================================

export class TagRecommender {
  tagLibrary: TagLibrary
  sessionStats: Map<string, SessionStats> = new Map()

  constructor(projectRoot?: string | null) {
    this.tagLibrary = this.loadTagLibrary(projectRoot)
  }

  recommend(
    content: string,
    _crushSlug: string,
    sessionId: string,
    _crushPersona?: any
  ): { env_tags: Array<{ id: string; name: string; relevance: number }>; behavior_tags: Array<{ id: string; name: string; relevance: number }> } {
    if (!content || !content.trim()) {
      return { env_tags: [], behavior_tags: [] }
    }

    const threshold = this.getCurrentThreshold(sessionId)

    return {
      env_tags: this.recommendTags(content, threshold, 'env_tags'),
      behavior_tags: this.recommendTags(content, threshold, 'behavior_tags'),
    }
  }

  recordSkip(sessionId: string): void {
    let stats = this.sessionStats.get(sessionId)
    if (!stats) {
      stats = { skip_count: 0, accept_count: 0, threshold: DEFAULT_THRESHOLD }
      this.sessionStats.set(sessionId, stats)
    }
    stats.skip_count += 1
    stats.accept_count = 0

    if (stats.skip_count >= SKIP_THRESHOLD) {
      stats.threshold = REDUCED_THRESHOLD
    }
  }

  recordAccept(sessionId: string): void {
    let stats = this.sessionStats.get(sessionId)
    if (!stats) {
      stats = { skip_count: 0, accept_count: 0, threshold: DEFAULT_THRESHOLD }
      this.sessionStats.set(sessionId, stats)
    }
    stats.accept_count += 1
    stats.skip_count = 0

    if (stats.accept_count >= ACCEPT_THRESHOLD) {
      stats.threshold = DEFAULT_THRESHOLD
    }
  }

  getCurrentThreshold(sessionId: string): number {
    return this.sessionStats.get(sessionId)?.threshold ?? DEFAULT_THRESHOLD
  }

  getSessionStats(sessionId: string): SessionStats {
    return (
      this.sessionStats.get(sessionId) ?? {
        skip_count: 0,
        accept_count: 0,
        threshold: DEFAULT_THRESHOLD,
      }
    )
  }

  resetSession(sessionId: string): void {
    this.sessionStats.delete(sessionId)
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private recommendTags(
    content: string,
    threshold: number,
    tagType: 'env_tags' | 'behavior_tags'
  ): Array<{ id: string; name: string; relevance: number }> {
    const tags = this.tagLibrary[tagType]
    if (!tags) return []

    const candidates = tags
      .map((tag) => ({
        id: tag.id,
        name: tag.name,
        relevance: this.calculateRelevance(content, tag),
      }))
      .filter((c) => c.relevance >= threshold)
      .sort((a, b) => b.relevance - a.relevance)

    return candidates.slice(0, 3)
  }

  calculateRelevance(content: string, tag: Tag): number {
    const contentLower = content.toLowerCase()
    let score = 0.0

    for (const kw of tag.keywords) {
      if (contentLower.includes(kw.toLowerCase())) {
        score += 0.3
      }
    }
    for (const alias of tag.aliases) {
      if (contentLower.includes(alias.toLowerCase())) {
        score += 0.2
      }
    }
    if (contentLower.includes(tag.name.toLowerCase())) {
      score += 0.5
    }

    return Math.min(score, 1.0)
  }

  private loadTagLibrary(projectRoot?: string | null): TagLibrary {
    if (!projectRoot) return getDefaultTagLibrary()

    const tagPath = path.join(projectRoot, 'tags', 'tag_library.json')
    if (!fs.existsSync(tagPath)) return getDefaultTagLibrary()

    try {
      const data = JSON.parse(fs.readFileSync(tagPath, 'utf-8'))
      return data as TagLibrary
    } catch {
      return getDefaultTagLibrary()
    }
  }
}
