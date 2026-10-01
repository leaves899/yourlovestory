# 当前 roadmap 收口审计

记录日期：2026-10-01。依据当前仓库、GitHub open Issues/PR 和实际执行结果更新。
源码回归与 packaged smoke 分别验收；未执行的步骤不记为通过。

## 初始状态与范围

- 补充验收前的基线为 master/origin/master `c1959bd4`，无 open PR；本分支承载待合并的 Worker、性能和发布审计补充。
- #19、#22 已关闭；补充验收前当前 open Issues 为 #24、#25，按本文件记录完成后关闭。
- #19 的 PR #32、#33、#34、#35 已合并；#36 的 compiler 交叉恢复修复已合并。
- 历史关系进度 PRD 的旧 Skill 与扩展构想受 ADR-0005 兼容边界约束，
  不是当前工作台 roadmap；最终审计需要标明历史验收状态，不能冒充已实现。

## #19 最终状态核对

- [x] 已合并自动滚动备份、保留策略、migration 快照/回滚和启动完整性检查。
- [x] 已合并受控恢复、项目两阶段导入导出、默认排除私密内容的诊断包。
- [x] 已合并任务检查点、恢复分类、原子 claim、lease 和来源/版本 fence。
- [x] 已有 master CI 记录覆盖 Jest、两套 TypeScript、ESLint、build、版本一致性和 Playwright 回归。
- [x] master CI run `36853673141` 已覆盖当前基线的单元、类型、lint、build、E2E、三平台 packaged smoke、Gitleaks 和 Markdown 检查。
- [x] 修正 CONFIGURATION 与凭据边界文档中已过期的“恢复未实现”描述。

Jest 24.445 秒，Playwright 9.7 秒。测试没有使用真实用户数据库或调用付费模型。
此验收不代表三平台 packaged smoke、签名、notarization 或公开发布已经完成。

## #22 独立大纲运行时

- PR #38（实现 `8269dad`，合并 `e291b3d`）已合并，Issue #22 已关闭。
- 独立卷大纲生成复用 Context Compiler 的预算、裁剪、来源 trace、模型参数和 Prompt 版本。
- prepared/model/ready/applied 检查点包含 lease、来源与版本 fence；草稿写入与 applied 状态原子提交。
- 损坏 metadata、来源变化、用户编辑/确认/锁定后恢复均 fail closed；无模型收尾不要求凭据。
- 固定样例、SQLite 恢复/幂等/跨阶段回归和真实 Electron 大纲流程已通过。
- PR 与合并后 master CI 通过。没有引入 RAG、embedding 或第二套上下文拼接。

## #24 性能复核

首轮 PR #39（实现 `b874b19`，合并 `a83f5e6`）提供统一 Worker 协议和基准。本补充分支加入
`trim-messages`、章节与大纲编译注入、取消/超时/崩溃隔离、窗口销毁取消、chapter/outline fence，
以及真实 Electron diff 和关系图谱基线。补充基准使用 Node 22.23.1、固定合成 fixture；没有记录真实正文或模型凭据。

首轮同规模 content diff 的主线程 event-loop p50：5000 段同步 134.75 ms，Worker 16.41 ms；
10000 段同步 581.26 ms，Worker 16.56 ms。Worker wall p50 分别为 314.96 / 1027.36 ms，
复制与启动成本增加总耗时，收益是主线程可响应。

补充真实 Electron E2E `tests/e2e/diff-performance.spec.ts` 已通过 2/2：10,000 段版本
diff 取消 `72 ms`，完成路径 renderer frame p95 `6.2 ms`、IPC p95 `2.9 ms`，进度从 0 到 1，
100 块分页和 1,000 条关系图谱列表均有断言；报告写入 `test-results/diff-performance/response-report.json`。
上下文压缩的 100MiB Worker fixture 在 128MiB heap 限制下真实 OOM，已记录为资源边界；更大输入保留
主线程路径，未声称无条件 Worker 化。关系图谱、长文本切块、批量摘要、一致性扫描和搜索索引没有
独立 CPU 入口，盘点文档记录了不迁移的可验证理由。

## #25 packaged Electron smoke

- PR #40（实现 `0ba216a`、`5c176ba`、`3bf3a4e`，合并 `caf4286`）已合并。
- Windows x64、Linux x64、macOS arm64 真实 electron-builder 应用均通过 packaged smoke。
- 独立核对 CI run `36852206591` 的三平台 JSON：`status=passed`、`isPackaged=true`、
  `nativeSqliteLoaded=true`、全部 checks 为 true、两轮 `exitCode=0`、`errors=[]`。
- Node 22.23.1 / Electron 28.3.3 / 应用 0.2.0-alpha.1；实际 `app.asar`、`file://` 页面、
  preload、关键 IPC、SQLite、项目创建、退出、重启持久化和再次退出均有断言。
- 专用配置不依赖 Vite，真实临时 userData 在 single-instance lock 前隔离。
- 启动失败同样生成 failed report；保存 stdout/stderr、main/native/crash 日志、截图与 trace。
- CI 和发布三平台 jobs 将 packaged smoke 设为必要门禁，普通 E2E 不加载该专用 spec。
- 本机 Windows unpacked 应用通过；本机 installer 首次尝试发现旧 NSIS 缓存缺少
  `elevate.exe`，恢复该 helper 后再次尝试又因无法连接 GitHub 下载
  `nsis-resources-3.4.1.7z` 超时而失败。当前状态报告仍为 `ELECTRON_BUILDER_FAILED`，
  因此没有生成当前版本 installer hash，也没有通过 `finalize-platform.mjs`。CI 干净
  runner 的真实三平台 installer 构建通过；此历史证据没有被记作本机 installer 成功。

## master CI 自动发布修复

PR #40 合并后的 CI run `36852579441` 暴露 builder 在 master push 后默认尝试 draft 上传，
缺少 GH_TOKEN 而失败。PR #41（实现 `0717bd6`，合并 `c1959bd4`）将 package scripts
显式设为 `--publish never`，发布只能在验证后由受控汇总 job 创建 draft。
合并后 master CI run `36853673141` 八项全部成功，包含三平台 packaged smoke 和 Gitleaks。

## 发布边界

当前版本维持 `0.2.0-alpha.1`。已验证 repository secrets 为 0、environments 为空，
没有真实 Windows 代码签名证书、Apple Developer 凭据或 notarization 权限。
签名/notarization 流程的仓库侧补充审计完成后另记实证；不得把 unsigned smoke 记为签名成功。
没有公开发布 Stable，也没有触发 Release workflow。
