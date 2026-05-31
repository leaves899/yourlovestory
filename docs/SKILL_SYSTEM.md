# Skill 系统说明 / Skill System Guide

> 了解 yourcrush 中的各种 Skill 及其用法

---

## 什么是 Skill / What is a Skill

Skill 是 Claude Code 的可扩展功能单元，每个 Skill 负责特定的功能领域。在 yourcrush 中，Skill 用于构建和管理你的暗恋对象角色。

---

## 可用 Skill 一览 / Available Skills Overview

| Skill | 用途 | 命令 |
|-------|------|------|
| `onboard` | 新手引导 - 检测进度并给出下一步指引 | `/onboard` |
| `create-crush` | 角色蒸馏 - 从聊天记录或描述创建角色 | `/create-crush` |
| `create-user` | 用户档案 - 创建你自己的性格档案 | `/create-user` |
| `day` | 日间写作 - 记录日常生活叙事 | `/day` |
| `progress` | 进展追踪 - 记录关系发展阶段 | `/progress` |

---

## 各 Skill 详解 / Detailed Skill Descriptions

### onboard - 新手引导

**用途**：检测当前进度，给出个性化的下一步指引

**功能**：
- 自动检测用户档案、角色、Day 文件状态
- 根据状态输出对应的引导
- 帮助新用户了解完整流程

**使用方式**：
```
/onboard
```

**状态检测**：
- 无用户档案 → 推荐 `/create-user`
- 有档案无角色 → 推荐 `/create-crush`
- 有角色无 Day → 推荐 `/day`
- 有 Day → 显示进度，推荐继续写作或追踪进展

---

### create-crush - 角色蒸馏

**用途**：创建或更新暗恋对象角色

**功能**：
- 从聊天记录提取角色特征
- 手动输入角色信息
- 生成 `memory.md` 和 `persona.md`
- 构建角色对话风格

**使用方式**：
```
/create-crush
```

**输出文件**：
- `crushes/<slug>/memory.md`
- `crushes/<slug>/persona.md`
- `crushes/<slug>/meta.json`

---

### create-user - 用户档案

**用途**：创建你自己的性格档案，让 AI 写作时更贴合你的性格

**功能**：
- 录入 MBTI 和性格标签
- 录入说话方式和恋爱观
- 设置写作风格偏好
- 生成 `user/profile.md` 和 `user/writing_style.md`

**使用方式**：
```
/create-user
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
```
/day
```

**写作格式**：
```markdown
## HH:MM · 事件

[心理描写] [环境描写] [动作描写]

对话内容。
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
```
/progress
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
claude skill add ./create-user
claude skill add ./day
claude skill add ./progress
claude skill add ./onboard

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
| `onboard` | Onboarding - Detect progress and guide next steps | `/onboard` |
| `create-crush` | Character distillation - Create from chat logs or description | `/create-crush` |
| `create-user` | User profile - Create your own personality profile | `/create-user` |
| `day` | Daily writing - Record daily life narratives | `/day` |
| `progress` | Progress tracking - Track relationship stages | `/progress` |

---

## Detailed Skill Descriptions

### onboard - Onboarding Guide

**Purpose**: Detect current progress and provide personalized next-step guidance

**Features**:
- Auto-detect user profile, crush, and Day file status
- Output guidance based on current state
- Help new users understand the full workflow

**Usage**:
```
/onboard
```

---

### create-crush - Character Distillation

**Purpose**: Create or update a crush character

**Features**:
- Extract character traits from chat logs
- Manual character information input
- Generate `memory.md` and `persona.md`
- Build character dialogue style

**Usage**:
```
/create-crush
```

**Output Files**:
- `crushes/<slug>/memory.md`
- `crushes/<slug>/persona.md`
- `crushes/<slug>/meta.json`

---

### create-user - User Profile

**Purpose**: Create your own personality profile for more personalized AI writing

**Features**:
- Enter MBTI and personality traits
- Enter speaking habits and views on love
- Set writing style preferences
- Generate `user/profile.md` and `user/writing_style.md`

**Usage**:
```
/create-user
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
```
/day
```

**Writing Format**:
```markdown
## HH:MM · Event

[Psychology] [Environment] [Action]

Dialogue content.
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
```
/progress
```

**Stage Definitions**：
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
claude skill add ./create-user
claude skill add ./day
claude skill add ./progress
claude skill add ./onboard

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
    ├── CONTEXT.md       # Compressed context
    ├── WEEKDAY.md       # Weekly schedule
    ├── PROMPT.md        # Prompt records
    ├── memories/
    │   └── chats/       # Chat archives
    ├── plans/           # Schedule planning
    └── .intimate_config # Intimate content toggle
```