# confess — 告白模拟器
# confess — Confession Simulator

## 功能 | Function
模拟告白场景，分析告白成功率，给出告白建议。

Simulates confession scenarios, analyzes success rate, and provides advice.

## 使用方法 | How to Use
```
/confess {{crush_slug}}
```

或者在对话中直接调用：
```
confess "{{crush_slug}}"
```

Or invoke directly in conversation:
```
confess "{{crush_slug}}"
```

## 输入要求 | Input Requirements

### 必需信息 | Required Info
- `{{crush_slug}}`：暗恋对象的 slug

### 可选参数 | Optional Params
- `{{scenario}}`：场景类型（默认：daily 日常 / special 特殊场合 / accidental 偶然）
- `{{method}}`：告白方式（default: verbal 口头 / letter 书信 / digital 数字媒介）

## 工作流程 | Workflow

### 1. 读取上下文
- `crushes/{{slug}}/memory.md` — 关系记忆
- `crushes/{{slug}}/persona.md` — 角色性格
- 当前关系阶段

### 2. 分析要素
```
告白成功率 = f(关系深度, 时机合适度, 心理状态, 表白方式)
```

评估维度：
- **关系深度**（1-10）：当前亲密度、信任度
- **时机合适度**（1-10）：当前情境、情绪氛围
- **心理状态**（1-10）：对方当前情绪、压力水平
- **表白方式契合度**（1-10）：方式是否符合对方性格

### 3. 输出模拟结果

#### 3.1 成功率评估
```markdown
## 告白成功率 | Success Rate

综合评分：{{score}}/10
- 关系深度：{{depth}}/10
- 时机合适：{{timing}}/10
- 心理状态：{{mood}}/10
- 方式契合：{{method}}/10

风险提示：{{risks}}
```

#### 3.2 情景模拟
根据输入的场景，模拟对方可能的回应：
- 接受
- 犹豫
- 拒绝
- 需更多信息

每种回应包含：
- 回应描述
- 后续对话示例
- 情感变化分析

#### 3.3 告白建议
```markdown
## 告白建议 | Advice

### 最佳时机
[推荐的告白时间点和场景]

### 表达方式
[符合对方性格的措辞建议]

### 注意事项
[需要避免的雷区和误解]
```

## 输出格式 | Output Format

```markdown
# 告白模拟 | Confession Simulation

## 成功率评估
[评分详情]

## 情景模拟
### 场景：{{scenario}}
[模拟的对话和反应]

## 告白建议
[具体建议]

## 如果被拒绝，如何应对
[应对策略]
```

## 注意事项 | Notes
- 禁止包含任何真实人物信息
- 所有模拟均为虚构
- 成功率评估仅供参考
- 最终决定权在用户