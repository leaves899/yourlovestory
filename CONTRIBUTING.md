# 贡献指南 / Contributing Guide

感谢你对本项目的兴趣！我们欢迎各种形式的贡献。

---

## 如何参与

### 报告 Bug
- 通过 GitHub Issues 报告
- 描述清楚问题现象和复现步骤
- 附上环境信息（操作系统、Python 版本等）

### 提出功能建议
- 通过 GitHub Discussions 提出
- 清晰描述你的使用场景
- 解释为什么这个功能有价值

### 提交代码
1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. Push 到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

### 完善文档
- 文档位于 `docs/` 目录
- 请保持中英双语
- 使用清晰的标题层次

---

## 开发环境设置

```bash
# 克隆你的 fork
git clone https://github.com/YOUR_USERNAME/yourcrush.git
cd yourcrush

# 创建虚拟环境（推荐）
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt  # 如果有

# 运行测试
pytest
```

---

## 代码规范

- Python 代码遵循 PEP 8
- 使用 `python -m py_compile` 检查语法
- 提交前运行 lint 检查

```bash
# 本地 lint 检查
python -m py_compile your_script.py
grep -r "欢欢\|huanhuan\|许予柔" . --include="*.py" --include="*.md"
```

---

## 分支管理

- `main` - 主分支，稳定版本
- `feature/*` - 功能分支
- `fix/*` - 修复分支

---

## 问题处理

- 请保持尊重和包容
- 对于复杂问题，请提供最小复现代码
- 及时响应 PR review 意见

---

## English Version

# Contributing Guide

Thank you for your interest in contributing!

## How to Contribute

### Report Bugs
- Use GitHub Issues
- Describe the issue clearly with reproduction steps
- Include environment info (OS, Python version, etc.)

### Suggest Features
- Use GitHub Discussions
- Clearly describe your use case
- Explain why the feature would be valuable

### Submit Code
1. Fork the repository
2. Create your branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

### Improve Documentation
- Docs are in `docs/`
- Keep them bilingual (Chinese + English)
- Use clear heading hierarchy

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/yourcrush.git
cd yourcrush

# Create virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or venv\Scripts\activate  # Windows

# Run tests
pytest
```

## Code Standards

- Python code follows PEP 8
- Check syntax with `python -m py_compile`
- Run lint before committing

```bash
# Local lint
python -m py_compile your_script.py
grep -r "private-info-pattern" . --include="*.py" --include="*.md"
```

## Branch Strategy

- `main` - stable release
- `feature/*` - feature branches
- `fix/*` - bug fix branches

## Code of Conduct

- Be respectful and inclusive
- Provide minimal reproducible examples for complex issues
- Respond promptly to PR review comments