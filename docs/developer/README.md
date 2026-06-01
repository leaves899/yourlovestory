# 开发者文档

## 项目概述

yourcrush 是一个基于 Pi Agent SDK 的恋爱日记 Electron 桌面应用。

## 技术栈

- **后端框架**：Pi Agent SDK 0.78.0
- **前端框架**：React 18
- **类型系统**：TypeScript 5.x
- **构建工具**：Vite 5.x
- **UI 组件库**：Chakra UI 3.x
- **桌面框架**：Electron 28.x
- **测试框架**：Jest + Playwright

## 项目结构

```
yourcrush/
├── src/
│   ├── main/                    # Electron 主进程
│   ├── renderer/                # Electron 渲染进程
│   ├── agent/                   # Pi Agent SDK
│   └── scripts/                 # Python 脚本
├── tests/                       # 测试文件
├── docs/                        # 文档
├── scripts/                     # 脚本
├── package.json                 # 依赖配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
├── electron-builder.yml         # Electron 构建配置
├── .env.example                 # 环境变量示例
├── .gitignore                   # Git 忽略规则
├── LICENSE                      # MIT 许可证
└── README.md                    # 项目说明
```

## 开发环境

### 前置条件

- Node.js 18+
- Python 3.9+
- Git

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run package
```

### 测试

```bash
npm run test
```

### 端到端测试

```bash
npm run test:e2e
```

## 代码规范

### TypeScript

- 使用 TypeScript 编写代码
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化

### Python

- 遵循 PEP 8 规范
- 使用类型注解
- 使用 pytest 进行测试

## 测试规范

### 单元测试

- 使用 Jest 进行单元测试
- 测试覆盖率不低于 80%

### 集成测试

- 使用 Jest 进行集成测试
- 测试覆盖率不低于 70%

### 端到端测试

- 使用 Playwright 进行端到端测试
- 测试覆盖率不低于 60%

## 提交规范

使用 Conventional Commits 规范：

```
<type>(<scope>): <subject>

类型：feat、fix、docs、style、refactor、test、chore
范围：可选，影响的模块
主题：简洁描述变更
```

示例：

```
feat: 添加日常写作功能
fix: 修复碎片日记显示问题
docs: 更新 README 文档
style: 格式化代码
refactor: 重构日常写作模块
test: 添加日常写作单元测试
chore: 更新依赖
```

## 发布流程

1. 更新版本号
2. 更新 CHANGELOG.md
3. 提交代码
4. 创建 Git 标签
5. 构建和打包
6. 发布到 GitHub Releases

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码
4. 创建 Pull Request
5. 等待代码审查
6. 合并代码

## 联系我们

如果你有任何问题或建议，请联系我们：

- 邮箱：dev@yourcrush.com
- GitHub：https://github.com/yourcrush/yourcrush
