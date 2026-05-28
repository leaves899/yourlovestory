# progress — 暗恋进展追踪
# progress — Crush Progress Tracker

## 功能 | Function
记录暗恋关系的发展阶段，给出阶段建议，帮助用户理清现状，明确下一步。

Tracks the development stages of a crush, provides stage-specific advice, helps users clarify current status and determine next steps.

## 使用方法 | How to Use
```
/progress {{crush_slug}}
```

或者在对话中直接调用：
```
progress "{{crush_slug}}"
```

## 输入要求 | Input Requirements

### 必需信息 | Required Info
- `{{crush_slug}}`：暗恋对象的 slug

### 可选参数 | Optional Params
- `{{action}}`：操作类型（view 查看 / add 添加事件 / update 更新阶段）
- `{{event}}`：要添加的事件描述

## 阶段定义 | Stage Definitions

### 阶段 1：认识期 | Awareness
- 双方刚认识或知道对方存在
- 互动有限，停留在表面
- 主要心理：好奇、初步好感

### 阶段 2：熟悉期 | Familiarity
- 开始有更多接触
- 找到共同话题
- 主要心理：期待、试探

### 阶段 3：暧昧期 | Ambiguity
- 互动频繁，有情感依赖
- 双方都在试探对方态度
- 主要心理：甜蜜、焦虑、患得患失

### 阶段 4：表白期 | Confession
- 决定表白或等待时机
- 心理压力最大
- 主要心理：紧张、恐惧、期待

### 阶段 5：交往期 | Relationship
- 确立关系或被拒绝
- 进入恋爱或退回朋友关系
- 主要心理：幸福或失落

## 工作流程 | Workflow

### 1. 读取数据
- `crushes/{{slug}}/memory.md` — 关系记忆
- `crushes/{{slug}}/progress.md` — 进展记录（如有）
- `crushes/{{slug}}/persona.md` — 角色性格

### 2. 显示当前状态

```markdown
# 暗恋进展追踪 | Crush Progress Tracker

## 当前阶段：{{stage_name}} ({{stage_number}}/5)

### 阶段画像
[该阶段的典型特征和心理状态]

### 阶段进度
- 已完成：
- 进行中：
- 待完成：

### 关键指标
| 指标 | 数值 | 趋势 |
|------|------|------|
| 互动频率 | {{freq}}/10 | {{trend}} |
| 亲密度 | {{int}}/10 | {{trend}} |
| 信任度 | {{trust}}/10 | {{trend}} |
| 情感浓度 | {{emotion}}/10 | {{trend}} |
```

### 3. 关键事件时间线
```markdown
## 关键事件 | Key Events

| 日期 | 事件 | 阶段 | 备注 |
|------|------|------|------|
| YYYY-MM-DD | [事件] | {{stage}} | [观察] |
| ... | ... | ... | ... |
```

### 4. 阶段建议
```markdown
## 阶段建议 | Stage Advice

### 当前阶段 {{stage_number}}：{{stage_name}}

#### 这个阶段应该：
- [ ] {{todo_1}}
- [ ] {{todo_2}}
- [ ] {{todo_3}}

#### 这个阶段避免：
- {{avoid_1}}
- {{avoid_2}}

#### 进度检查点
[该阶段结束的标准]
```

### 5. 下一步行动
```markdown
## 下一步 | Next Steps

### 推荐行动
1. **{{action_1}}**
   - 理由：
   - 预期结果：

2. **{{action_2}}**
   ...

### 预测时间线
- 预计进入下一阶段：{{timeline}}
- 关键转折点：{{turning_point}}
```

## 添加事件 | Adding Events

使用 `add` 操作时：
```
/progress {{slug}} add {{event_description}}
```

添加后更新：
- 事件记录到时间线
- 重新评估阶段进度
- 生成新的建议

## 输出格式 | Output Format

```markdown
# 暗恋进展追踪 | Crush Progress Tracker

## 当前状态
[阶段、指标、进度]

## 关键事件时间线
[时间线表格]

## 阶段建议
[当前阶段的行动指南]

## 下一步行动
[具体建议和时间线]
```

## 注意事项 | Notes
- 禁止包含任何真实人物信息
- 所有记录均为虚构
- 阶段仅供参考，真实关系复杂
- 尊重对方意愿是核心原则