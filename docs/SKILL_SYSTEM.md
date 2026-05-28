# Skill 系统说明 / Skill System Guide

> 了解 yourcrush 中的各种 Skill 及其用法

---

## 什么是 Skill / What is a Skill

Skill 是 Claude Code 的可扩展功能单元，每个 Skill 负责特定的功能领域。在 yourcrush 中，Skill 用于构建和管理你的暗恋对象角色。

---

## 可用 Skill 一览 / Available Skills Overview

| Skill | 用途 | 命令 |
|-------|------|------|
| `create-crush` | 角色蒸馏 - 从聊天记录或描述创建角色 | `claude skill run create-crush` |
| `create-user` | 用户档案 - 创建你自己的性格档案 | `claude skill run create-user` |
| `day` | 日间写作 - 记录日常生活叙事 | `claude skill run day` |
| `analyze` | 心理分析 - 分析暗恋心理状态 | `claude skill run analyze` |
| `progress` | 进展追踪 - 记录关系发展阶段 | `claude skill run progress` |

---

## 各 Skill 详解 / Detailed Skill Descriptions

### create-crush - 角色蒸馏

**用途**：创建或更新暗恋对象角色

**功能**：
- 从聊天记录提取角色特征
- 手动输入角色信息
- 生成 `memory.md` 和 `persona.md`
- 构建角色对话风格

**使用方式**：
```bash
claude skill run create-crush
```

**输出文件**：
- `crushes/<slug>/memory.md`
- `crushes/<slug>/persona.md`
- `crushes/<slug>/SKILL.md`

---

### create-user - 用户档案

**用途**：创建你自己的性格档案，让 AI 写作时更贴合你的性格

**功能**：
- 录入 MBTI 和性格标签
- 录入说话方式和恋爱观
- 设置写作风格偏好
- 生成 `user/profile.md` 和 `user/writing_style.md`

**使用方式**：
```bash
claude skill run create-user
```

**输出文件**：
- `user/profile.md` - 用户性格主档案
- `user/writing_style.md` - 写作风格偏好

---

### day - 日间写作

**用途**：以 Day 为单位记录日常生活叙事

**功能**：
- 按时间顺序组织叙事
- 三维描写（心理 + 环境 + 动作）
- 生成具有情感深度的文本

**使用方式**：
```bash
claude skill run day
```

**写作格式**：
```markdown
## HH:MM · 事件

[心理描写] [环境描写] [动作描写]

对话内容。
```

---

### confess - 告白模拟器

**用途**：模拟表白场景，预测对方反应

**功能**：
- 评估表白成功率
- 预测对方可能的回应
- 提供心理准备建议
- 分析当前关系是否成熟

**使用方式**：
```bash
claude skill run confess
```

**输出示例**：
- 成功率评估（低/中/高）
- 对方可能的回应类型
- 建议的准备事项

---

### date - 约会模拟器

**用途**：模拟约会场景，预测对方行为

**功能**：
- 模拟不同约会场景
- 预测对方在各种情况下的反应
- 提供约会建议
- 分析约会习惯和偏好

**使用方式**：
```bash
claude skill run date
```

---

### analyze - 暗恋心理分析

**用途**：分析暗恋中的心理状态和行为模式

**功能**：
- 识别当前心理状态
- 分析行为模式
- 找出潜在问题
- 提供理性建议

**使用方式**：
```bash
claude skill run analyze
```

---

### progress - 暗恋进展追踪

**用途**：记录和追踪暗恋关系的发展阶段

**功能**：
- 记录当前阶段
- 追踪进展
- 提供阶段建议
- 理清下一步方向

**使用方式**：
```bash
claude skill run progress
```

**阶段定义**：
1. 初次相遇
2. 建立联系
3. 朋友阶段
4. 暧昧阶段
5. 表白时机

---

## 添加/移除 Skill / Adding/Removing Skills

### 添加 Skill

```bash
# 添加所有可用 Skill
claude skill add ./create-crush
claude skill add ./day
claude skill add ./confess
claude skill add ./date
claude skill add ./analyze
claude skill add ./progress

# 或者添加整个 skills 目录
claude skill add ./.claude/skills
```

### 查看已添加的 Skill

```bash
claude skill list
```

### 移除 Skill

```bash
claude skill remove <skill-name>
```

---

## Skill 工作原理 / How Skills Work

```
用户输入
    ↓
Claude Code 加载 Skill
    ↓
Skill 读取角色数据 (memory.md, persona.md)
    ↓
根据角色特征生成响应
    ↓
输出结果（对话/叙事/分析）
```

**角色数据来源**：
- `memory.md` - 关系记忆和关键回忆
- `persona.md` - 性格特征和说话习惯
- `meta.json` - 基本元数据
- `plans/` - 日程和计划

---

## 数据存储结构 / Data Storage Structure

```
crushes/
└── <slug>/
    ├── memory.md        # 关系记忆
    ├── persona.md       # 人物性格
    ├── meta.json        # 元数据
    ├── SKILL.md         # Skill 配置
    ├── CONTEXT.md       # 压缩上下文
    ├── WEEKDAY.md       # 星期速查表
    ├── PROMPT.md        # Prompt 记录
    ├── memories/
    │   └── chats/       # 聊天记录存档
    ├── plans/           # 日程规划
    └── .intimate_config # 亲密内容开关
```

---

# English Version

# Skill System Guide

> Understanding the various Skills in yourcrush and how to use them

---

## What is a Skill

A Skill is an extensible function unit in Claude Code. Each Skill is responsible for a specific functional area. In yourcrush, Skills are used to build and manage your crush character.

---

## Available Skills Overview

| Skill | Purpose | Command |
|-------|---------|---------|
| `create-crush` | Character distillation - Create from chat logs or description | `claude skill run create-crush` |
| `create-user` | User profile - Create your own personality profile | `claude skill run create-user` |
| `day` | Daily writing - Record daily life narratives | `claude skill run day` |
| `analyze` | Psychology analysis - Analyze crush psychology | `claude skill run analyze` |
| `progress` | Progress tracking - Track relationship stages | `claude skill run progress` |

---

## Detailed Skill Descriptions

### create-crush - Character Distillation

**Purpose**: Create or update a crush character

**Features**:
- Extract character traits from chat logs
- Manual character information input
- Generate `memory.md` and `persona.md`
- Build character dialogue style

**Usage**:
```bash
claude skill run create-crush
```

**Output Files**:
- `crushes/<slug>/memory.md`
- `crushes/<slug>/persona.md`
- `crushes/<slug>/SKILL.md`

---

### create-user - User Profile

**Purpose**: Create your own personality profile for more personalized AI writing

**Features**:
- Enter MBTI and personality traits
- Enter speaking habits and views on love
- Set writing style preferences
- Generate `user/profile.md` and `user/writing_style.md`

**Usage**:
```bash
claude skill run create-user
```

**Output Files**:
- `user/profile.md` - User personality profile
- `user/writing_style.md` - Writing style preferences

---

### day - Daily Writing

**Purpose**: Record daily life narratives in Day units

**Features**:
- Organize narrative by time
- Three-dimensional description (psychology + environment + action)
- Generate emotionally rich text

**Usage**:
```bash
claude skill run day
```

**Writing Format**:
```markdown
## HH:MM · Event

[Psychology] [Environment] [Action]

Dialogue content.
```

---

### analyze - Psychology Analysis

**Purpose**: Analyze crush psychology and behavior patterns

**Features**:
- Identify current psychological state
- Analyze behavior patterns
- Find potential issues
- Provide rational advice

**Usage**:
```bash
claude skill run analyze
```

---

### progress - Progress Tracking

**Purpose**: Record and track relationship development stages

**Features**:
- Record current stage
- Track progress
- Provide stage-specific advice
- Clarify next steps

**Usage**:
```bash
claude skill run progress
```

**Stage Definitions**:
1. First meeting
2. Building connection
3. Friend stage
4. Ambiguous stage
5. Confession timing

---

## Adding/Removing Skills

### Add a Skill

```bash
# Add all available Skills
claude skill add ./create-crush
claude skill add ./day
claude skill add ./confess
claude skill add ./date
claude skill add ./analyze
claude skill add ./progress

# Or add the entire skills directory
claude skill add ./.claude/skills
```

### List Added Skills

```bash
claude skill list
```

### Remove a Skill

```bash
claude skill remove <skill-name>
```

---

## How Skills Work

```
User Input
    ↓
Claude Code Loads Skill
    ↓
Skill Reads Character Data (memory.md, persona.md)
    ↓
Generate Response Based on Character Traits
    ↓
Output Result (dialogue/narrative/analysis)
```

**Character Data Sources**:
- `memory.md` - Relationship memory and key memories
- `persona.md` - Personality traits and speaking habits
- `meta.json` - Basic metadata
- `plans/` - Schedules and plans

---

## Data Storage Structure

```
crushes/
└── <slug>/
    ├── memory.md        # Relationship memory
    ├── persona.md       # Character personality
    ├── meta.json        # Metadata
    ├── SKILL.md         # Skill configuration
    ├── CONTEXT.md       # Compressed context
    ├── WEEKDAY.md       # Weekly schedule
    ├── PROMPT.md        # Prompt records
    ├── memories/
    │   └── chats/       # Chat archives
    ├── plans/           # Schedule planning
    └── .intimate_config # Intimate content toggle
```