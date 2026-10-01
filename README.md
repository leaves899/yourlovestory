# yourcrush

> 本地优先的恋爱日记与长篇创作桌面应用。

yourcrush 将日常恋爱记录、碎片日记和长篇小说工作台放在同一个 Electron 应用中。你可以维护角色与世界观，整理素材和大纲，调用自己配置的模型生成章节，并保留完整的审核、版本和修订过程。

项目当前仍在持续迭代中。旧的 Crush、Day 和 Fragment 功能继续保留，新功能集中在长篇创作工作台。

[GitHub 仓库](https://github.com/leaves899/yourlovestory) | [项目文档](docs/) | [版本策略](docs/release/versioning.md) | [Changelog](CHANGELOG.md) | [发布流程](docs/release/release-process.md) | [安全说明](SECURITY.md) | [MIT 许可证](LICENSE)

## 发布状态

项目当前为 **Alpha**，尚未达到 Stable。应用版本只取自 `package.json.version`；
`package-lock.json`、Git tag 和 Release metadata 由自动检查保持一致。真实 packaged
smoke 已在 Windows、Linux 和 macOS CI 中通过并接入发布门禁。仓库提供受保护签名、
notarization 和产物完整性流程；真实证书、Apple 凭据及签名 environment 尚未配置，
是签名分发的 external blocker，当前不能声明 Stable，详见[签名说明](docs/release/signing.md)。

当前 Alpha 只支持 `package.json` 指定的最新预发布版本，不承诺旧预发布版本的长期
维护。下载构建产物时，应同时下载 `SHA256SUMS.txt`，按
[发布流程中的验证说明](docs/release/release-process.md#产物验证)核对 SHA-256。

## 功能概览

### 长篇创作工作台

- 多项目创建、切换、更新和删除保护
- 项目配置、角色、世界观、组织和关系管理
- Fragment 故事素材库，支持筛选和按项目组织
- 卷骨架、卷章纲和章节大纲
- 大纲草稿、确认、锁定、解锁和版本冲突检查
- 章节生成任务，支持流式输出、任务阶段、日志、取消和恢复
- 卷大纲、章节正文、摘要和事实核查共用 Context Compiler，提供来源追踪、可复现选择和显式预算错误
- 章节摘要、事实核查、手动审核和可选自动确认
- 章节版本保存、叙事记忆和伏笔管理
- 段落级 Block 修订、章节润色和差异对比
- Pi Agent 创作助手、会话记录和写入操作确认门禁

### 兼容入口

旧功能仍可从应用中访问：

- 日常叙事首页
- Fragment 碎片日记
- Crush 角色资料
- 关系进度
- 通用 Agent 助手
- 设置、帮助和更新页面

## 技术栈与架构

- TypeScript 全量实现，不依赖 Python 运行时或 Python 桥接
- Electron 28
- React 18、React Router、Chakra UI
- Zustand 状态管理
- Pi Agent 0.78 与 TypeBox
- better-sqlite3 和 SQLite
- Vite、Jest、Playwright、electron-builder

应用边界如下：

~~~mermaid
flowchart LR
  R["React Renderer"] --> P["Preload<br/>Typed IPC"]
  P --> M["Electron Main"]
  M --> S["Shared Domain Services"]
  S --> D["SQLite<br/>userData/data/yourcrush.sqlite"]
  M --> A["Pi Agent"]
  A --> S
  A --> L["用户配置的模型接口"]
  M --> W["Worker Threads<br/>章节 diff / 长输入上下文编译"]
~~~

渲染进程只通过 preload 暴露的类型化 IPC 访问功能，不能直接访问 SQLite。主进程负责数据库、IPC、任务和 Agent，Agent 工具与 IPC handler 共用 shared 领域服务。
CPU Worker 只接收计算快照，数据库写入与来源、版本校验留在主进程。

## 工作台路由

应用使用 HashRouter，主要页面包括：

| 路由 | 用途 |
| --- | --- |
| /workbench | 工作台首页 |
| /workbench/projects | 项目管理 |
| /workbench/config | 项目配置 |
| /workbench/characters | 角色设定 |
| /workbench/worldview | 世界观条目 |
| /workbench/organizations | 组织设定 |
| /workbench/materials | 故事素材库 |
| /workbench/relations | 角色、组织和世界观关系 |
| /workbench/outline | 卷与章节大纲 |
| /workbench/write | 章节生成、审核和版本 |
| /workbench/memory | 叙事记忆 |
| /workbench/foreshadow | 伏笔 |
| /workbench/graph | 关系图谱 |
| /workbench/skills | Agent 技能开关 |
| /workbench/revisions | 章节修订和差异对比 |
| /workbench/assistant | 创作助手 |
| /workbench/sessions | Agent 会话 |

## 快速开始

### 前置条件

- Node.js 22.19+ 和 npm
- 如果需要调用 Agent，需要一个可访问的模型接口、模型名称和 API Key
- 如果需要在 Windows 上重新编译 better-sqlite3，需要 Visual Studio Build Tools 的 C++ 工具链和 Windows SDK

### 安装与开发

~~~bash
git clone https://github.com/leaves899/yourlovestory.git
cd yourlovestory
npm run env:setup
. .\scripts\activate.ps1
npm ci
npm run dev
~~~

npm run dev 会同时启动 Vite 渲染进程和 Electron 主进程。应用启动后可以从工作台项目页创建第一个项目。

项目使用 Node.js 22.19+ 运行 Jest 和依赖安装。`better-sqlite3` 的测试二进制与 Electron 二进制使用不同的 ABI，开发命令会在对应入口自动重建目标原生依赖。

Windows 下，`.runtime/` 是本项目独立的 Node.js 环境目录，不会提交到仓库。PowerShell 需要在每个新终端执行 `. .\scripts\activate.ps1`；CMD 需要执行 `call scripts\activate.bat`。它们只改变当前终端，不会修改系统 Node.js。

### 配置模型

在章节写作页或 Agent 助手页填写：

1. OpenAI 兼容接口地址
2. 模型名称
3. API Key

写入、确认和锁定等 Agent 操作会经过应用内确认。API Key 不应写入代码、提交记录或截图。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| npm run dev | 启动 Vite 和 Electron 开发环境 |
| npm run dev:renderer | 只启动 Vite |
| npm run dev:main | 编译并启动 Electron 主进程 |
| npm run build | 构建 renderer 和 main |
| npm run env:setup | 安装项目本地 Node.js 环境 |
| npm run rebuild:native | 为 Electron 重新编译原生依赖 |
| npm run rebuild:node | 为当前 Node.js 重建测试原生依赖 |
| npm test | 运行 Jest 测试 |
| npm run test:watch | 监听模式运行 Jest |
| npm run test:coverage | 生成测试覆盖率 |
| npm run test:e2e | 运行 Playwright 测试 |
| npm run test:packaged | 验证 electron-builder 真实产物、native SQLite 与重启持久化 |
| npm run benchmark:baseline | 生成同步计算性能基准 |
| npm run benchmark:worker | 生成相同 fixture 的 Worker 对照数据 |
| npm run lint | 运行 ESLint |
| npm run lint:fix | 自动修复可修复的 ESLint 问题 |
| npm run check:version | 校验 package、lockfile、安全策略、changelog 和 Git tag 版本 |
| npm run test:release | 运行版本与校验和工具测试 |
| npm run release:checksums -- \<directory\> | 为发布目录生成 `SHA256SUMS.txt` |
| npx tsc --noEmit -p tsconfig.main.json | 检查主进程、shared 和 agent 类型 |
| npx tsc --noEmit -p tsconfig.json | 检查 renderer 类型 |
| npm run package:win | 构建 Windows 安装包 |
| npm run package:mac | 构建 macOS 安装包 |
| npm run package:linux | 构建 Linux AppImage |

## 数据与隐私

- SQLite 数据库位于 Electron userData/data/yourcrush.sqlite
- 旧版角色数据位于 userData/crushes/，应用会在需要时从项目内旧目录迁移兼容数据
- 本项目不托管你的角色、项目或日记数据
- 启用模型后，发送给模型的内容会离开本机并遵循对应模型服务商的隐私政策
- 亲密内容默认关闭，只有明确启用对应配置后才会处理相关内容
- 建议在退出应用后备份 Electron userData 目录

设置页提供滚动备份、保留策略、受控恢复、项目导入导出与脱敏诊断包。任务恢复按
[安全恢复契约](docs/features/task-crash-recovery.md)分类；模型调用中的不确定窗口需要人工确认。
[Context Compiler](docs/features/context-compiler.md)记录各阶段来源和参数，Debug 默认关闭。
卷大纲生成提供独立任务、进度、取消和分类恢复，结果只写入来源和版本仍一致的草稿，
由用户确认和锁定；模型请求中断后的重试需要明确确认。

本地数据可能包含角色设定、日记、聊天记录和 API 配置关联信息。请勿将数据库、crushes/ 或包含私人内容的日志提交到公开仓库。

## 项目结构

~~~text
yourcrush/
├── src/
│   ├── main/       # Electron 主进程、SQLite、IPC、任务和 preload
│   ├── renderer/   # React 页面、组件、Zustand stores 和 IPC services
│   ├── shared/     # 可复用的领域模型、规则和业务服务
│   └── agent/      # Pi Agent、LLM 适配和工具注册
├── crushes/        # 旧版 Crush 角色数据和兼容资源
├── tests/          # Jest 单测、主进程集成测试和 Playwright 测试
├── docs/           # ADR、功能说明和开发文档
├── electron-builder.yml
├── package.json
└── vite.config.ts
~~~

## 验证与故障排查

提交前建议依次运行：

~~~bash
npm test
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.json
npm run build
npm run lint
npm run test:e2e
git diff --check
~~~

`npm run test:e2e` 覆盖 renderer 与真实开发 Electron 路径。
`npm run test:packaged` 使用专用配置启动 electron-builder 的真实产物，独立验证
native SQLite、退出和重启持久化；它不依赖 Vite。CI 与发布流程运行三平台门禁，
详见 [packaged smoke](docs/release/packaged-smoke.md)。安装体验和签名的验证仍由发布流程负责。

### better-sqlite3 编译失败

Jest 使用 Node.js 22.19+ 的 ABI，测试命令会自动执行 `npm run rebuild:node`。如果依赖目录来自其他 Node.js 版本，先切换到 Node.js 22.19+，再恢复依赖：

~~~bash
npm ci
npm test
~~~

`npm run rebuild:native` 只为 Electron 28 重建 ABI 119 的原生依赖，由 `npm run dev:main` 自动调用。不要把 Electron 目标二进制直接用于 Jest。

当前锁定的 `better-sqlite3@11.10.0` 没有 Node.js 24 的 Windows 预构建包。如果必须使用 Node.js 24，需要 Visual Studio Build Tools 的 Desktop development with C++ 工作负载和 Windows SDK，并承担从源码重建的维护成本。

### 开发窗口白屏

确认 3000 端口没有被其他进程占用，并使用以下命令重新启动：

~~~bash
npm run dev
~~~

## 相关文档

- [碎片日记产品说明](docs/features/fragment-journal-prd.md)
- [Pi Agent 使用参考](docs/PI_AGENT_REFERENCE.md)
- [内容政策](CONTENT_POLICY.md)
- [安全说明](SECURITY.md)

## 贡献

欢迎提交 Issue、改进文档和 Pull Request。请先阅读 [贡献指南](CONTRIBUTING.md)，并遵守仓库中的 AGENTS.md 约束。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
