import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { BlindMatcher } from '@/shared/fragment/blind_matcher'

let tmpRoot: string

function writePersona(content: string): void {
  const crushDir = path.join(tmpRoot, 'crushes', 'demo')
  fs.mkdirSync(crushDir, { recursive: true })
  fs.writeFileSync(path.join(crushDir, 'persona.md'), content, 'utf-8')
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-frag-blind-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('BlindMatcher', () => {
  test('从角色档案加载三类候选并返回来源', () => {
    writePersona(`
## 说话习惯
- Warm hello

## 情绪模式
- Calm tone

## 行为偏好
- Offers help
`)
    const matcher = new BlindMatcher('demo', tmpRoot)

    const reply = matcher.matchReplies('Warm hello', 1, 0.5)
    const personality = matcher.matchReplies('Calm tone', 1, 0.5)
    const behavior = matcher.matchReplies('Offers help', 1, 0.5)

    expect(reply[0]).toMatchObject({ content: 'Warm hello', source: 'crush_replies' })
    expect(personality[0]).toMatchObject({ content: 'Calm tone', source: 'personality' })
    expect(behavior[0]).toMatchObject({ content: 'Offers help', source: 'behavior_patterns' })
  })

  test('匹配结果按分数降序排列且最多返回三条', () => {
    writePersona(`
## 说话习惯
- warm hello
- warm hello
- warm hello
- warm
`)
    const matcher = new BlindMatcher('demo', tmpRoot)

    const results = matcher.matchReplies('warm hello', 10, 0.5)
    const scores = results.map((result) => result.score)

    expect(results).toHaveLength(3)
    expect(results.every((result) => result.content === 'warm hello')).toBe(true)
    expect(scores.every((score, index) => index === 0 || scores[index - 1] >= score)).toBe(true)
  })

  test('空输入、缺失档案和无匹配时返回空数组并保留默认回复', () => {
    const missingPersonaMatcher = new BlindMatcher('demo', tmpRoot)

    expect(missingPersonaMatcher.matchReplies('anything')).toEqual([])
    expect(missingPersonaMatcher.matchReplies('')).toEqual([])
    expect(missingPersonaMatcher.getDefaultReply().length).toBeGreaterThan(0)

    writePersona(`
## 说话习惯
- quiet reply
`)
    const matcher = new BlindMatcher('demo', tmpRoot)

    expect(matcher.matchReplies('completely unrelated', 1, 0.8)).toEqual([])
  })
})
