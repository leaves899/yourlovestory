# date — 约会模拟器
# date — Date Simulator

## 功能 | Function
模拟约会场景，生成约会地点建议，模拟约会对话，提供约会后复盘。

Simulates dating scenarios, generates location suggestions, simulates conversations, provides post-date review.

## 使用方法 | How to Use
```
/date {{crush_slug}}
```

或者在对话中直接调用：
```
date "{{crush_slug}}"
```

## 输入要求 | Input Requirements

### 必需信息 | Required Info
- `{{crush_slug}}`：暗恋对象的 slug

### 可选参数 | Optional Params
- `{{budget}}`：预算范围（low/mid/high）
- `{{duration}}`：约会时长（short 1-2h / medium 3-4h / long 5h+）
- `{{season}}`：季节（spring/summer/autumn/winter）
- `{{style}}`：约会风格（casual/cute/romantic/adventure）

## 工作流程 | Workflow

### 1. 读取上下文
- `crushes/{{slug}}/memory.md` — 关系记忆
- `crushes/{{slug}}/persona.md` — 角色性格
- 近期互动记录

### 2. 地点推荐
```markdown
## 约会地点推荐 | Location Suggestions

### 首选场地
**{{place_name}}**
- 类型：{{type}}（咖啡厅/餐厅/公园/展览馆...）
- 地址：{{location}}
- 人流量：{{crowd_level}}
- 适合活动：{{activities}}
- 预算：{{budget_level}}
- 推荐理由：{{why_this_place}}

### 备选方案
[Backup locations with rationale]
```

### 3. 约会流程模拟

#### 3.1 时间线
```markdown
## 约会时间线 | Date Timeline

### 13:00 · 约定见面
[见面前的准备和心理活动]

### 13:30 · 到达地点
[第一次见面的场景描写]

### 14:00 · 约会进行中
[对话模拟、互动细节]
```

#### 3.2 对话模拟
每个关键场景包含：
- **场景描述**：环境、氛围
- **对话示例**：
  - 用户可能说的话
  - 对方可能的回应
  - 情感微表情描述
- **成功率提示**：关键节点的建议

### 4. 约会后复盘
```markdown
## 约会复盘 | Post-Date Review

### 本次约会得分
| 维度 | 评分 | 备注 |
|------|------|------|
| 氛围 | /10 | |
| 对话 | /10 | |
| 互动 | /10 | |
| 整体 | /10 | |

### 关键观察
- [正面信号]
- [需要注意的地方]

### 下次约会建议
[针对本次的改进建议]
```

## 输出格式 | Output Format

```markdown
# 约会模拟 | Date Simulation

## 地点推荐
[推荐场地详情]

## 约会流程
[时间线和对话模拟]

## 关键时刻提示
[关键节点的建议]

## 约会后复盘
[评估和改进建议]
```

## 注意事项 | Notes
- 禁止包含任何真实人物信息
- 所有模拟均为虚构
- 地点推荐基于公开信息
- 对话模拟仅供参考