# 快速入门指南 / Quick Start Guide

> 帮助你快速上手 yourcrush

---

## 前置要求 / Prerequisites

- **Claude Code** - 已安装并配置
  - [安装指南](https://docs.claude.com/claude-code/intro.html)
- **Python 3.9+** - 仅解析器需要
  - 检查版本：`python --version`

---

## 安装步骤 / Installation

```bash
# 1. 克隆仓库
git clone https://github.com/yourusername/yourcrush.git
cd yourcrush

# 2. 添加 Skill 到 Claude Code
claude skill add ./day

# 3. 验证安装
claude skill list | grep -i crush
```

---

## 创建第一个角色 / Create Your First Character

### 方式一：使用交互式创建流程（推荐）

```bash
claude skill run create-crush
```

系统会引导你完成以下步骤：
1. 输入角色花名（如"小雪"）
2. 填写基本信息（年龄、职业、性格）
3. 描述你们的相识过程
4. 添加关键回忆

### 方式二：基于模板创建

```bash
# 使用 init_template.py 脚本
python scripts/init_template.py \
    --name "示例角色" \
    --nickname "小雪" \
    --slug "xiaoxue"

# 然后手动编辑生成的文件
cd crushes/xiaoxue/
# 编辑 memory.md、persona.md 等文件
```

---

## 如何开始写 Day / How to Start Writing a Day

Day 是你与暗恋对象日常生活叙事的基本单位。

```bash
# 启动日间写作 Skill
claude skill run day
```

写作流程：
1. **输入时间** - 格式 `HH:MM`，如 `09:00`
2. **描述场景** - 心理描写 + 环境 + 动作
3. **添加互动** - 与角色的对话和行动
4. **使用时间标签** - `## HH:MM · 事件`

---

## 常见问题 / FAQ

### Q: 提示 "Skill not found"

确保你在项目根目录运行命令，并已添加 Skill：
```bash
cd yourcrush
claude skill add ./day
claude skill list
```

### Q: 如何导入聊天记录？

目前支持手动描述角色特征。自动导入功能开发中。

### Q: 数据存储在哪里？

所有数据存储在本地 `crushes/<slug>/` 目录下，包括：
- `memory.md` - 关系记忆
- `persona.md` - 人物性格
- `meta.json` - 元数据
- `plans/` - 日程规划

### Q: 如何开启亲密内容模块？

```bash
echo "intimate=true" > crushes/xiaoxue/.intimate_config
```

### Q: 如何切换角色？

```bash
cd crushes/<new_slug>/
claude skill run day
```

---

## 下一步 / Next Steps

- 阅读 [SKILL_SYSTEM.md](./SKILL_SYSTEM.md) - 了解所有 Skill 功能
- 阅读 [WRITING_STANDARDS.md](./WRITING_STANDARDS.md) - 掌握写作规范
- 阅读 [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md) - 了解模板结构

---

# English Version

# Quick Start Guide

> Help you get started with yourcrush quickly

---

## Prerequisites

- **Claude Code** - Installed and configured
  - [Installation Guide](https://docs.claude.com/claude-code/intro.html)
- **Python 3.9+** - Only needed for the parser
  - Check version: `python --version`

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/yourcrush.git
cd yourcrush

# 2. Add Skills to Claude Code
claude skill add ./day

# 3. Verify installation
claude skill list | grep -i crush
```

---

## Create Your First Character

### Method 1: Interactive Creation (Recommended)

```bash
claude skill run create-crush
```

The system will guide you through:
1. Enter the character's nickname (e.g., "Xiaoxue")
2. Fill in basic info (age, occupation, personality)
3. Describe how you met
4. Add key memories

### Method 2: From Template

```bash
# Use init_template.py script
python scripts/init_template.py \
    --name "Xiaoming" \
    --nickname "Xiaoxue" \
    --slug "xiaoxue"

# Then manually edit the generated files
cd crushes/xiaoxue/
# Edit memory.md, persona.md, etc.
```

---

## How to Start Writing a Day

Day is the basic unit for writing daily life narratives with your crush.

```bash
# Start day writing skill
claude skill run day
```

Writing flow:
1. **Input time** - Format `HH:MM`, e.g., `09:00`
2. **Describe scene** - Psychology + environment + action
3. **Add interactions** - Dialogue and actions with the character
4. **Use time tags** - `## HH:MM · Event`

---

## FAQ

### Q: "Skill not found" error

Make sure you're in the project root and have added the skill:
```bash
cd yourcrush
claude skill add ./day
claude skill list
```

### Q: How to import chat logs?

Currently only manual character description is supported. Automatic import is under development.

### Q: Where is data stored?

All data is stored locally in `crushes/<slug>/`:
- `memory.md` - Relationship memory
- `persona.md` - Character personality
- `meta.json` - Metadata
- `plans/` - Schedule planning

### Q: How to enable intimate content?

```bash
echo "intimate=true" > crushes/xiaoxue/.intimate_config
```

### Q: How to switch characters?

```bash
cd crushes/<new_slug>/
claude skill run day
```

---

## Next Steps

- Read [SKILL_SYSTEM.md](./SKILL_SYSTEM.md) - Learn all Skill features
- Read [WRITING_STANDARDS.md](./WRITING_STANDARDS.md) - Master writing standards
- Read [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md) - Understand template structure
