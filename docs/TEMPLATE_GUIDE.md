# 模板使用指南 / Template Guide

> 了解如何基于模板创建新的暗恋对象角色

---

## 目录结构 / Directory Structure

```
crushes/TEMPLATE/
├── memory.md           # 关系记忆模板
├── persona.md          # 人物性格模板
├── meta.json           # 元数据模板
├── SKILL.md            # Skill 配置模板
├── CONTEXT.md          # 压缩上下文模板
├── WEEKDAY.md          # 星期速查表模板
├── PROMPT.md           # Prompt 记录模板
├── INTIMATE_KNOWLEDGE.md # 亲密知识库模板
├── .intimate_config    # 亲密内容开关
├── memories/
│   └── chats/          # 聊天记录目录
└── plans/              # 日程规划目录
```

---

## 各文件用途 / File Purposes

### memory.md - 关系记忆

记录角色的基本信息和关系发展：

```
- 姓名、年龄、职业、性格
- 时间线（初次相遇、关系发展）
- 关键回忆（KEY_MEMORIES）
- 当前关系状态
```

### persona.md - 人物性格

定义角色的性格特征和说话习惯：

```
- 基础信息（年龄、职业、性格）
- 说话习惯（语气词、口头禅）
- 情绪模式（开心、生气、害羞时）
- 行为偏好（喜欢/讨厌的事物）
```

### meta.json - 元数据

角色的基本配置信息：

```json
{
  "name": "{{CHARACTER_NAME}}",
  "nickname": "{{CHARACTER_NICKNAME}}",
  "slug": "{{SLUG}}",
  "gender": "unknown",
  "description": "",
  "intimate": false,
  "created_at": "2024-01-01T00:00:00"
}
```

### SKILL.md - Skill 配置

Skill 的配置文件，定义角色 Skill 的元数据。

### CONTEXT.md - 压缩上下文

存储经过压缩和总结的长期上下文信息。

### WEEKDAY.md - 星期速查表

角色的每周日程安排表。

### PROMPT.md - Prompt 记录

记录创建角色时使用的原始 Prompt 和后续调整。

### INTIMATE_KNOWLEDGE.md - 亲密知识库

亲密偏好设置，需要通过 `toggle_intimate.py` 开启。

---

## 如何基于模板创建新角色 / How to Create a New Character from Template

### 方式一：使用 init_template.py（推荐）

```bash
python scripts/init_template.py \
    --name "示例角色" \
    --nickname "小雪" \
    --slug "xiaoxue"
```

参数说明：
- `--name` - 角色真实姓名
- `--nickname` - 角色昵称（用于称呼）
- `--slug` - URL slug（唯一标识，用于目录名）
- `--description` - 角色描述（可选）
- `--gender` - 性别，可选值：`male`、`female`、`unknown`（默认）

### 方式二：手动复制

```bash
# 1. 复制模板目录
cp -r crushes/TEMPLATE crushes/xiaoxue

# 2. 重命名（如果需要）

# 3. 编辑各文件
cd crushes/xiaoxue/
# 编辑 meta.json、memory.md、persona.md 等
```

---

## init_template.py 使用说明 / init_template.py Usage

### 命令格式

```bash
python scripts/init_template.py --name <name> --nickname <nickname> --slug <slug> [options]
```

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--name` | 是 | 角色真实姓名 |
| `--nickname` | 是 | 角色昵称 |
| `--slug` | 是 | URL slug（唯一标识） |
| `--description` | 否 | 角色描述，默认空字符串 |
| `--gender` | 否 | 性别，可选 `male`、`female`、`unknown`，默认 `unknown` |

### 输出

脚本会创建以下内容：

1. 新角色目录 `crushes/<slug>/`
2. `meta.json` - 包含传入的参数
3. `.intimate_config` - 默认为 `intimate=false`

### 示例

```bash
# 创建男性角色
python scripts/init_template.py \
    --name "示例角色" \
    --nickname "示例昵称" \
    --slug "sample-character" \
    --gender "male" \
    --description "大学同学，土木工程专业"

# 创建女性角色
python scripts/init_template.py \
    --name "王雪" \
    --nickname "小雪" \
    --slug "wangxue" \
    --gender "female"
```

---

## 文件填写方法 / How to Fill in Files

### memory.md

```markdown
# 关系记忆

## {{CHARACTER_NAME}} 的基本信息

- **姓名**：示例角色
- **年龄**：22
- **职业**：土木工程专业学生
- **性格**：内向但温柔，做事认真

## 时间线（RELATIONSHIP_START）

- **初次相遇**：2024年3月，在图书馆
- **关系发展阶段**：普通同学 → 朋友 → 暧昧

## 关键回忆（KEY_MEMORIES）

### 回忆1：图书馆初遇
那天在图书馆找参考书，她也在找同一本书。

### 回忆2：课堂小组作业
分到同一组，合作很顺利。

### 回忆3：雨中共伞
放学时下雨，她主动借我伞。

## 当前关系状态（CURRENT_STATUS）

当前阶段：暧昧
最近互动：她会主动找我聊天
待解决问题：不知道她是否对我有感觉
下一步方向：找机会约她出来
```

### persona.md

```markdown
# 人物性格

## 基础信息

- **年龄**：22
- **职业**：土木工程专业学生
- **性格**：内向但温柔，做事认真

## 说话习惯

### 语气词
嗯、哦、这样啊

### 口头禅
"差不多吧"、"也行"

## 情绪模式

### 开心时
会笑得很腼腆，话变多

### 生气时
沉默，不说话

### 害羞时
低头，耳朵会红

## 行为偏好

### 喜欢的事物
看书、画画、安静的环境

### 讨厌的事物
吵闹、被打断、尴尬
```

---

## 创建后的下一步 / Next Steps After Creation

1. **完善角色信息** - 填充 `memory.md` 和 `persona.md`
2. **添加聊天记录** - 放入 `memories/chats/` 目录
3. **启动日间写作** - `claude skill run day`

---

# English Version

# Template Guide

> Understanding how to create a new crush character from the template

---

## Directory Structure

```
crushes/TEMPLATE/
├── memory.md           # Relationship memory template
├── persona.md          # Character personality template
├── meta.json           # Metadata template
├── SKILL.md            # Skill configuration template
├── CONTEXT.md          # Compressed context template
├── WEEKDAY.md          # Weekly schedule template
├── PROMPT.md           # Prompt records template
├── INTIMATE_KNOWLEDGE.md # Intimate knowledge template
├── .intimate_config    # Intimate content toggle
├── memories/
│   └── chats/          # Chat records directory
└── plans/              # Schedule planning directory
```

---

## File Purposes

### memory.md - Relationship Memory

Records character's basic info and relationship development:

```
- Name, age, occupation, personality
- Timeline (first meeting, relationship development)
- Key memories (KEY_MEMORIES)
- Current relationship status
```

### persona.md - Character Personality

Defines character's personality traits and speaking habits:

```
- Basic info (age, occupation, personality)
- Speaking habits (tone words, catchphrases)
- Emotional patterns (when happy, angry, shy)
- Behavioral preferences (likes/dislikes)
```

### meta.json - Metadata

Basic configuration for the character:

```json
{
  "name": "{{CHARACTER_NAME}}",
  "nickname": "{{CHARACTER_NICKNAME}}",
  "slug": "{{SLUG}}",
  "gender": "unknown",
  "description": "",
  "intimate": false,
  "created_at": "2024-01-01T00:00:00"
}
```

### SKILL.md - Skill Configuration

Configuration file for the Skill, defining character Skill metadata.

### CONTEXT.md - Compressed Context

Stores compressed and summarized long-term context information.

### WEEKDAY.md - Weekly Schedule

Character's weekly schedule table.

### PROMPT.md - Prompt Records

Records original prompts used when creating the character and subsequent adjustments.

### INTIMATE_KNOWLEDGE.md - Intimate Knowledge

Intimate preference settings, requires enabling via `toggle_intimate.py`.

---

## How to Create a New Character from Template

### Method 1: Using init_template.py (Recommended)

```bash
python scripts/init_template.py \
    --name "Xiaoming" \
    --nickname "Xiaoxue" \
    --slug "xiaoxue"
```

Parameters:
- `--name` - Character's real name
- `--nickname` - Character's nickname (for addressing)
- `--slug` - URL slug (unique identifier, used for directory name)
- `--description` - Character description (optional)
- `--gender` - Gender, options: `male`, `female`, `unknown` (default)

### Method 2: Manual Copy

```bash
# 1. Copy template directory
cp -r crushes/TEMPLATE crushes/xiaoxue

# 2. Rename if needed

# 3. Edit files
cd crushes/xiaoxue/
# Edit meta.json, memory.md, persona.md, etc.
```

---

## init_template.py Usage

### Command Format

```bash
python scripts/init_template.py --name <name> --nickname <nickname> --slug <slug> [options]
```

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--name` | Yes | Character's real name |
| `--nickname` | Yes | Character's nickname |
| `--slug` | Yes | URL slug (unique identifier) |
| `--description` | No | Character description, default empty |
| `--gender` | No | Gender, options: `male`, `female`, `unknown`, default `unknown` |

### Output

The script will create:

1. New character directory `crushes/<slug>/`
2. `meta.json` - Contains passed parameters
3. `.intimate_config` - Defaults to `intimate=false`

### Examples

```bash
# Create male character
python scripts/init_template.py \
    --name "Li Ming" \
    --nickname "Xiaoming" \
    --slug "liming" \
    --gender "male" \
    --description "College classmate, civil engineering major"

# Create female character
python scripts/init_template.py \
    --name "Wang Xue" \
    --nickname "Xiaoxue" \
    --slug "wangxue" \
    --gender "female"
```

---

## How to Fill in Files

### memory.md

```markdown
# Relationship Memory

## {{CHARACTER_NAME}}'s Basic Info

- **Name**: Li Ming
- **Age**: 22
- **Occupation**: Civil Engineering Student
- **Personality**: Introverted but gentle, serious about work

## Timeline (RELATIONSHIP_START)

- **First Meeting**: March 2024, at the library
- **Relationship Development**: Classmate → Friend → Ambiguous

## Key Memories (KEY_MEMORIES)

### Memory 1: First Meeting at Library
She was looking for the same reference book I was looking for that day.

### Memory 2: Group Project
We were assigned to the same group, cooperation went smoothly.

### Memory 3: Sharing Umbrella in Rain
It rained after class, she proactively lent me her umbrella.

## Current Relationship Status (CURRENT_STATUS)

Current Stage: Ambiguous
Recent Interaction: She takes initiative to chat with me
Unresolved Issue: Don't know if she has feelings for me
Next Direction: Find opportunity to ask her out
```

### persona.md

```markdown
# Character Personality

## Basic Info

- **Age**: 22
- **Occupation**: Civil Engineering Student
- **Personality**: Introverted but gentle, serious about work

## Speaking Habits

### Tone Words
En, Oh, I see

### Catchphrases
"Maybe", "That's okay too"

## Emotional Patterns

### When Happy
Smiles shyly, talks more

### When Angry
Goes silent, doesn't speak

### When Shy
Looks down, ears turn red

## Behavioral Preferences

### Likes
Reading, drawing, quiet environment

### Dislikes
Noise, being interrupted, awkwardness
```

---

## Next Steps After Creation

1. **Complete Character Info** - Fill in `memory.md` and `persona.md`
2. **Add Chat Records** - Place in `memories/chats/` directory
3. **Start Day Writing** - `claude skill run day`
