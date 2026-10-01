# PR #35 / #36 收口与完整回归记录

记录日期：2026-10-01。这里记录 PR #36 合并前的代码与验证；最终合并状态以 GitHub PR 为准，
不能把源码回归当作已发布或 packaged smoke 的证明。

## Git 与远端状态

- 仓库：`leaves899/yourlovestory`。
- 用户先要求不自动 commit，完整回归通过后又明确授权提交、推送并按 #35 再 #36 合并。
- #35 新修复提交为 `65f1ecc`，本地 59 suites / 698 tests、类型检查、lint、build 全通过。
  新提交 GitHub CI 五项全通过（run `36837271706`），已合并为 master `f132fbc`。
- #36 从 `8d0a6f1` 与上述最新 master 整合，保留原 PR 历史，未 rebase 或 force push。
  两处冲突位于章节 runner 与章节 service，解决后已读取并核对完整候选代码。
- 整合后 `src` 与 `tests` 与此前完整回归通过的候选代码逐文件一致；提交前再次在实际 PR 工作区验证。
- 本记录提交时 #36 尚待其新 head CI 和合并，不把原 PR head 的旧 CI 当作当前验证。
- 本地旧 master 分叉历史需保留；不得直接 reset 或推送旧分叉 master。
- Issue #24 未开始。Issue #25 仅在两部分实际合并后作只读计划，不在本轮实现。

## 审查结论与实际修复

- #35 的数据库唯一索引、原子 claim、lease fence、恢复分类与迁移适用于当前远端 master。
- 新 SQLite 用例证实 saving 检查点恢复时会覆盖后来的用户正文，或改写其摘要和状态。
  修复后先检查原正文与章节版本，结果落库前再次检查；已有版本收尾也识别后来的 metadata 编辑。
- compiler 来源、参数和版本证据写入检查点；来源不变时保留完成阶段 trace，
  来源或模型参数变化时旧任务稳定终止，要求新建生成任务。
- compiler metadata 损坏时 fail closed，不再静默忽略。
- 已有版本的幂等收尾保留 stage_compiles、模型参数和 Prompt 版本；重复恢复不会再次生成版本。
- Debug 授权随任务输入持久化，默认关闭时不记录 final_prompt。
- saving 检查点的无模型收尾不创建 Agent、不重新解析凭据，仍保留 lease 和来源门禁。
- README、CHANGELOG、发布流程、恢复说明和 Context Compiler 说明同步了范围与限制。

主要本轮修复文件为 `src/main/tasks/chapterGenerationTask.ts`、`taskManager.ts`、
`src/shared/chapterGeneration/service.ts`、`models.ts` 和
`src/shared/taskRecovery/checkpoints.ts`；新增回归位于章节服务、任务 pipeline 和 crash matrix。
其余候选 diff 为 #35 / #36 的原始实现整合，不是新功能扩展。

## 验收状态

| 项目 | 当前证据 | 关闭条件 |
| --- | --- | --- |
| #19 备份、策略、迁移回滚、完整性、恢复、导入导出、诊断 | Phases A/B/C 已在远端 master；本轮对应 SQLite 测试通过 | Phase D 修复回归通过并合入 master 后可关闭 |
| #19 任务恢复 | 分类、幂等、lease/version/source fence 和异常 metadata 测试及完整现有回归通过，#35 已合并 | 验收项完成，可关闭 |
| #22 统一输入输出、选择、预算、trace、参数、UI、Debug、策略、固定样例 | 本地已整合，完整现有回归通过 | #36 新 head CI 和合并；大纲运行时边界见下一行 |
| #22 大纲运行时共享 compiler | 只有共享 outline 策略，仓库没有独立大纲 runner | 不能声称字面验收全部完成；需明确接受此边界或保留 Issue 待后续实现 |

本轮未新增 embedding、RAG、router、长期记忆或大纲 runner。

## 已执行验证

环境：项目本地 Node.js 22.23.1。测试使用临时目录的真实 better-sqlite3，不使用用户数据库；
模型使用测试替身，无真实 API 调用或计费。

- 整合前 #35 相关 6 suites / 80 tests 通过。
- stale saving 用例修复前 2 个用例失败并证实正文/metadata 被改写；修复后通过。
- 整合后相关 15 suites / 177 tests 通过，覆盖 recovery、任务仓储/管理、润色、
  章节生成与 IPC、compiler、来源面板、renderer stores、narrative workbench、shutdown 和凭据控制。
- 后续 6 suites / 157 tests 通过，补验 backup、backup policy、project portability、diagnostics，
  并重跑 crash matrix 和 pipeline 的最终 metadata fencing 用例；与上一批有重叠，不相加。
- 最终 recovery/classifier/章节服务/pipeline 4 suites / 88 tests 通过，类型检查和 lint 再次通过。
- 两套 TypeScript noEmit、ESLint、生产 renderer/main build 通过。
- 版本一致性检查通过：`0.2.0-alpha.1`。
- 私密标识扫描、冲突标记检查与 git diff whitespace 检查通过。

用户随后明确授权子代理直接执行完整回归，替代原定等待 Qoder 的安排。
子代理在当前工作区顺序执行以下命令，全部最终退出码为 0；没有改动源码、测试或暂存区。

| 检查 | 结果 |
| --- | --- |
| `npm test -- --runInBand` | 61 suites / 734 tests 全通过，36.592 秒 |
| 两套 TypeScript noEmit | main/shared/agent 与 renderer 均通过 |
| `npm run lint` | 通过 |
| `npm run build` | renderer/main 构建通过 |
| `npm run test:e2e` | 24 / 24 通过，26.5 秒 |
| `npm run check:version` | `0.2.0-alpha.1` 一致 |
| `npm run test:release` | 13 / 13 通过 |
| 暂存区与工作区 diff 检查 | 通过 |

结果来自子代理的实际命令输出，此前候选回归日志未额外落盘。#36 实际整合工作区再次完整回归通过：Jest 61 suites / 734 tests（37.571 秒）、Playwright 24/24（22.5 秒）、两套 tsc、lint、build、version、release 13/13 和 diff 检查。完整日志保存在本机 `C:/tmp/yourcrush-regression36-20261001`。
E2E 主要业务用例使用 IPC 替身，另有真实 Electron preload、SQLite 和模板资源闭环；
真实 Electron 使用临时 userData，没有使用用户数据库或真实模型。

E2E 最初两次在原生依赖准备阶段发生 GitHub ECONNRESET/timeout，未进入测试用例；
fallback 因缺少 Visual Studio C++ workload 失败。通过 `gh release` 确认并下载官方
`better-sqlite3-v11.10.0-electron-v119-win32-x64.tar.gz`（936845 bytes），填充 npm prebuild
缓存后，原始 `npm run test:e2e` 正常重建并全部通过。没有更改依赖版本或 lockfile。
测试结束时 3000 无 listener，better-sqlite3 为 Electron ABI；后续 Jest 需重建 Node ABI，
`npm test` 已包含该步骤。

没有执行打包 Electron smoke、签名/notarization、发布或新提交 GitHub CI。
Vite 构建仍提示其 CJS Node API deprecated，构建成功；此既有 warning 未扩展处理。

## 可复现的完整回归命令

从当前工作区开始，不要切换到旧 PR head，否则会漏掉整合修复。先激活项目 Node：

```powershell
. .\scripts\activate.ps1
npm test -- --runInBand
npx tsc --noEmit -p tsconfig.main.json
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run build
npm run test:e2e
npm run check:version
npm run test:release
git diff --cached --check
git diff --check
```

重点验证：首次章节流程、取消/重启、Debug on/off、恢复面板、损坏任务不阻塞正常任务、
来源变化后新建任务、后来的正文/摘要/采用状态不可被旧任务覆盖，以及备份 restore 的 shutdown 门禁。
Playwright 重建 Electron ABI 后，如果再运行 Jest，需要先执行 `npm run rebuild:node`。

按照用户后续授权提交和推送修复，保持 #35 再 #36 的收口顺序，并等待每个新 head 的 CI。
#35 包含来源/version 和无模型收尾修复，#36 包含 compiler 恢复交叉修复。
Issue 状态只在真实合并与验收完成后更新；#22 的大纲边界必须显式记录并保留开放。

## 剩余限制

- 完整现有回归已通过，#35 已合并；本记录编写时 #36 尚待合并，不能宣称版本已 Stable。
- 启发式 Token 估算不提供模型服务商 tokenizer 的精确上限保证。
- 旧无 compiler 检查点没有新来源快照和版本证据，不能补造其历史上下文 trace。
- 模型调用中断仍可能重复计费，只能显式人工确认重试。
- 来源快照可能含项目文本，只能作为本机检查点，不能公开上传。
