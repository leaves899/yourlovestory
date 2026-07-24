# 贡献指南

感谢你关注 yourcrush。提交代码、问题反馈和文档改进前，请先阅读根目录的 `AGENTS.md` 与 `CLAUDE.md`。

## 开发环境

- Node.js 22.19+
- npm
- Windows 重新编译 `better-sqlite3` 时需要 Electron 原生构建工具

```bash
npm run env:setup
. .\scripts\activate.ps1
npm ci
npm run dev
```

Windows 下也可以在 CMD 中执行 `call scripts\activate.bat`。激活后，当前终端中的 `node`、`npm`、Jest 和 Electron 原生依赖命令都会使用项目本地 Node.js；关闭终端后不会影响系统环境。

## 验证命令

```bash
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.json
npm run lint
npm test
npm run test:e2e
npm run build
```

Jest 命令会先自动按 Node.js 22.19+ 重建 `better-sqlite3`。如果本地依赖来自其他 Node.js 版本，切换 Node.js 22.19+ 后运行：

```bash
npm ci
npm test
```

`npm run rebuild:native` 面向 Electron 28 的 ABI，不用于准备 Jest 测试依赖。`npm run dev:main` 会在启动 Electron 前自动调用它。

## 代码规范

- 使用严格 TypeScript，避免 `any` 和无必要的类型断言。
- 业务逻辑放在 `src/shared/`，主进程通过 IPC 暴露能力，渲染进程不直接访问数据库。
- 新功能同时补充对应的 Jest 或 Playwright 测试。
- 不提交 `settings.json`、`crushes/<slug>/`、覆盖率报告或构建产物。
- 不提交真实人物信息或私密内容。

## 提交与分支

提交格式：`<type>(<scope>): <subject>`，例如 `fix(fragment): ...`。

分支使用 `feature/*`、`fix/*` 或 `refactor/*`。提交前运行类型检查、测试、lint 和私密信息检查，并执行 `git diff --check`。

## 报告问题

通过 GitHub Issues 报告问题，附上操作系统、Node.js 版本、复现步骤和相关日志。请勿在 Issue 或截图中粘贴 API Key、数据库或角色数据。
