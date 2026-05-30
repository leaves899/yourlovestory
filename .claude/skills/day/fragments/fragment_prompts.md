# 碎片写作 Prompt / Fragment Writing Prompts

## 功能 | Function

根据碎片信息生成写作 Prompt，用于调用 day 模块生成叙事。

## Prompt 生成逻辑 | Prompt Generation Logic

### 公式

```
prompt = base_prompt(origin) + mood_modifier(mood) + context(content)
```

### 各模式处理

| 模式 | 来源方向 | 情绪标签 | Prompt 生成逻辑 |
|------|----------|----------|-----------------|
| Raw | 必选 | 可选 | 有情绪时：base_prompt(origin) + mood_modifier(mood)；无情绪时：base_prompt(origin) |
| Guided | 必选（方向） | 可选（系统推荐） | direction_prompt(direction) + [mood_modifier(mood)] |
| Themed | 必选 | 必选 | theme_prompt(theme) + base_prompt(origin) + mood_modifier(mood) |
| Blind | 必选 | 必选 | base_prompt(origin) + mood_modifier(mood) + 盲写特殊处理 |

## 完整 Prompt 矩阵 | Complete Prompt Matrix

### Raw/Guided 模式

| 来源 \ 情绪 | positive | negative | neutral | mixed | 跳过 |
|-------------|----------|----------|---------|-------|------|
| user | 记录一下，今天我给ta发了什么 | 今天我给ta发了什么，让ta在意了？ | 今天我给ta发了什么？ | 今天我给ta发了什么，心情复杂 | 记录一下，今天我给ta发了什么 |
| crush | ta今天说了什么让你开心的话？ | ta今天说了什么让你在意的话？ | ta今天说了什么？ | ta今天说了什么，心情复杂 | ta今天说了什么？ |
| ambient | 在【环境】时，看到ta的【行为】，感到开心 | 在【环境】时，看到ta的【行为】，感到在意 | 在【环境】时，看到ta的【行为】 | 在【环境】时，看到ta的【行为】，心情复杂 | 在【环境】时，看到ta的【行为】 |

### Guided 模式方向

| 方向 | Prompt | 推荐情绪 |
|------|--------|----------|
| 轻松的 | 记录一些日常小事 | positive |
| 有些在意的 | 说说那些让你在意的事 | negative |
| 想深入的 | 展开聊聊这个话题 | mixed |

### Themed 模式主题

| 主题 | Prompt |
|------|--------|
| 工作/学习 | 与工作、学习相关的互动 |
| 生活日常 | 日常生活中的小事 |
| 约会/出行 | 约会、外出相关的场景 |
| 情感交流 | 深入的情感对话 |
| 兴趣爱好 | 与兴趣、爱好相关 |
| 节日/纪念日 | 节日、纪念日相关 |
| 争吵/误会 | 冲突、误会相关 |
| 和好/道歉 | 和好、道歉相关 |

## 占位符说明 | Placeholder Description

- **【环境】**：根据用户输入的环境标签填充（如"工作时"、"下班路上"、"在公园"）
- **【行为】**：根据用户输入的行为标签填充（如"发了一个表情包"、"回了一个嗯"）
- **无标签信息时**：使用"某个时刻"或直接省略

### 填充优先级

1. 用户选择的 `env_tags`
2. 用户输入 `content` 中通过 NLP 提取的地点词
3. crush 角色档案中的常去地点
4. 默认值："某个时刻"

## 注意事项 | Notes

- 碎片只是触发器，不是叙事本身
- 系统负责整合碎片为叙事上下文，不改变 day 的写作流程
- 重新生成叙事时，基于当日所有碎片重新整合
