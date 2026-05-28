# Day Writing Skill / 日常写作技能

> 根据角色记忆和性格，生成一天的生活叙事

## 使用方法

```
/day [日期描述]
```

示例：
```
/day 上周五，我们第一次约会
/day 昨天，她生日那天
/day 今天，普通的周末早晨
```

## 工作原理

1. 读取 `crushes/{{slug}}/memory.md` 获取关系记忆
2. 读取 `crushes/{{slug}}/persona.md` 获取角色性格
3. 检查 `crushes/{{slug}}/.intimate_config` 确认亲密内容设置
4. 生成符合写作标准的叙事文本

## 输出格式

```markdown
## HH:MM · 事件标题

（心理活动）

（环境/光线/温度/声音描写）

（具体动作描写）

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

## 写作标准

- 三维描写：心理活动 + 环境/光线/温度/声音 + 具体动作
- 时间标签：`## HH:MM · 事件`
- 禁止破折号「——」
- 禁止过度省略号「...」
- 禁止在 day 末尾写「她说的话」汇总节

## 亲密内容

如果 `INTIMATE_KNOWLEDGE.md` 存在且 `.intimate_config` 中 `enabled: true`，则在写作中包含亲密场景。

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

## Output Format

See Chinese version above.

## Writing Standards

- Three-dimensional description: psychology + environment/light/temperature/sound + action
- Time tags: `## HH:MM · Event`
- No dashes 「——」
- No excessive ellipsis 「...」
- No "things she said" summary at the end