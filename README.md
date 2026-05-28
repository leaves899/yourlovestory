# yourcrush / 恋爱日记

> 模拟表白成功后和 crush 的幸福生活，记录你们一起的日子

*把那些心动瞬间、甜蜜日常、拌嘴吵架，都变成可以反复阅读的故事。*

[English README](#english-version) | [快速开始](#快速开始) | [文档](docs/) | [贡献](CONTRIBUTING.md)

---

## 你还记得表白成功那天吗？

是她答应那一刻心跳几乎停掉的狂喜，是第一次牵手时掌心出汗的紧张，是意识到「嗯，她是我女朋友了」时的难以置信。

**yourcrush** 把这些都记录下来——不是偶像剧，而是你们真实的、有点傻的、让人反复心动的日常。

---

## 核心功能

### 角色创建 / Character Creation
输入你们的故事背景、她的性格、你们的相处模式，生成专属 AI Skill。

### 日常叙事 / Daily Writing
以 Day 为单位记录你们的生活——不是流水账，而是有心理描写、有温度的叙事文本。

### 进度追踪 / Progress Tracking
记录你们关系的发展脉络，从确定关系到一起生活。

---

## 快速开始

### 前置要求

- [Claude Code](https://docs.claude.com/claude-code/intro.html) 已安装
- Python 3.9+（仅解析器需要）

### 安装

```bash
# 克隆仓库
git clone https://github.com/leaves899/yourlovestory.git
cd yourlovestory

# 安装 Claude Code Skill
claude skill add ./day
```

### 创建你的第一个故事

```bash
# 启动交互式创建流程
claude skill run create-crush
```

### 试用 Demo / Try the Demo

不想从零开始？导入示例角色看看效果：

```bash
python scripts/import_demo.py
```

导入后查看 `crushes/example/` 下的文件，了解角色数据结构和 Day 写作格式。如需重新导入，使用 `python scripts/import_demo.py --force`。

---

## 目录结构

```
yourcrush/
├── .claude/skills/       # Claude Code Skills
│   ├── onboard/          # 新手引导
│   ├── create-crush/     # 角色蒸馏
│   ├── create-user/      # 用户档案
│   ├── day/              # 日常写作
│   └── progress/         # 进度追踪
├── crushes/              # 角色数据
│   └── TEMPLATE/         # 空白模板
├── docs/                 # 文档
├── scripts/              # 辅助脚本
└── examples/             # 示例数据
```

---

## 隐私声明

1. **所有数据存储在本地**——我们不收集任何数据
2. 角色信息只用于生成你的私人 Skill，**不会**上传到任何服务器
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

致谢：本项目参考了 [crush-skills](https://github.com/xiaoheizi8/crush-skills) 的设计思路与实现方式，感谢其开源贡献。

---

<p align="center">
  <sub>Made with ❤️ for anyone who is in love</sub>
</p>

---

## English Version

# yourcrush

> Simulate the happy life with your crush after the confession, record your days together

*Turn those heart-fluttering moments, sweet daily life, and playful quarrels into stories you can read over and over.*

---

### Core Features

- **Character Creation** — Input your story background, her personality, your interaction patterns to create a unique AI Skill
- **Daily Writing** — Record your life together with psychological depth and narrative warmth
- **Progress Tracking** — Track the development of your relationship

### Quick Start

```bash
git clone https://github.com/leaves899/yourlovestory.git
cd yourlovestory
claude skill add ./day
claude skill run create-crush
```

### Privacy

All data stays local. No server, no tracking, no collection.

### License

MIT — see [LICENSE](LICENSE)

Acknowledgments: This project references [crush-skills](https://github.com/xiaoheizi8/crush-skills) for design ideas and implementation, thanks to their open source contribution.