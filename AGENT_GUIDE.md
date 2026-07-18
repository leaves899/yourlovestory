# yourcrush Agent 使用指南

## 项目概述

yourcrush 是一个模拟恋爱叙事写作工具链，用于将暗恋对象蒸馏成 AI Skill 并生成叙事文本。

**仓库名：** yourlovestory
**许可证：** MIT + CONTENT_POLICY.md

---

## 一键部署命令

将以下内容复制给 agent，即可自动完成部署：

```bash
git clone https://github.com/leaves899/yourlovestory.git && cd yourlovestory && claude skill add ./day && claude skill run create-crush
```

**说明：** 这条命令会依次执行：克隆仓库 → 进入目录 → 添加 day skill → 启动角色创建流程。

---

## 部署方式

### 方式一：本地运行（推荐）

**前置要求：** Claude Code CLI + Python 3.9+

```bash
# 1. 克隆仓库
git clone https://github.com/leaves899/yourlovestory.git
cd yourlovestory

# 2. 验证安装
claude skill list | grep -i crush

# 3. 创建角色
claude skill run create-crush

# 4. 启动日间写作
claude skill run day
```

### 方式二：Docker 部署

```bash
# 构建并前台运行
bash docker-run.sh

# 后台运行
docker-compose up -d

# 进入容器
docker-compose exec yourcrush bash

# 停止
docker-compose down
```

**Docker 配置（docker-compose.yml）：**
- 服务名：`yourcrush`
- 数据卷：`./crushes:/app/crushes`（持久化角色数据）
- 模板只读：`./crushes/TEMPLATE:/app/crushes/TEMPLATE:ro`

### 方式三：GitHub Actions CI/CD

触发条件：`push` 或 `pull_request` 到 `main` 分支

**CI Jobs：**

| Job | 功能 |
|-----|------|
| `lint` | 检查敏感信息（私密标记 A、私密标记 B、私密标记 C、Day N）和 Python 语法 |
| `test-scripts` | 测试 toggle_intimate.py --help 和 init_template.py --help |
| `markdown-lint` | 检查 docs/*.md 格式（空标题、尾随空格、README 结构） |

---

## 目录结构

```
yourcrush/
├── .claude/skills/           # Claude Code Skills（5个）
│   ├── create-crush/         # 角色蒸馏工具链
│   │   ├── tools/            # Python 解析器（14个）
│   │   └── prompts/          # Prompt 模板（6个）
│   ├── create-user/           # 用户档案创建
│   ├── day/                  # 日常写作
│   ├── onboard/              # 新手引导
│   └── progress/             # 进展追踪
├── crushes/                  # 角色数据目录
│   └── TEMPLATE/             # 空白角色模板
├── user/                     # 用户性格档案
├── scripts/                  # 辅助脚本（3个）
├── viewer/                   # Day 阅读器（单文件 HTML）
└── docs/                     # 项目文档
```

---

## 核心命令

| 操作 | 命令 |
|------|------|
| 创建角色 | `claude skill run create-crush` |
| 日间写作 | `/day <日期描述>` |
| 进展追踪 | `/progress <slug>` |
| 新手引导 | `/onboard` |
| 用户档案 | `claude skill run create-user` |

---

## 完整工作流程

```
1. /onboard                    # 检查当前状态
2. /create-user               # 创建用户档案（State 0）
3. /create-crush               # 创建角色（State 1-2）
4. /day 上周五，我们第一次约会  # 开始写作（State 3+）
5. /progress {{slug}}          # 查看进展
```

---

## 角色数据结构

`crushes/<slug>/` 目录下：

| 文件 | 说明 |
|------|------|
| `meta.json` | 元数据（姓名、昵称、slug、性别） |
| `persona.md` | 人物性格（5层结构） |
| `memory.md` | 关系记忆与时间线 |
| `INTIMATE_KNOWLEDGE.md` | 亲密知识库（默认关闭） |
| `.intimate_config` | 亲密内容开关（`intimate=false` 默认） |
| `memories/chats/day*.md` | Day 叙事文件 |

---

## 亲密内容管理

亲密内容模块（INTIMATE_KNOWLEDGE.md）**默认关闭**。

```bash
python scripts/toggle_intimate.py --slug "<slug>" --enable   # 启用
python scripts/toggle_intimate.py --slug "<slug>" --disable  # 禁用
python scripts/toggle_intimate.py --slug "<slug>" --status   # 查看状态
```

---

## Day 阅读器

直接在浏览器打开 `viewer/index.html`，点击「选择 crushes 目录」即可浏览所有 Day 叙事。无需服务器。

---

## 写作标准

1. **三维描写**：心理 + 环境 + 动作，自然融入行文
2. **时间格式**：`## HH:MM · 事件`
3. **禁止破折号**：使用逗号或句号替代「——」
4. **禁止过度省略号**：仅在真正需要停顿时使用「...」
5. **对话格式**：使用「」符号
6. **Day 结尾**：包含情感总结、期待感、留白

---

## 禁止事项

- 禁止在代码中添加真实人物信息（如私密标记 A、私密标记 B、私密标记 C）
- 禁止硬编码 Day 数字或具体日期
- 禁止使用破折号「——」
- 禁止过度使用省略号「...」

---

## 测试与验证

```bash
# 1. Python 语法检查
python -m py_compile scripts/*.py

# 2. 私密信息检测
grep -r "<private-name-[a-c]>" . --include="*.py" --include="*.md"

# 3. CI 检查（本地模拟）
docker-compose run --rm yourcrush pytest
```

---

## 辅助脚本

| 脚本 | 用途 |
|------|------|
| `scripts/init_template.py` | 基于模板初始化角色 |
| `scripts/toggle_intimate.py` | 开启/关闭亲密内容模块 |
| `scripts/import_demo.py` | 导入示例角色 |

---

## 关键文件

| 文件 | 说明 |
|------|------|
| `CLAUDE.md` | 项目开发指南 |
| `CONTRIBUTING.md` | 贡献指南 |
| `CONTENT_POLICY.md` | 内容使用政策 |
| `docs/WRITING_STANDARDS.md` | 写作标准详细说明 |
| `docs/QUICK_START.md` | 快速开始指南 |
| `Dockerfile` | Docker 镜像定义 |
| `docker-compose.yml` | Docker Compose 配置 |
