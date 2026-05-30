# Day Writing Skill / 日常写作技能

> 根据角色记忆和性格，生成一天的生活叙事

## 使用方法

```
/day [日期描述]
/day 碎片
```

示例：
```
/day 上周五，我们第一次约会
/day 昨天，她生日那天
/day 今天，普通的周末早晨
/day 碎片
```

## 工作原理

1. 读取 `crushes/{{slug}}/memory.md` 获取关系记忆
2. 读取 `crushes/{{slug}}/persona.md` 获取角色性格
3. 检查 `crushes/{{slug}}/.intimate_config` 确认亲密内容设置
4. 生成符合写作标准的叙事文本
5. 输出保存至 `crushes/{{slug}}/memories/chats/day*.md`

## 碎片日记模式

碎片日记是 day 模块的扩展功能。用户通过输入来源、情绪、内容三个维度的碎片信息，系统将其整合为叙事写作的上下文。

### 使用方法

```
/day 碎片
```

### 写作模式

| 模式 | 说明 | 特点 |
|------|------|------|
| Raw | 最自由，无引导 | 用户有明确想法，不需要引导 |
| Guided | 半结构化，提供方向引导 | 用户有模糊想法，需要一些引导 |
| Themed | 主题限定 | 用户想围绕某个主题写 |
| Blind | 盲写模式 | 写作过程中隐藏对话历史 |

### 数据存储

碎片数据存储在 `crushes/{slug}/fragments/` 目录下，按日期组织：

```
crushes/{slug}/fragments/
├── 2026-05-30.json
├── 2026-05-29.json
└── ...
```

### 状态说明

| 状态 | 说明 | 权限 |
|------|------|------|
| 进行中 | 碎片所属日期 = 当前日期 | 可编辑、可添加、可整合 |
| 未完成 | 7天内未完成 | 可查看、可整合 |
| 已过期 | 超过7天 | 只读归档 |
| 已完成 | 已完成写作 | 不可编辑、不可删除 |

### 详细文档

详见 [碎片日记 PRD](../../../docs/features/fragment-journal-prd.md)

## 输出格式

```markdown
## HH:MM · 事件标题

叙事文本，融入心理、环境、动作描写于行文之中。

## HH:MM · 下一事件
...

---

## 关系进展记录

| 项目 | 状态 |
|------|------|
| 关系阶段 | {{STAGE}} |
| 今日亲密度 | {{LEVEL}} |
| 关键进展 | {{PROGRESS}} |

## 亲密记录

- {{INTIMATE_RECORD}}

## 信物状态

{{ITEM_STATUS}}
```

**写作方式**：心理、环境、动作全部融入叙事，不使用「（心理描写：...）」这类标注。例如：

```
心跳声在耳边放大，我攥紧手机站在咖啡厅门口。
雨刚停，空气中还带着潮湿的凉意。
手指不自觉地握紧又松开。
```

而不是：

```
心跳声在耳边放大。紧张感从胸口蔓延到指尖。
空气中带着雨后的潮湿，咖啡厅的灯光暖黄。
手指攥紧手机，指节微微发白。
```

## 写作标准

- 三维描写自然融入：心理 + 环境 + 动作在行文中体现，不带标注
- 时间标签：`## HH:MM · 事件`
- 禁止破折号「——」
- 禁止过度省略号「...」
- 禁止在 day 末尾写「她说的话」汇总节

## 完成后

运行 `/onboard` 查看整体进度和建议。

## 亲密内容

如果 `INTIMATE_KNOWLEDGE.md` 存在且 `.intimate_config` 中 `intimate=true`，则在写作中包含亲密场景。

---

# English Version

> Generate a day's narrative based on character memory and personality

## Usage

```
/day [date description]
```

## How It Works

1. Read `crushes/{{slug}}/memory.md` for relationship memory
2. Read `crushes/{{slug}}/persona.md` for character personality
3. Check `crushes/{{slug}}/.intimate_config` for intimate content settings
4. Generate narrative text following writing standards
5. Save output to `crushes/{{slug}}/memories/chats/day*.md`

## Output Format

See Chinese version above.

## Writing Standards

- Three-dimensional description: psychology + environment/light/temperature/sound + action
- Time tags: `## HH:MM · Event`
- No dashes 「——」
- No excessive ellipsis 「...」
- No "things she said" summary at the end

## Intimate Content

If `INTIMATE_KNOWLEDGE.md` exists and `.intimate_config` contains `intimate=true`, include intimate scenes in the narrative.

## After Writing

Run `/onboard` to check overall progress and suggestions.