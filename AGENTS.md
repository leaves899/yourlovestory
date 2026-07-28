# AGENTS.md

## 语言

所有面向用户的说明、计划和执行报告使用中文。代码、命令、路径和错误日志保持原文。

## 项目

yourcrush 是基于 Electron 的本地优先创作桌面应用。

技术栈：

* TypeScript
* Electron 28
* React 18
* Zustand
* Chakra UI
* SQLite / better-sqlite3
* Pi Agent
* Vite、Jest、Playwright

项目使用 Node.js 22.19+，不使用 Python 运行时或 Python 桥接。

## 目录职责

```text
src/main/       Electron 主进程、IPC、SQLite、任务
src/renderer/   React 页面、组件、Zustand、IPC 封装
src/shared/     可复用的纯 TypeScript 业务逻辑
src/agent/      Pi Agent、模型适配和工具注册
tests/          Jest 和 Playwright 测试
docs/           ADR、PRD 和开发文档
```

必须遵守以下架构边界：

* Renderer 不能直接访问 SQLite、文件系统或 Electron 主进程模块。
* Renderer 通过 preload 暴露的类型化 IPC 调用主进程能力。
* IPC handler 保持轻量，业务逻辑优先放入 `src/shared/`。
* Agent 工具与 IPC handler 应复用同一套 shared 业务逻辑。
* 新 Agent 能力通过 `src/agent/` 注册，不使用独立 Skill 作为运行时入口。

## 执行方式

Grok Build 主要在 Codex 不可用或额度不足时接管任务。

开始修改前：

1. 阅读用户任务和验收标准。
2. 执行 `git status --short`，不得覆盖现有未提交修改。
3. 阅读目标文件、调用方、类型定义和相关测试。
4. 搜索现有类似实现，避免创建重复逻辑。
5. 确定最小修改范围。

执行过程中：

* 严格按照任务目标实施，不擅自扩大范围。
* 优先最小、可验证、可回滚的修改。
* 不顺手重构、升级依赖或格式化无关文件。
* 计划与真实代码不一致时，以仓库现状为准，并在报告中说明。
* 涉及跨进程功能时检查完整 IPC 调用链。
* 修复 bug 时补充回归测试。
* 不通过硬编码、空实现、删除测试或关闭检查制造通过。

没有明确要求时，不要提交、推送、创建分支或创建 PR。

## TypeScript

* 保持严格类型。
* 避免 `any`、`@ts-ignore` 和不必要的类型断言。
* IPC 输入输出必须可序列化。
* 外部输入必须经过校验。
* 不得通过修改 tsconfig 或 lint 配置隐藏错误。

## 领域约束

* 长篇创作工作台是产品主线，旧 Crush、Day、Fragment 属于兼容入口。
* `Fragment` 与工作台的 `SourceMaterial` 是不同模型，不得混用。
* 旧 Fragment 只允许一次性导入 SourceMaterial，不持续双写或回写。
* 关系阶段规则必须动态读取，禁止硬编码 Day 数字或具体日期。
* 亲密内容默认关闭，相关读取、生成和提示词必须经过现有门禁。
* 未经用户确认，不得让 Agent 输出自动覆盖已采用章节、项目事实或叙事记忆。
* 不提交真实人物信息、聊天记录、API Key、数据库或用户数据。

详细领域术语和规则参见：

* `CONTEXT.md`
* `docs/adr/`
* `docs/features/`
* `docs/PI_AGENT_REFERENCE.md`

## 验证

根据修改范围运行必要检查。

默认提交前验证：

```powershell
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.json
npm run lint
npm test
npm run build
git diff --check
```

涉及关键 UI 流程时增加：

```powershell
npm run test:e2e
```

`better-sqlite3` 在 Node.js/Jest 和 Electron 中使用不同 ABI。不要混用两种环境的原生模块构建结果。

无法执行的检查必须标记为“未运行”并说明原因，不得声称已经通过。

## Git

禁止：

* `git reset --hard`
* `git clean -fd`
* 丢弃未知的用户修改
* force push 到 `master` 或 `main`
* 未经要求改写历史
* 未检查现有 PR 就创建重复 PR

提交格式：

```text
<type>(<scope>): <subject>
```

可用类型：

```text
feat fix docs style refactor test chore
```

## 完成报告

任务结束时输出：

```markdown
## 状态
完成 / 部分完成 / 阻塞

## 修改
- 修改的文件和主要内容

## 验证
- 命令：通过 / 失败 / 未运行

## 剩余问题
- 风险、限制和未完成事项

## Git
- 当前分支
- 是否提交、推送或创建 PR
```
