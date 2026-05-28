# yourcrush / 暗恋对象

> 把暗恋对象蒸馏成 AI 写作技能，生成你和暗恋对象可能的生活

*把 ta 聊天记录里的语气、习惯、那些没说出口的话，变成一个会回你消息的 AI。*

[English README](#english-version) | [快速开始](#快速开始) | [文档](docs/) | [贡献](CONTRIBUTING.md)

---

## 你还记得那个不敢表白的人吗？

暗恋是什么感觉？

是打完「在干嘛」之后盯着对话框等半天的紧张，是把每条消息都反复看三遍的雀跃，是明明很喜欢却只能装作朋友的克制。

**yourcrush** 把这些都记录下来，变成一个会回你消息的 AI——不是爽文式的完美情人，而是那个真实的、有点作的、让你又爱又恨的 ta。

---

## 核心功能

### 角色蒸馏 / Character Distillation
导入微信/QQ 聊天记录（或手动描述），生成专属 AI Skill，保留 ta 的说话语气、性格特点、你们之间的独特回忆。

### 日常叙事 / Daily Writing
以 Day 为单位记录你们的生活——不是流水账，而是有心理描写、有温度的叙事文本。

### 对话模拟 / Dialogue Simulation
在关键场景（告白、约会、冲突）前先「彩排」一遍，看看 ta 会怎么回应。

### 暗恋心理分析 / Psychology Analysis
帮你理清这段关系的现状、卡点、和下一步可行的方向。

---

## 快速开始

### 前置要求

- [Claude Code](https://docs.claude.com/claude-code/intro.html) 已安装
- Python 3.9+（仅解析器需要）

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/yourcrush.git
cd yourcrush

# 安装 Claude Code Skill（如果你还没有 crush skill）
claude skill add ./day
```

### 创建你的第一个角色

```bash
# 启动交互式创建流程
claude skill run create-crush
```

系统会问你几个问题（花名、基本信息、性格画像），没有聊天记录也能直接开始。

---

## 目录结构

```
yourcrush/
├── .claude/skills/       # Claude Code Skills
│   ├── create-crush/     # 角色蒸馏工具
│   ├── day/              # 日常写作
│   ├── confess/          # 告白模拟器
│   ├── date/             # 约会模拟器
│   └── analyze/          # 心理分析
├── crushes/              # 角色数据
│   └── TEMPLATE/         # 空白模板
├── docs/                 # 文档
└── scripts/              # 辅助脚本
```

---

## 隐私声明

1. **所有数据存储在本地**——我们不收集任何数据
2. 聊天记录只用于生成你的私人 Skill，**不会**上传到任何服务器
3. 导出的 Skill 文件是你个人的财产
4. 如果你选择开源，风险自负

详见 [CONTENT_POLICY.md](CONTENT_POLICY.md)

---

## 参与贡献

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

- 报告 Bug → GitHub Issues
- 提出功能建议 → GitHub Discussions
- 提交代码 → Pull Request

---

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

---

## Star 趋势

[![Star趋势](https://api.star-history.com/svg?repos=yourusername/yourcrush&type=Timeline)](https://star-history.com/#yourusername/yourcrush&Timeline)

---

<p align="center">
  <sub>Made with ❤️ for anyone who has ever had a crush</sub>
</p>

---

## English Version

# yourcrush

> Distill your crush into an AI-powered writing skill, generate the life you could have together

*Turn their chat habits, quirks, and unspoken words into an AI that actually talks like them.*

---

### Core Features

- **Character Distillation** — Import chat logs (WeChat/QQ) or describe manually to create a unique AI Skill
- **Daily Writing** — Record your life together with psychological depth and narrative warmth
- **Dialogue Simulation** — Rehearse confessions, dates, and difficult conversations
- **Psychology Analysis** — Get clarity on relationship status, blockers, and next steps

### Quick Start

```bash
git clone https://github.com/yourusername/yourcrush.git
cd yourcrush
claude skill add ./day
claude skill run create-crush
```

### Privacy

All data stays local. No server, no tracking, no collection.

### License

MIT — see [LICENSE](LICENSE)