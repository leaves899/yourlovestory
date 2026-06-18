# 下一步方向（让项目"基本可用"）

> 现状诊断结论：**项目目前无法运行**。19 个 Python 测试通过说明业务逻辑本身是健康的，但三处"胶水层"全是断裂的，导致 `npm run dev` 启动的 Electron 应用无法完成任何一次真实操作。下面按"先让它能跑 → 再让核心链路通 → 最后补测试"的顺序给出提示词。

---

## 一、诊断依据（事实，非推测）

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| 1 | Python 单元/集成测试 | ✅ 19/19 通过 | `pytest tests/` 实跑 |
| 2 | `manager.py` 作为 CLI 脚本 | ❌ ImportError | 相对导入 `from .backup import`，`python manager.py --action ...` 直接崩溃 |
| 3 | `pipeline.py` 接收 `--params` | ❌ 无入口 | 全文无 `argparse` / `__main__`，只有 `def run_pipeline` |
| 4 | `ipc.ts` 调用契约 | ❌ 对不上 | `ipc.ts` 用 `python x.py --params '{json}'`，Python 侧不接收 |
| 5 | `fragmentTool.ts` 调用契约 | ❌ 对不上 | 用 `--action/--slug/--content`，与 ipc.ts 又是另一套，Python 侧也不接收 |
| 6 | `agent.ts` 的 Pi Agent 用法 | ❌ 字段错误 | `initialState` 里塞了 `systemPrompt/model/thinkingLevel/tools`，但 0.78 的 `AgentState` 不含这些；`getModel('anthropic','claude-sonnet-4-20250514')` 的 modelId 是否在 `MODELS` 表里存疑 |
| 7 | preload ↔ service ↔ ipc 命名 | ✅ 一致 | 三层 channel 名对得上，但都通向坏掉的 Python 桥接 |

**一句话**：Python 业务层是好的，但 TS→Python 的桥接层（IPC + Agent tools）全错，且 Pi Agent 实例本身也构造不对。所以应用能开窗，但点任何按钮都会失败。

---

## 二、提示词 1：让 Electron 应用能真正跑通一次碎片记录（最高优先级）

**目标**：打通"渲染进程 → IPC → Python → 返回"这条最小闭环，让 `npm run dev` 后能在界面里记一条碎片并看到结果。

```
请修复 src/scripts/fragment/manager.py 和 src/main/ipc.ts 之间的契约断裂，让碎片 CRUD 能在 Electron 应用里真正运行。

背景：当前 ipc.ts 用 `python manager.py --params '{json}'` 调用，但 manager.py：
1. 使用相对导入（from .backup import ...），无法作为顶层脚本运行；
2. 没有任何 argparse / __main__ 入口，不接收 --params 参数。

请这样改：
1. 给 manager.py 增加一个 CLI 入口 `if __name__ == "__main__":`，用 argparse 解析 `--action`（record/list/get/update/delete/integrate）和它需要的参数（slug、fragment_id、origin、mood、content、env_tags、behavior_tags、date 等），调用对应的 FragmentManager 方法，把结果用 print(json.dumps(...)) 输出。env_tags/behavior_tags 用 JSON 字符串接收。
2. 确保入口既能 `python -m scripts.fragment.manager ...`（包内运行，相对导入有效），也能提供一份 `python manager.py ...` 的兜底（必要时把相对导入改成 try/except 两种写法，或 sys.path 注入）。
3. 把 ipc.ts 里 `execPythonScript` 的命令构造改成和 manager.py 一致的契约（建议统一用 `--action/--slug/...` 显式参数，而不是 --params 大 JSON，更安全也更可调试）。同步检查 src/agent/tools/fragmentTool.ts 是否已经用这套契约——它已经用 --action 形式了，让两者统一。
4. 完成后实际运行验证：
   - `python -m src.scripts.fragment.manager --action record --slug example --origin crush --mood positive --content "测试"` 必须成功输出 JSON；
   - 然后对 src/scripts/day/pipeline.py、src/scripts/init_template.py、src/scripts/utils/file_utils.py 做同样的"补 CLI 入口"处理，因为 ipc.ts 同样依赖它们。
5. 不要改动 Python 业务逻辑（crud/locker/integrator 等），只补 CLI 入口层。改完跑 `pytest tests/` 必须仍然 19/19 通过。

验收标准：
- `pytest tests/` 全绿；
- 每个 ipc.ts 依赖的 Python 脚本都能 `python -m ...` 方式被调用并返回 JSON；
- 在 README 或本文件记录最终的 CLI 契约表（action × 参数）。
```

---

## 三、提示词 2：修好 Pi Agent 实例（否则 Agent 工具是死代码）

**背景**：`src/agent/agent.ts` 当前的 `new Agent({ initialState: { systemPrompt, model, thinkingLevel, tools }})` 与 0.78 版本的 `AgentState` 不匹配（见 `node_modules/@earendil-works/pi-agent-core/dist/agent.d.ts`）。这会导致 Agent 工具链（dayTool/fragmentTool/crushTool）形同虚设。

```
请修正 src/agent/agent.ts 对 @earendil-works/pi-agent-core 0.78 的 API 用法。

参考 node_modules/@earendil-works/pi-agent-core/dist/agent.d.ts 和 types.d.ts 中真实的 AgentState / AgentOptions 定义：
1. 按真实字段重写构造参数。system prompt、model、tools、thinkingLevel 如果不在 initialState 里，就改用 AgentOptions 的对应字段（getApiKey、streamFn、convertToLlm、thinkingBudgets 等），或在 prompt 之前正确设置 agent.state。
2. 验证 getModel('anthropic', 'claude-sonnet-4-20250514') 的 modelId 是否存在于 node_modules/@earendil-works/pi-ai/dist 里的 MODELS 表；若不存在，改用表内真实 modelId，并参考 docs/PI_AGENT_REFERENCE.md。
3. 写一个最小的冒烟脚本（例如 scripts/smoke-agent.ts 或 jest 用例），用真实或 mock 的 streamFn 让 agent.prompt("hello") 跑完一次，确认 subscribe 能收到 message_start/message_end 事件、不抛异常。
4. 同步修正 CLAUDE.md 第 6 节「Pi Agent 与业务服务集成」和「配置示例」中过时的代码片段，使其与真实 API 一致。

验收标准：
- agent.ts 通过 tsc 编译（npm run build:main）；
- 冒烟脚本能跑完一次 prompt 而不抛错；
- CLAUDE.md 的代码示例与真实 API 一致。
```

---

## 四、提示词 3：补一条端到端可用性测试（防止再次"看起来能跑其实跑不了"）

**背景**：当前 e2e（`tests/e2e/test_app.spec.ts`）和应用本身的可用性没有真正绑定——19 个 Python 单测全绿，但应用其实跑不通。需要一条"真实链路"测试。

```
请新增一条端到端冒烟测试，覆盖"渲染进程 → IPC → Python → 返回"完整链路，作为"基本可用"的回归门禁。

要求：
1. 不依赖完整 Electron 启动也可以：可以先用一个 Node 脚本直接 spawn 各 Python 脚本，验证 CLI 契约（提示词 1 的产物）。
2. 再补一条 Playwright（已有 tests/e2e/test_app.spec.ts）或 jest 用例：启动应用后，在 FragmentPage 记录一条碎片，断言界面出现成功反馈，且 crushes/example/fragments/<date>.json 真的写入了。
3. 把这条测试加入 CI（.github/workflows/ci.yml），让它成为 PR 合并的必要检查。
4. 在 README 增加 "如何验证基本可用" 小节，写明：跑哪些命令、预期看到什么。

验收标准：
- 该测试在本地 `npm run test:e2e`（或对应命令）通过；
- CI 里这条测试是 required check。
```

---

## 五、提示词 4：清理"双重桥接"债务（可选，但建议早做）

**背景**：现在有两套通向 Python 的路径：① IPC（ipc.ts → Python）给 UI 用；② Agent tools（fragmentTool.ts → Python）给 Pi Agent 用。两套各写一份 spawn 契约，已经出现不一致（提示词 1 里会发现）。ADR-0003 的终态是"Python 逻辑全部转 TS"。建议先收敛、再迁移。

```
请评估并收敛两套 TS→Python 桥接（ipc.ts vs agent/tools/*.ts）。

要求：
1. 抽出一个共享的 runPython(modulePath, args) 工具函数（统一 spawn、超时、错误格式、JSON 解析），ipc.ts 和 agent/tools/*.ts 都调用它，消除重复契约。
2. 在 docs/adr/ 新增一条 ADR-0004，记录决策：保留 Python 过渡期（当前），还是开始迁移到纯 TS。给出依据（迁移工作量估计、当前 Python 模块的测试覆盖）。
3. 若决定迁移，按 fragment → day → crush 的顺序，每个模块迁移后删除对应 Python 文件，并把对应单测从 pytest 改写为 jest，保持覆盖。

验收标准：
- 只剩一处 spawn 实现；
- ADR-0004 记录了明确方向；
- （若迁移）迁移前后测试覆盖不下降。
```

---

## 六、建议执行顺序与预期产出

| 顺序 | 提示词 | 预期产出 | 判定"基本可用"的作用 |
|------|--------|----------|----------------------|
| 1 | #1 补 Python CLI 入口 | 应用能记录碎片 | **从"跑不起来"到"能跑一次核心操作"** |
| 2 | #3 补端到端测试 | 有回归门禁 | **防止再次静默失效** |
| 3 | #2 修 Pi Agent | Agent 工具链可用 | 让"AI 辅助写作"不再是死代码 |
| 4 | #4 收敛桥接 | 单一 spawn 实现 | 为后续 Python→TS 迁移扫清障碍 |

做完 #1 + #3，项目就达到了"基本可用"的最低标准：**能启动、能记碎片、有测试守门**。#2 和 #4 是让架构真正对齐 ADR-0003 终态。

---

## 七、给执行 Agent 的硬性约束（复用 CLAUDE.md）

- 所有输出用中文，思维链用中文。
- 不改 Python 业务逻辑（crud/locker/integrator/tag_recommender），只动 CLI 入口和 TS 胶水层。
- 每步改完必须跑 `pytest tests/` 确认 19/19 仍通过。
- TS 改完必须 `npm run build:main` 通过编译。
- 不硬编码真实人物信息；提交前 grep 检查。
- 不 force push master；分支用 `fix/*`。

---

## 八、CLI 契约表（提示词 1 产出）

> 以下契约已于 2026-06-18 实施验证，`pytest tests/` 19/19 通过。

### 调用方式

所有 Python 脚本统一使用 `python -m <模块路径>` 方式调用，避免相对导入问题：

```bash
python -m src.scripts.fragment.manager --action <action> [options...]
python -m src.scripts.day.service        --action <action> [options...]
python -m src.scripts.day.pipeline       --slug <slug> --day-number <n> [options...]
python -m src.scripts.init_template      --action <action> [options...]
python -m src.scripts.utils.file_utils   --action <action> [options...]
```

ipc.ts 使用 `spawn('python', [fullPath, ...args])`（`shell: false`）与 fragmentTool.ts 保持一致。

### fragment/manager.py — action × 参数

| action | 必需参数 | 可选参数 | 说明 |
|--------|----------|----------|------|
| `record` | `--slug`, `--origin`, `--mood`, `--content` | `--env-tags`, `--behavior-tags`, `--date`, `--writing-context` | 记录碎片 |
| `list` | `--slug` | `--date` | 列出碎片；有 `--date` 时按日期筛选 |
| `get` | `--slug`, `--fragment-id` | — | 获取单个碎片 |
| `update` | `--slug`, `--fragment-id` | `--content`, `--origin`, `--mood`, `--env-tags`, `--behavior-tags`, `--expected-version` | 更新碎片 |
| `delete` | `--slug`, `--fragment-id` | `--expected-version` | 删除碎片 |
| `integrate` | `--slug` | `--date`, `--dates` | 整合碎片；`--date` 单日整合，`--dates` JSON 数组跨日预览 |

- `--env-tags` / `--behavior-tags` 接收 JSON 数组字符串，例：`--env-tags '["工作","咖啡厅"]'`
- `--expected-version` 整数，用于乐观锁
- `--dates` 接收 JSON 数组字符串，例：`--dates '["2026-06-17","2026-06-18"]'`

### day/service.py — action × 参数

| action | 必需参数 | 可选参数 | 说明 |
|--------|----------|----------|------|
| `generate` | `--slug`, `--day-number` | `--summary` | 生成日常写作 |
| `list` | `--slug` | `--page`, `--page-size` | 列出日常写作 |
| `get` | `--slug`, `--day-number` | — | 获取单日详情 |
| `update` | `--slug`, `--day-number`, `--content` | — | 更新日常写作 |
| `delete` | `--slug`, `--day-number` | — | 删除日常写作 |

### day/pipeline.py — 参数

| 参数 | 必需 | 说明 |
|------|------|------|
| `--slug` | ✅ | 角色标识 |
| `--day-number` | ✅ | Day 编号 |
| `--day-file` | ❌ | Day 文件路径 |
| `--summary` | ❌ | 当天摘要 |
| `--dry-run` | ❌ | 只输出变更，不写入 |
| `--skip-skill` | ❌ | 跳过 SKILL.md 重建（默认 true） |
| `--skip-check` | ❌ | 跳过逻辑检查 |

### init_template.py — action × 参数

| action | 必需参数 | 可选参数 | 说明 |
|--------|----------|----------|------|
| `create` | `--name`, `--nickname`, `--slug` | `--description`, `--gender` | 创建角色 |
| `list` | — | — | 列出所有角色 |
| `get` | `--slug` | — | 获取角色详情 |
| `update` | `--slug` | `--name`, `--nickname`, `--description`, `--gender` | 更新角色信息 |
| `delete` | `--slug` | — | 删除角色 |

### utils/file_utils.py — action × 参数

| action | 必需参数 | 可选参数 | 说明 |
|--------|----------|----------|------|
| `getSettings` | — | — | 获取应用设置 |
| `updateSettings` | `--settings` | — | 更新设置；`--settings` 接收 JSON 字符串 |

### 返回值格式

所有 CLI 入口统一输出 `print(json.dumps(result, ensure_ascii=False))`，格式为：

```json
{"success": true, "data": {...}}
```

或错误时：

```json
{"success": false, "errors": ["错误信息"]}
```

进程退出码：成功 `0`，失败 `1`。
