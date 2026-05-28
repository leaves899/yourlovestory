# CLAUDE.md — yourcrush 项目开发指南

## 项目概述

yourcrush 是一个开源的模拟恋爱叙事写作工具链，用于将暗恋对象蒸馏成 AI Skill，并生成叙事文本。

**仓库名：** yourcrush
**许可证：** MIT + CONTENT_POLICY.md
**文档语言：** 中英双语

---

## 目录结构

```
yourcrush/
├── .claude/skills/           # Claude Code Skills
│   ├── create-crush/        # 角色蒸馏工具链
│   │   ├── tools/           # Python 解析器（22个）
│   │   └── prompts/         # Prompt 模板（11个）
│   ├── create-user/         # 用户档案创建
│   ├── day/                 # 日常写作 Skill
│   ├── analyze/             # 心理分析
│   └── progress/            # 进展追踪
├── crushes/                 # 角色数据
│   └── TEMPLATE/            # 空白角色模板
├── user/                    # 用户性格档案
│   ├── profile.md          # 用户性格主档案
│   └── writing_style.md    # 写作风格偏好
├── docs/                    # 项目文档（中英双语）
├── scripts/                 # 辅助脚本
│   ├── init_template.py     # 初始化角色模板
│   └── toggle_intimate.py  # 亲密内容开关
└── examples/                # 工具使用示例（待添加）
```

---

## 依赖

- **运行时：** Claude Code CLI + Python 3.9+
- **可选：** Docker（用于容器化部署）
- **API：** Claude API Key（用于调用模型）

---

## 工作流程

### 1. 创建角色（create-crush）

```bash
claude skill run create-crush
# 或
python scripts/init_template.py --name "角色名" --nickname "昵称" --slug "slug"
```

### 2. 写作（day）

```bash
claude skill run day
# 在对话中：/day 上周五，我们第一次约会
```

### 3. 亲密内容管理

```bash
# 启用亲密模块
python scripts/toggle_intimate.py --slug "角色slug" --enable

# 查看状态
python scripts/toggle_intimate.py --slug "角色slug" --status
```

---

## 开发规范

### 代码风格

- Python：PEP 8
- Markdown：中文在前，English version 在后
- 变量命名：`snake_case`
- 常量：`UPPER_SNAKE_CASE`
- 占位符：`{{VARIABLE_NAME}}`

### 禁止事项

- 禁止在代码中添加真实人物信息（小明、xiaoming、李薇）
- 禁止硬编码 Day 数字或具体日期
- 禁止使用破折号「——」（写作标准）
- 禁止过度使用省略号「...」（写作标准）

### 私密信息检测

提交前运行：
```bash
grep -r "小明\|xiaoming\|李薇" . --include="*.py" --include="*.md"
```

应返回空（CONTRIBUTING.md 和 ci.yml 中的检测模式除外）。

---

## Skill 开发

### 添加新 Skill

1. 在 `.claude/skills/` 下创建目录
2. 创建 `SKILL.md` 文件
3. 使用 `{{VARIABLE}}` 格式标记占位符
4. 添加中英双语说明

### SKILL.md 模板

```markdown
# Skill Name / 技能名

## 功能 | Function
简述功能

## 使用方法 | How to Use
```
/command {{slug}}
```

## 工作流程 | Workflow
1. 读取上下文
2. 分析
3. 输出

## 注意事项 | Notes
- 禁止包含真实人物信息
```

---

## 亲密内容处理

亲密内容模块（INTIMATE_KNOWLEDGE.md）**默认关闭**。

- 用户必须通过 `toggle_intimate.py --enable` 显式启用
- `SKILL.md` 检查 `.intimate_config` 配置决定是否加载
- 配置缺失时默认为不加载

---

## 测试

```bash
# Python 语法检查
python -m py_compile scripts/*.py

# CI 检查
# 详见 .github/workflows/ci.yml
```

---

## 贡献指南

参见 [CONTRIBUTING.md](CONTRIBUTING.md)

---

## 许可证

本项目采用 MIT 许可证。参见 [LICENSE](LICENSE)

内容使用政策：[CONTENT_POLICY.md](CONTENT_POLICY.md)