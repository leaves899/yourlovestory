# yourcrush

基于 Pi Agent SDK 的恋爱日记 Electron 桌面应用

## 功能特性

- **日常写作**：生成、编辑、查看日常写作
- **碎片日记**：记录、查看、编辑碎片日记
- **角色管理**：创建、编辑、删除角色
- **设置**：配置应用设置
- **帮助**：提供帮助文档
- **更新**：检查更新、安装更新

## 技术栈

- **后端框架**：Pi Agent SDK 0.78.0
- **前端框架**：React 18
- **类型系统**：TypeScript 5.x
- **构建工具**：Vite 5.x
- **UI 组件库**：Chakra UI 3.x
- **桌面框架**：Electron 28.x
- **测试框架**：Jest + Playwright

## 安装

```bash
# 克隆项目
git clone https://github.com/yourcrush/yourcrush.git

# 进入项目目录
cd yourcrush

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

## 使用

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 打包
npm run package

# 测试
npm run test

# 端到端测试
npm run test:e2e
```

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

## 开发指南

### 代码规范

- 使用 TypeScript 编写代码
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化

### 测试规范

- 使用 Jest 进行单元测试
- 使用 Playwright 进行端到端测试
- 测试覆盖率不低于 80%

### 提交规范

- 使用 Conventional Commits 规范
- 提交信息格式：`<type>(<scope>): <subject>`

## 许可证

MIT License
