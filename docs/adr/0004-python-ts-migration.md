# ADR-0004: Python→TypeScript 全量迁移

## 状态

已批准

取代 [ADR-0003](0003-electron-refactoring.md) 中「业务层 TypeScript 全实现（无 Python 桥接）」未落地的表述，以及 [ADR-0002](0002-pi-agent-integration.md) 中「Python 脚本负责核心业务逻辑，通过子进程调用集成」的过渡表述。

## 上下文

yourcrush 业务逻辑当前是 **TS→spawn→Python 桥接态**，存在三处问题：

### 1. 三处重复的 spawn 实现，契约不一致

| 位置 | 调用方式 | flag 风格 | 返回处理 | signal |
|------|---------|----------|---------|--------|
| `src/main/ipc.ts` | `spawn('python', [fullPath, ...args])` 直接传 .py 路径 | 下划线 `--fragment_id` | `JSON.parse` | 无 |
| `src/agent/tools/*.ts` | 同上 | 连字符 `--fragment-id` | raw stdout（不 parse） | 有（AbortSignal） |
| `tests/cli/runner.ts` | `execFileSync` + `python -m` | 连字符 | 跳过 RuntimeWarning 后 parse | 无 |

### 2. 潜伏的 ImportError bug（实测确认）

`ipc.ts` 的 `fragment:*`/`day:*` handler 与 `fragmentTool` 都用 `spawn('python', [fullPath, ...])` **直接传 .py 路径**。但 `src/scripts/day/service.py:9` 与 `src/scripts/fragment/manager.py:14-21` 含**顶层相对导入**（`from .pipeline import` / `from .backup import`），直接 `python path/to/file.py` 在模块加载阶段即抛 `ImportError`：

```
$ python src/scripts/day/service.py --action list --slug x
ImportError: attempted relative import with no known parent package
$ python -m src.scripts.day.service --action list --slug x
{"success": true, "data": [], "total": 0}    # -m 方式正常
```

> `manager.py:345-367` 有「直接运行时回退绝对导入」的兜底，但它位于 `_main()` 内部，而顶层 import 在模块加载时就崩溃，`_main` 根本到不了——这段是死代码。

即：**这些路径在真实运行时是坏的**，只有 `tests/cli/runner.ts` 用 `-m` 方式能跑通 20 个契约测试。

### 3. ADR-0002 与 ADR-0003 互相矛盾

- ADR-0002:23-25（已批准）：Python 脚本负责核心业务逻辑，通过子进程调用。
- ADR-0003:31,36（已批准但未落地）：业务层 TypeScript 全实现（无 Python 桥接）、Python 逻辑全部重写为 TypeScript。

桥接态是 0003 未落地时的临时产物，两份 ADR 对 Python 的定位直接冲突，需要裁决。

### 4. 打包态桥接不可用

`ipc.ts` 用 `app.getAppPath()` 作 cwd、`python -m src.scripts...` 依赖项目根在 sys.path。打包后 `app.getAppPath()` 指向 app.asar 内，Python 读不到 asar 内的 .py，且目标系统不一定有 python。桥接态仅 dev 可用，无法满足 ADR-0003 的桌面打包目标。

### 迁移工作量评估

| 模块 | 行数 | 性质 | 测试现状 | 迁移风险 |
|------|------|------|---------|---------|
| `file_utils`/`toggle_intimate`/`parsers` | ~200 | 纯文件读写 / 空壳 | 无直接单测 | 低 |
| `init_template`（crush CRUD） | 349 | 薄封装（mkdir/json） | 89 行 pytest + 契约测试 | 低 |
| `day/service`+`pipeline` | 412 | 薄 CRUD + 空壳 | 152 行 pytest + 契约测试 | 低 |
| `fragment/`（厚逻辑） | ~2500 | 状态机/盲匹配/Prompt 矩阵/标签降频/乐观锁/emoji 检测 | **核心算法零单测**，仅 CRUD 流程 | **高** |

fragment 厚逻辑（state_machine 378 / blind_matcher 455 / prompt_generator 379 / tag_recommender 336 / crud 302 / integrator 239 / utils 463）当前零单元测试，1:1 盲翻到 TS 无法保证行为等价。

### 测试基础设施

- 19 个 pytest（CRUD 流程：test_crush / test_day / test_fragment + 2 个集成）。
- 20 个 jest 契约测试（`tests/cli/*.contract.test.ts`），锚定的是 **CLI JSON 契约**（exitCode + JSON shape），迁移到 TS 后改调 TS 函数即可复用，shape 断言不变。
- 9 个 playwright e2e（`tests/e2e/`，用 mock-electron-api 拦截 IPC）。
- Python 纯标准库，仅 `blind_matcher.py` 可选依赖 sentence-transformers/numpy（不可用时降级为字符级 Jaccard）。

## 决策

**立即开始全量迁移到纯 TypeScript，分阶段推进。** 不长期保留 Python 桥接，也不一次性盲翻。

### 1. 阶段 0：桥接收敛（已完成）

三处 spawn 统一到 `src/shared/pythonRunner.ts`（全项目唯一实现）：

- 统一 `python -m <modulePath>`（修掉 service.py / manager.py 直接路径的 ImportError）。
- 统一连字符 flag（`--env-tags`），argparse 自动 `-`→`_` 映射 dest，与原下划线写法等价。
- 统一 utf-8 编码（`PYTHONIOENCODING`/`PYTHONUTF8`）。
- 统一 `parsePythonJSON`（跳过 RuntimeWarning 前缀，无 `{` 抛清晰错误）。
- `exitCode≠0` 不 reject（业务失败时 stdout 仍有 JSON，由调用方解析判断）。

ipc.ts、agent tools、runner.ts 全部改为复用 shared，返回契约不变（renderer 零改动）。`dayTool` 从 `pipeline.py`（空壳）对齐到 `service.py` 的 generate 入口。

### 2. 迁移顺序：薄模块优先，厚模块先补锚再迁

- 阶段 1：`file_utils` + `toggle_intimate` + `parsers`（空壳）→ TS。**（已完成）**
- 阶段 2：`init_template`（crush CRUD）→ TS，顺带补齐 crushTool 缺的 update/delete。**（已完成）**
- 阶段 3：`day`（service + pipeline）→ TS。
- **阶段 4：fragment 补锚定测试**（纯 Python，不迁移）——为厚逻辑补 pytest，固化当前正确行为，覆盖率 >70%。
- 阶段 5：fragment 迁移（子模块按依赖底向上：models→utils→storage→state_machine→crud→locker→integrator→prompt_generator→tag_recommender→blind_matcher→manager）。
- 阶段 6：收尾，删 `pythonRunner.ts`，达成无 Python 运行时。

#### 阶段 1 交付记录

- 新建 `src/shared/persistence/settingsStore.ts`（`readJson`/`writeJson`/`getSettings`/`updateSettings`），1:1 对齐 `file_utils.py`（中文不转义、缩进 2、整体覆盖、损坏 JSON 返回 null）。
- 新建 `src/shared/persistence/intimateToggle.ts`（`readIntimateConfig`/`writeIntimateConfig`/`getIntimateStatus`/`setIntimate`），1:1 对齐 `toggle_intimate.py`（兼容新旧格式、不重复写入）。
- `src/main/ipc.ts` 的 `settings:get`/`settings:update` 改调 TS settingsStore，不再走 `runPython`。
- 删除 `src/scripts/utils/file_utils.py`、`src/scripts/parsers/`（空壳无引用）、`src/scripts/toggle_intimate.py`。
- **决策**：`toggle_intimate.py` 的 CLI 入口不再保留（原是独立命令行工具）。核心读写逻辑迁到 TS 后，命令行操作由「直接编辑 `.intimate_config`」取代（见 CONFIGURATION.md / QUICK_START.md）。
- 新增 `tests/shared/settingsStore.test.ts`（17 个单测，含 intimateToggle），覆盖原 Python 零单测的缺口。
- 文档更新：CONFIGURATION.md / QUICK_START.md / PRD.md / CLAUDE.md 的 `toggle_intimate.py` 命令引用全部改为手动方式。

#### 阶段 2 交付记录

- 新建 `src/shared/crush/crushStore.ts`（`createCrush`/`listCrushes`/`getCrush`/`updateCrush`/`deleteCrush`），1:1 对齐 `init_template.py`（幂等创建、目录结构、meta 字段、排序、not found 错误、updated_at 刷新）。
- `src/main/ipc.ts` 的 `crush:*` 五个 handler 改调 TS crushStore，不再走 `runPython`。
- `src/agent/tools/crushTool.ts` 改调 TS crushStore，**补齐原缺的 update/delete 动作**（原仅 create/get/list），现五动作齐全。
- 删除 `src/scripts/init_template.py`、`tests/unit/test_crush.py`、`tests/cli/crush.contract.test.ts`（断言并入 `tests/shared/crushStore.test.ts`，22 个单测）。
- `tests/cli/runner.ts`：移除 `MODULES.CRUSH`，新增 `createTestCrush`/`deleteTestCrush`（走 TS crushStore）供 fragment/day 契约测试准备角色——这两套契约测试原先用 `MODULES.CRUSH` 调 Python create，crush 迁移后改用 TS 辅助函数。
- `src/scripts/fragment/import_demo.py` 的 `init_template.py` 命令提示改为指向应用内 UI / crushStore.ts。

### 3. 覆盖不下降的保障

- 薄模块（阶段 1-3）：现有 pytest 断言移植为 jest，契约测试改调 TS 函数（shape 不变），迁移前 stash Python 版做对比测试。
- **fragment（阶段 5）：必须先经阶段 4 补锚定测试**，迁移时逐子模块移植 pytest→jest，并保留 Python 版（`git tag fragment-python-baseline`）对固定输入双跑、JSON 结构化 diff 为空。这是满足「迁移前后测试覆盖不下降」的唯一路径。

### 4. 过渡期维护纪律

在 Python 完全迁移前：

- **禁止向 Python 新增业务逻辑**，新功能一律写 TS。
- Python 仅允许 bugfix。
- 新增 TS 模块若需调用旧 Python，走 `src/shared/pythonRunner.ts` 的 `runPython`，直到该 Python 模块被迁移。
- 迁移以「先补锚、再翻译、对比测试、删 Python」为单位推进，每个子模块独立可中断。

## 依据

- **为什么不长期保留 Python**：打包态（asar + 无系统 python）桥接不可用，ADR-0003 桌面打包目标无法达成；双语言栈维护成本随功能增长上升。
- **为什么不一次性盲翻**：fragment 厚逻辑 ~2500 行零单测，盲翻无法证明覆盖不下降；先补锚是可控迁移的前提。
- **为什么薄模块先行**：积累「TS 等价实现 + 契约复用 + 对比测试」模式，降低 fragment 阶段的不确定性。
- **为什么契约测试可复用**：它锚定 CLI JSON 契约而非内部实现，迁移后改调 TS 函数、shape 断言不变，是横跨迁移的安全网。

## 后果

### 正面

- 单一语言栈，消除桥接复杂度与三处重复 spawn。
- 修掉 service.py / manager.py 直接路径的潜伏 ImportError。
- 类型安全，IDE 支持更好。
- 打包简单（无需 Python 运行时），达成 ADR-0003 目标。
- 阶段 4 补锚后，fragment 核心算法首次获得测试覆盖。

### 负面

- fragment 迁移工作量大（需先补锚 ~2500 行逻辑的单测）。
- 迁移期间双栈并存，需遵守过渡期维护纪律。
- `utils.py` 的 `unicodedata.category` emoji 检测需找 TS 等价实现（Unicode property escape 正则），由对比测试验证。

## 相关文档

- [ADR-0002: Pi Agent 集成](0002-pi-agent-integration.md)
- [ADR-0003: Electron 桌面应用重构](0003-electron-refactoring.md)
- [重构计划](../REFACTORING_PLAN.md)
