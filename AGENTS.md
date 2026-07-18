# AGENTS.md

**语言：所有对话输出使用中文。思维链全程使用中文思考。**

## 项目概述

yourcrush —— 恋爱日记桌面应用。业务功能通过应用内 Pi Agent + 注册工具提供，不再以独立 Skill 形式调用。

**技术栈**：TypeScript 全量（**无 Python 运行时**）+ Electron 28 + React 18 + Zustand + Pi Agent 0.78。重构历史见 [ADR-0003](docs/adr/0003-electron-refactoring.md) / [ADR-0004](docs/adr/0004-python-ts-migration.md)。

## 项目结构

```
src/
├── main/          # 主进程：ipc.ts 直接调 src/shared，无子进程
├── renderer/      # React 渲染：pages/ stores/(Zustand) services/(IPC 薄封装)
├── agent/         # Pi Agent 实例 + tools/（crushTool / dayTool / fragmentTool）
└── shared/        # 纯 TS 业务逻辑（crush / day / fragment / persistence）
crushes/<slug>/    # 角色数据（fragments/<date>.json、memory.md、persona.md）
tests/             # jest 单测（shared）+ Playwright e2e
docs/              # adr/ + features/ + agents/
```

**关键架构**：Agent 工具与 IPC handler 共用同一套 `src/shared/` 业务逻辑，无子进程、无 Python 桥接。

碎片日记业务规则（状态机 / 降频策略 / 四种写作模式等）见 [docs/features/fragment-journal-prd.md](docs/features/fragment-journal-prd.md)。Pi Agent 用法见 [docs/PI_AGENT_REFERENCE.md](docs/PI_AGENT_REFERENCE.md)。

## 常用命令

```bash
npm run dev            # 开发（Vite + Electron）
npm run build          # 构建生产包
npm run package:win    # 打包 Windows 桌面应用
npm test               # jest 单测
npm run test:e2e       # Playwright 端到端
npm run lint           # ESLint
npx tsc --noEmit -p tsconfig.main.json   # 类型检查（CI 跑此命令）

# 提交前私密信息检查（应返回空）
grep -r "<private-name-[a-c]>" . --include="*.ts" --include="*.tsx" --include="*.md" --include="*.yml"
```

## 硬性约束

- **私密信息**：绝不包含真实人物信息，提交前跑上面 grep
- **亲密内容默认关闭**：显式启用 `crushes/<slug>/.intimate_config` 写 `intimate=true`
- **写作标准**：禁止破折号「——」、禁止过度省略号「...」
- **时间线**：禁止硬编码 Day 数字或具体日期，必须动态计算

## 代码与提交规范

- 严格类型（`strict: true`），避免 `any`；数据用 `interface`，枚举用字符串联合类型
- 单一职责，模块按 `src/shared/<域>/` 划分；函数不过长，嵌套不超 3 层
- 提交前跑：类型检查 + `npm test` + 私密 grep
- 提交格式：`<type>(<scope>): <subject>`（feat/fix/docs/style/refactor/test/chore）
- 分支命名：`feature/*`、`fix/*`、`refactor/*`

## Git 规则

- 合并冲突解决后必须读取文件验证；提交后 `git diff HEAD~1 --stat` 验证
- 禁止用 rebase 删文件/改 PR 内容——用新 commit
- 禁止未检查现有 PR 就创建重复 PR
- 禁止 force push 到 master/main
- rebase/冲突解决失败超 2 次停下来让用户手动处理

## Agent 协作

Issues 在 GitHub（leaves899/yourlovestory），见 `docs/agents/`。领域文档：CONTEXT.md + docs/adr/。
