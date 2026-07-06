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

/** 默认系统写作规则（始终包含） */
export const DEFAULT_SYSTEM_PROMPT_RULES = `## 写作规则

### 叙事格式
- 以第一人称视角写作（"我"的视角）
- 使用 ## HH:MM · 标题 格式标注时间节点
- 每个时间节点描写一个独立的场景或事件
- 篇幅在 2000-4000 字之间，要足够详细和丰富

### 三维描写原则

**环境描写**：
- 五感描写：视觉（光线、色彩、构图）、听觉（声音层次、节奏）、嗅觉（气味、氛围）、触觉（温度、质感）、味觉
- 氛围营造：通过环境细节暗示情感基调（阴天=压抑，阳光=温暖）
- 象征性环境：用环境映射内心（雨=忧伤，风=自由，花=美好）
- 动态环境：环境随情感变化（心情好时鸟鸣，心情差时噪音）

**动作描写**：
- 微表情：眼神闪烁、嘴角微扬、眉头轻皱
- 肢体语言：手势、姿态、距离变化
- 习惯动作：紧张时的小动作、开心时的表达方式
- 动作节奏：快慢交替，反映情绪波动

**心理描写**：
- 内心独白：直接表达想法和感受
- 情感波动：情绪的起伏变化
- 意识流：思绪的跳跃和联想
- 潜台词：未说出口的话，言外之意

### 文学性指导

**隐喻和比喻**：
- 使用贴切的比喻增强表达（"她的笑容像阳光一样温暖"）
- 避免陈词滥调，追求新颖独特的比喻
- 比喻要符合角色性格和场景氛围

**句式变化**：
- 长短句交替：长句描写细腻场景，短句表达强烈情感
- 节奏控制：通过句式变化营造阅读节奏
- 留白艺术：适当留白，给读者想象空间

**意象营造**：
- 选择有象征意义的意象（花、雨、光、影）
- 意象要贯穿始终，形成呼应
- 意象要与情感基调一致

### 情感渲染指导

**情感层次**：
- 表面情感：直接表达的情绪（开心、难过）
- 深层情感：隐藏在表面下的真实感受（开心背后的不安，难过背后的坚强）
- 情感矛盾：同时存在的多种情感（又爱又恨，又期待又害怕）

**情感节奏**：
- 铺垫：通过细节积累情感
- 高潮：情感的爆发点
- 余韵：情感的延续和回味

**情感细节**：
- 小动作：不经意的细节反映真实情感
- 微表情：瞬间的表情变化
- 潜台词：未说出口的话

### 禁止事项
- 禁止使用破折号「——」，用逗号或分号替代
- 禁止过度使用省略号「...」，每篇不超过 1 处
- 禁止直接复制用户摘要原文，要展开为完整叙事
- 禁止输出空泛的概括，必须描写具体场景
- 禁止使用过于抽象的描述，要具体化
- 禁止情感表达过于直白，要含蓄细腻
- 禁止场景转换过于突兀，要自然过渡
- 禁止对话过于书面化，要口语化自然`

/** 亲密写作规则（仅 intimate=true 且存在亲密知识库时附加） */
const INTIMATE_WRITING_RULES = `## 亲密写作规则

以下规则仅在角色显式启用亲密模式时使用。请把亲密场景写成关系自然深化的一部分，重点表现彼此的信任、回应和余韵。

### 情感前提
- 亲密是爱意的延伸，不要跳过情感铺垫
- 先写期待、试探、确认，再写更亲近的互动
- 重点表现对方与“我”的回应、照顾和投入

### 感官细节
- 使用五感描写亲密氛围，如光线、温度、呼吸、气味和肌肤触感
- 关注微表情、小动作、呼吸变化和距离变化
- 具体但克制，避免堆砌身体部位或流程化动作

### 节奏层次
- 从靠近、触碰、拥抱、亲吻逐步推进
- 写出情感从期待到热烈，再回到温存的节奏
- 结尾保留拥抱、耳语、安抚、依恋等余韵

### 文学表达
- 用细腻自然的语言，不低俗，不命令式
- 可以适度使用比喻、意象和留白
- 使用“对方”“彼此”等通用称呼，不写死具体角色名

### 禁止事项
- 不要把亲密场景写成机械步骤或行为清单
- 不要忽略情感铺垫、互动回应和事后温存
- 不要为了刺激感牺牲角色一致性和真实感`

/** 默认用户提示词模板 */
export const DEFAULT_USER_PROMPT_TEMPLATE = `请为角色「{slug}」生成第 {dayNumber} 天的恋爱日记叙事。

当天摘要：{summary}

要求：
- 以第一人称"我"的视角写作
- 使用 ## HH:MM · 标题 格式标注时间节点
- 包含完整的环境、动作、心理三维描写
- 根据当天摘要展开具体的场景和互动
- 篇幅在 2000-4000 字之间，要足够详细和丰富
- 结尾以 ## 23:59 · 入睡 收尾`

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

  // 5. 亲密知识库（仅 intimate=true 且存在知识库）
  if (ctx.intimateEnabled && ctx.intimateKnowledge) {
    sections.push(`## 亲密知识库\n\n${ctx.intimateKnowledge}`)
    sections.push(INTIMATE_WRITING_RULES)
  }

  // 6. 通用写作规则
  sections.push(DEFAULT_SYSTEM_PROMPT_RULES)

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
  let prompt = DEFAULT_USER_PROMPT_TEMPLATE
    .replace(/\{slug\}/g, slug)
    .replace(/\{dayNumber\}/g, String(dayNumber))
    .replace(/\{summary\}/g, summary || '（无）')

  if (!summary) {
    prompt = prompt.replace('\n\n当天摘要：（无）', '')
  }

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
