/**
 * 系统 Prompt 构建器 —— 将角色上下文与写作规则组装为 LLM 系统提示。
 *
 * 输出结构化的 system prompt，包含：
 * 1. 角色身份（persona）
 * 2. 关系上下文（memory）
 * 3. 当天日程参考（WEEKDAY）
 * 4. [仅 intimate=true] 亲密偏好与亲密写作规则
 * 5. 通用写作规则
 */
import type { CrushContext } from '../crush/contextLoader'

/** 自定义提示词配置 */
export interface CustomPrompts {
  /** 自定义系统提示词（追加到默认规则之后） */
  customSystemPrompt?: string
  /** 自定义用户提示词模板（替换默认模板，可用 {slug} {dayNumber} {summary} 占位） */
  customUserPromptTemplate?: string
}

/** 叙事生成参数 */
export interface NarrativeParams {
  /** 当天摘要（用户输入） */
  summary?: string
  /** Day 编号 */
  dayNumber: number
  /** 其他可选参数 */
  sexCount?: number
  sexDetails?: string
  ycmPill?: number
}

/** 通用写作规则（始终包含） */
const GENERAL_WRITING_RULES = `## 写作规则

### 叙事格式
- 以第一人称视角写作（"我"的视角）
- 使用 ## HH:MM · 标题 格式标注时间节点
- 每个时间节点描写一个独立的场景或事件
- 篇幅在 2000-4000 字之间，要足够详细和丰富

### 三维描写原则
- **环境描写**：场景的氛围、光线、声音、气味
- **动作描写**：人物的行为、肢体语言、微表情
- **心理描写**：内心的感受、想法、情绪波动

### 禁止事项
- 禁止使用破折号「——」，用逗号或分号替代
- 禁止过度使用省略号「...」，每篇不超过 1 处
- 禁止直接复制用户摘要原文，要展开为完整叙事
- 禁止输出空泛的概括，必须描写具体场景`

/** 亲密写作规则（仅 intimate=true 时附加） */
const INTIMATE_WRITING_RULES = `## 亲密写作规则

以下规则适用于亲密场景描写：

### 感官描写
- 注重五感体验：触觉（温度、质感、力度）、嗅觉（体香、沐浴露）、听觉（呼吸、心跳、低语）、味觉、视觉
- 描写身体细节时自然直接，不回避也不夸张
- 从"我"的视角感受每一个触碰和反应

### 情感连接
- 亲密是爱意的延伸，每次描写都应体现双方的情感互动
- 注意描写亲密前的情感铺垫和亲密后的温存
- 展现夏夏害羞但投入的特点

### 文学性
- 保持文学美感，用细腻而非低俗的语言
- 可以用隐喻和比喻丰富描写（如"她的呼吸像海浪一样起伏"）
- 注重节奏感——从慢到快、从温柔到热烈、再回归温柔

### 对话融入
- 亲密场景中穿插自然的对话和声音
- 夏夏会小声表达感受（"好舒服""喜欢你这样"）
- 被叫名字是她的敏感点`

/**
 * 构建系统 Prompt。
 *
 * @param ctx - 角色上下文
 * @param params - 叙事参数（可选，用于定向细节）
 * @param customPrompts - 自定义提示词配置（可选）
 * @returns 完整的系统 Prompt 字符串
 */
export function buildSystemPrompt(
  ctx: CrushContext,
  _params?: NarrativeParams,
  customPrompts?: CustomPrompts
): string {
  const sections: string[] = []

  // 1. 角色身份
  if (ctx.persona) {
    sections.push(`## 角色身份\n\n${ctx.persona}`)
  }

  // 2. 关系记忆
  if (ctx.memory) {
    sections.push(`## 关系记忆\n\n${ctx.memory}`)
  }

  // 3. 当天日程参考
  if (ctx.weekday) {
    sections.push(`## 当天日程参考\n\n${ctx.weekday}`)
  }

  // 4. 压缩上下文
  if (ctx.contextSummary) {
    sections.push(`## 上下文摘要\n\n${ctx.contextSummary}`)
  }

  // 5. 亲密知识库（仅 intimate=true）
  if (ctx.intimateKnowledge) {
    sections.push(`## 亲密知识库\n\n${ctx.intimateKnowledge}`)
    sections.push(INTIMATE_WRITING_RULES)
  }

  // 6. 通用写作规则
  sections.push(GENERAL_WRITING_RULES)

  // 7. 自定义系统提示词（追加到末尾）
  if (customPrompts?.customSystemPrompt) {
    sections.push(`## 自定义规则\n\n${customPrompts.customSystemPrompt}`)
  }

  return sections.join('\n\n---\n\n')
}

/**
 * 构建用户 Prompt（发往 LLM 的具体任务）。
 *
 * @param slug - 角色标识
 * @param params - 叙事参数
 * @param customPrompts - 自定义提示词配置（可选）
 * @returns 用户 Prompt 字符串
 */
export function buildUserPrompt(slug: string, params?: NarrativeParams, customPrompts?: CustomPrompts): string {
  const dayNumber = params?.dayNumber ?? 1
  const summary = params?.summary ?? ''

  // 如果有自定义用户提示词模板，使用它
  if (customPrompts?.customUserPromptTemplate) {
    let prompt = customPrompts.customUserPromptTemplate
      .replace(/\{slug\}/g, slug)
      .replace(/\{dayNumber\}/g, String(dayNumber))
      .replace(/\{summary\}/g, summary || '（无）')

    // 追加亲密场景信息
    if (params?.sexCount !== undefined && params.sexCount > 0) {
      prompt += `\n- 本日包含 ${params.sexCount} 次亲密场景，请根据角色亲密知识库自然描写`
      if (params?.sexDetails) {
        prompt += `\n- 亲密细节参考：${params.sexDetails}`
      }
    }

    if (params?.ycmPill !== undefined) {
      prompt += `\n- 本日为优思明第 ${params.ycmPill} 天，如有相关设定请融入叙事`
    }

    return prompt
  }

  // 默认用户提示词模板
  let prompt = `请为角色「${slug}」生成第 ${dayNumber} 天的恋爱日记叙事。`

  if (summary) {
    prompt += `\n\n当天摘要：${summary}`
  }

  prompt += `\n\n要求：
- 以第一人称"我"的视角写作
- 使用 ## HH:MM · 标题 格式标注时间节点
- 包含完整的环境、动作、心理三维描写
- 根据当天摘要展开具体的场景和互动
- 篇幅在 2000-4000 字之间，要足够详细和丰富
- 结尾以 ## 23:59 · 入睡 收尾`

  if (params?.sexCount !== undefined && params.sexCount > 0) {
    prompt += `\n- 本日包含 ${params.sexCount} 次亲密场景，请根据角色亲密知识库自然描写`
    if (params?.sexDetails) {
      prompt += `\n- 亲密细节参考：${params.sexDetails}`
    }
  }

  if (params?.ycmPill !== undefined) {
    prompt += `\n- 本日为优思明第 ${params.ycmPill} 天，如有相关设定请融入叙事`
  }

  return prompt
}
