/**
 * fragment tag_recommender 单元测试（TS 等价验证）。
 */
import { TagRecommender } from '@/shared/fragment/tag_recommender'

describe('TagRecommender', () => {
  let recommender: TagRecommender

  beforeEach(() => {
    recommender = new TagRecommender(null)
  })

  describe('recommend', () => {
    test('空内容返回空', () => {
      const r = recommender.recommend('', 'ex', 's1')
      expect(r.env_tags).toEqual([])
      expect(r.behavior_tags).toEqual([])
    })

    test('匹配关键词返回标签', () => {
      const r = recommender.recommend('ta很可爱', 'ex', 's1')
      const cute = r.behavior_tags.find((t) => t.name === '可爱')
      expect(cute).toBeDefined()
    })

    test('无匹配返回空', () => {
      const r = recommender.recommend('xyz123完全无关', 'ex', 's1')
      expect(r.env_tags).toEqual([])
      expect(r.behavior_tags).toEqual([])
    })
  })

  describe('相关度算法', () => {
    test('关键词匹配 +0.3', () => {
      const tag = { id: 't', name: '测试', keywords: ['工作'], aliases: [] }
      expect(recommender.calculateRelevance('今天工作很忙', tag)).toBe(0.3)
    })

    test('别名匹配 +0.2', () => {
      const tag = { id: 't', name: '测试', keywords: [], aliases: ['上班'] }
      expect(recommender.calculateRelevance('今天上班很忙', tag)).toBe(0.2)
    })

    test('名称匹配 +0.5', () => {
      const tag = { id: 't', name: '工作', keywords: [], aliases: [] }
      expect(recommender.calculateRelevance('今天工作很忙', tag)).toBe(0.5)
    })

    test('分数上限 1.0', () => {
      const tag = { id: 't', name: '工作', keywords: ['工作'], aliases: ['工作'] }
      expect(recommender.calculateRelevance('工作', tag)).toBeLessThanOrEqual(1.0)
    })
  })

  describe('降频策略', () => {
    test('默认阈值 50%', () => {
      expect(recommender.getCurrentThreshold('s1')).toBe(0.5)
    })

    test('连续跳过 3 次提高到 70%', () => {
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      expect(recommender.getCurrentThreshold('s1')).toBe(0.7)
    })

    test('连续接受 3 次恢复到 50%', () => {
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.recordAccept('s1')
      recommender.recordAccept('s1')
      recommender.recordAccept('s1')
      expect(recommender.getCurrentThreshold('s1')).toBe(0.5)
    })

    test('接受重置跳过计数', () => {
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.recordAccept('s1')
      const stats = recommender.getSessionStats('s1')
      expect(stats.skip_count).toBe(0)
      expect(stats.accept_count).toBe(1)
    })

    test('不同会话独立', () => {
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      expect(recommender.getCurrentThreshold('s1')).toBe(0.7)
      expect(recommender.getCurrentThreshold('s2')).toBe(0.5)
    })

    test('resetSession 清空统计', () => {
      recommender.recordSkip('s1')
      recommender.recordSkip('s1')
      recommender.resetSession('s1')
      expect(recommender.getCurrentThreshold('s1')).toBe(0.5)
    })
  })
})
