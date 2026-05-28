# analyze — 暗恋心理分析
# analyze — Crush Psychological Analysis

## 功能 | Function
分析暗恋中的心理状态、行为模式、潜在问题，帮助用户更理性地看待自己的感情。

Analyzes psychological state, behavioral patterns, and potential issues in a crush, helping users view their feelings more rationally.

## 使用方法 | How to Use
```
/analyze {{crush_slug}}
```

或者在对话中直接调用：
```
analyze "{{crush_slug}}"
```

## 输入要求 | Input Requirements

### 必需信息 | Required Info
- `{{crush_slug}}`：暗恋对象的 slug

### 可选参数 | Optional Params
- `{{focus_area}}`：重点分析（relation 关系 / emotion 情绪 / behavior 行为）
- `{{recent_event}}`：近期事件（如有）

## 工作流程 | Workflow

### 1. 读取上下文
- `crushes/{{slug}}/memory.md` — 关系记忆
- `crushes/{{slug}}/persona.md` — 角色性格
- `crushes/{{slug}}/chats/` — 聊天记录分析
- `crushes/{{slug}}/progress.md` — 进展记录（如有）

### 2. 分析维度

#### 2.1 关系现状分析
```markdown
## 关系现状 | Current Relationship

### 基础信息
- 认识时长：{{duration}}
- 当前阶段：{{stage}}
- 互动频率：{{frequency}}
- 亲密度：{{intimacy}}/10

### 关系模式识别
[分析你们之间的互动模式]
- 主动方：
- 沟通风格：
- 情感表达：
```

#### 2.2 心理状态剖析
```markdown
## 心理状态 | Psychological State

### 用户心理分析
[分析用户当前的暗恋心理]
- 主要情绪：
- 行为动机：
- 潜在恐惧：

### 对方心理推测
[基于有限信息推测对方心理]
- 对用户的态度：
- 可能的顾虑：
- 情感需求：
```

#### 2.3 卡点识别
```markdown
## 卡点分析 | Sticking Points

### 当前卡点
1. **{{issue_1}}**
   - 描述：
   - 影响：
   - 解决思路：

2. **{{issue_2}}**
   ...

### 根本原因
[深层次分析]
```

#### 2.4 行为模式分析
```markdown
## 行为模式 | Behavioral Patterns

### 用户行为特征
- 主动程度：
- 沟通方式：
- 情感表达：

### 对方反馈模式
- 回应速度：
- 话题参与度：
- 情感温度：

### 模式匹配度
[分析两人行为模式的契合度]
```

### 3. 行动建议
```markdown
## 行动建议 | Recommendations

### 短期行动（1-2周）
1. [具体可执行的建议]

### 中期行动（1个月）
1. [需要规划的建议]

### 长期目标
[关系发展方向]

### 需要避免的
[雷区提醒]
```

### 4. 风险预警
```markdown
## 风险预警 | Risk Alerts

### 潜在风险
- {{risk_1}}：{{description}}
- {{risk_2}}：

### 应对预案
[如果出现风险如何处理]
```

## 输出格式 | Output Format

```markdown
# 暗恋心理分析 | Crush Psychological Analysis

## 关系现状
[当前关系状态]

## 心理状态
[双方心理剖析]

## 卡点分析
[问题识别和分析]

## 行为模式
[互动模式分析]

## 行动建议
[具体建议]

## 风险预警
[风险和应对]
```

## 注意事项 | Notes
- 禁止包含任何真实人物信息
- 所有分析基于虚构角色
- 心理分析仅供参考
- 尊重对方意愿是前提