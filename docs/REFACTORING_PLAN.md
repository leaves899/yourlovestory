# 基于 Pi Agent SDK 模式的 Electron 桌面应用重构方案

## Context

当前 yourcrush 项目基于 Claude Code Skills 工作流构建，碎片日记功能通过 `.claude/skills/day/` 目录下的 Skill 文件与 LLM 交互。

**用户需求**：
1. 重构为**基于 Pi Agent SDK 套壳的创作软件**
2. **Electron 桌面应用**形态
3. **完全迁移**，不保留 Claude Code Skills 工作流

**核心定位**：软件的基本功能是**生成叙事**（day writing），碎片记录是辅助功能。

---

## 方案概述

### 核心定位

| 功能 | 定位 | 说明 |
|------|------|------|
| **叙事生成** | 核心功能 | 用户提供事件线索/碎片，系统生成符合 day 写作原则的叙事 |
| **碎片日记** | 辅助功能 | 可选的素材记录功能，帮助用户组织多维度碎片信息 |

### 核心思路

```
当前架构                     重构后架构
Claude Code Skills     →     Electron + Pi Agent SDK
.claude/skills/day/         →  Pi Agent 核心代理
碎片作为触发器           叙事生成为核心，碎片为可选辅助
yourcrush-client (骨架)     yourcrush-client (完整 Electron 应用)
```

### 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 应用层 | Electron | 桌面应用框架 |
| 代理层 | Pi Agent SDK | 核心对话代理（替代 Claude Code） |
| 服务层 | Node.js Services | 业务逻辑封装 |
| 桥接层 | Python CLI + JSON | Node.js 调用 Python |
| 业务层 | Python Modules | 叙事生成 Prompt 组装和辅助功能 |

---

## 新项目目录结构

基于现有 `yourcrush-client/` 进行重构：

```
yourcrush-client/ # Electron 桌面应用
├── src/                             # Electron 主进程 + UI
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 主进程入口
│   │   ├── window.ts # 窗口管理
│   │   └── ipc.ts                   # IPC 处理器
│   ├── renderer/                     # 渲染进程（前端 UI）
│   │   ├── index.html
│   │   ├── App.tsx                  # React 应用入口
│   │   ├── components/               # UI 组件
│   │   │   ├── DayWriting/           # 【核心】日写组件
│   │   │   ├── WritingInput/          # 写作输入组件
│   │   │   ├── FragmentInput/        # 【辅助】碎片输入组件
│   │   │   ├── FragmentList/         # 碎片列表组件
│   │   │   ├── CrushSelector/        # 角色选择组件
│   │   │   ├── AgentConfig/          # Agent 配置界面
│   │   │   ├── NewUserGuide/         # 新手引导
│   │   │   └── ...
│   │   └── styles/
│   ├── agent/                       # Pi Agent 核心封装
│   │   ├── agent.ts                 # Agent 初始化
│   │   ├── events.ts                # 事件流处理
│   │   └── skills/                  # Pi Agent Skills
│   │       └── day/
│   │           └── SKILL.md # 叙事生成 Skill
│   ├── tools/                       # Pi Agent 工具定义
│   │   ├── day-writer.ts           # 【核心】日写工具
│   │   ├── fragment-crud.ts         # 【辅助】碎片管理工具
│   │   ├── crush-manager.ts         # 角色管理工具
│   │   ├── tag-recommender.ts       # 标签推荐工具
│   │   └── types.ts                # TypeBox 类型
│   ├── services/                    # 服务层
│   │   ├── python-bridge.ts        # Node.js/Python IPC 桥接
│   │   ├── writing-service.ts       # 写作服务
│   │   ├── crush-service.ts        # 角色服务
│   │   └── fragment-service.ts     # 碎片服务
│   ├── types/                       # 类型定义
│   │   └── writing.ts
│   └── utils/
│       ├── logger.ts
│       └── config.ts
├── python/                          # Python 核心逻辑
│   └── scripts/
│       ├── fragment_models.py
│       ├── fragment_state_machine.py
│       ├── fragment_utils.py
│       ├── fragment_manager.py
│       ├── fragment_prompt_generator.py  # 【核心】Prompt 生成
│       ├── tag_recommender.py
│       ├── blind_matcher.py
│       └── cli.py                   # CLI 统一入口
├── crushes/                         # 角色数据
│   └── {slug}/
├── package/
├── release/
├── package.json
├── tsconfig.json
└── README.md
```

**关键设计**：
1. **叙事生成为核心**：UI 以 DayWriting 组件为中心，碎片为可选辅助
2. **Electron 架构**：保留现有 Electron 结构
3. **Python CLI**：通过 `python/cli.py` 标准化接口
4. **Pi Agent SDK**：集成到主进程，管理叙事生成流程

---

## 核心模块设计

### 1. 叙事生成工作流（核心功能）

叙事生成是**核心功能**，通过 Pi Agent 直接调用 LLM 生成：

```
用户: "写今天和ta去咖啡馆"
    ↓
Pi Agent: [加载 crush 角色档案 memory.md + persona.md]
    ↓
Pi Agent: 直接调用 LLM 生成叙事（Python 仅用于 Prompt 组装）
    ↓
输出符合 day 写作原则的叙事文本
```

**叙事生成方式**：

| 方式 | 说明 | 使用场景 |
|------|------|---------|
| **直接叙事** | 用户提供事件线索，直接生成叙事 | 用户有明确想法 |
| **碎片辅助叙事** | 用户输入碎片，系统整合后生成叙事 | 需要素材组织 |

### 2. Python CLI 接口（`python/cli.py`）

Python 业务逻辑封装为 CLI 接口：

```bash
# 叙事生成 - Prompt 组装
python python/cli.py integrate_prompt --params '{"crush_slug": "xiaomei", "clue": "今天去咖啡馆"}'

# 碎片辅助（辅助功能）
python python/cli.py record_fragment --params '{"crush_slug": "xiaomei", "fragment_data": {...}}'

# 返回格式
{"success": true, "data": {...}, "error": ""}
```

**命令列表**：

| 命令 | 功能 | 定位 |
|------|------|------|
| `integrate_prompt` | 整合碎片/线索生成 Prompt | **核心** |
| `generate_writing` | 直接生成叙事 | **核心** |
| `record_fragment` | 记录碎片 | 辅助 |
| `update_fragment` | 更新碎片 | 辅助 |
| `delete_fragment` | 删除碎片 | 辅助 |
| `list_fragments` | 列出碎片 | 辅助 |
| `recommend_tags` | 推荐标签 | 辅助 |
| `get_status` | 获取状态 | 辅助 |
| `complete_day` | 完成日期写作 | 辅助 |

### 3. Python Bridge（`src/services/python-bridge.ts`）

封装 Python CLI 调用为 Promise 形式：

```typescript
export class PythonBridge {
  async call<T>(command: string, params: Record<string, any>): Promise<T> {
    // python python/cli.py {command} --params '{JSON}'
    // 解析 JSON 返回
  }
}
```

### 4. Pi Agent 工具定义（合并为 4 个）

工具合并为 4 个核心工具，职责更清晰：

```typescript
// 工具1: 日写核心（核心功能）
const dayWriterTool: AgentTool = {
  name: "day_writer",
  label: "Day Writing",
  description: "Generate narrative from event clues or fragments",
  parameters: Type.Object({
    mode: Type.Union([Type.Literal("clue"), Type.Literal("fragment")]),
    input: Type.String(),  // 事件线索 或 日期范围
    crush_slug: Type.Optional(Type.String()),
  }),
};

// 工具2: 碎片管理（辅助功能）
const fragmentTool: AgentTool = {
  name: "fragment_crud",
  label: "Fragment Management",
  description: "Create, read, update, delete fragments",
  parameters: Type.Object({
    action: Type.Union([
      Type.Literal("record"),
      Type.Literal("list"),
      Type.Literal("update"),
      Type.Literal("delete")
    ]),
    crush_slug: Type.String(),
    // 根据 action 条件必填
  }),
};

// 工具3: 角色管理
const crushTool: AgentTool = {
  name: "crush_manager",
  label: "Crush Manager",
  description: "Get or select crush character",
  parameters: Type.Object({
    action: Type.Union([Type.Literal("get"), Type.Literal("list"), Type.Literal("create")]),
  }),
};

// 工具4: 标签推荐
const tagRecommenderTool: AgentTool = {
  name: "tag_recommender",
  label: "Tag Recommendation",
  description: "Recommend tags for fragment input",
  parameters: Type.Object({
    crush_slug: Type.String(),
    content: Type.String(),
    session_id: Type.String(),
  }),
};
```

| 原工具 | 合并为 | 理由 |
|--------|--------|------|
| `generate_writing`, `integrate_prompt` | `day_writer` | 职责都是生成叙事 |
| `record_fragment`, `update_fragment`, `delete_fragment` | `fragment_crud` | 都是碎片 CRUD 操作 |
| `list_fragments`, `get_crush` | `crush_manager` | 都是选择/查询 |
| `recommend_tags`, `complete_day` | 保留独立 | 职责单一，且调用频率不同 |

### 5. Agent 初始化（`src/agent/agent.ts`）

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个恋爱日记助手，帮助用户生成叙事。

核心功能是生成叙事，碎片只是可选的辅助素材。

叙事生成原则：
- 三维描写：心理活动 + 环境/光线/温度/声音 + 具体动作
- 时间标签：## HH:MM · 事件
- 禁止破折号「——」
- 禁止过度省略号「...」`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    thinkingLevel: "medium",
    tools: allTools,  // generate_writing + integrate_prompt + 辅助工具
  },
  toolExecution: "parallel",
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
});
```

---

## 数据流设计

### Electron 架构数据流

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Electron 桌面应用                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────────┐     ┌──────────────────┐           │
│  │  Renderer │     │   Main Process │     │  Python Process │           │
│  │  (React UI) │ ←→ │ (Pi Agent SDK)  │ ←→ │  (Business Logic)│           │
│ └─────────────┘└─────────────────┘    └──────────────────┘           │
│         │                    │                        │                      │
│         │ IPC                │ Python CLI            │                      │
│         ▼                    ▼                        ▼                      │
│  叙事输入界面     Agent + Tools    FragmentPromptGenerator                   │
│  叙事结果显示 事件流处理      JSON 存储                                       │
│                                   crushes/{slug}/                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 叙事生成数据流（核心功能）

```
用户输入事件线索："今天和ta去咖啡馆，她拿铁加了双份浓缩"
    ↓
Pi Agent [加载 crush 角色档案 memory.md + persona.md]
    ↓
Pi Agent 直接调用 LLM 生成叙事
    ↓
输出符合 day 写作原则的叙事文本：
    ## 14:30 · 咖啡馆的光

    拿铁的杯壁上有焦糖色的纹路，ta说要加双份浓缩。

    （心理活动描写）

    （环境/光线描写）

    （动作描写）

用户确认或重新生成
```

### 碎片辅助叙事数据流（辅助功能）

```
用户选择"碎片模式"（可选）
    ↓
用户输入碎片（来源 + 情绪 + 内容）
    ↓
系统推荐标签（可选）
    ↓
碎片存储到 crushes/{slug}/fragments/{date}.json
    ↓
用户触发"生成叙事"
    ↓
integrate_prompt 工具 → Python FragmentPromptGenerator
    ↓
生成 Prompt（13种组合矩阵）
    ↓
Pi Agent 使用 Prompt 生成叙事
    ↓
输出叙事 + 完成日期写作
```

---

## 多轮对话交互设计

### Electron 模式下的交互（通过 IPC）

叙事生成的对话通过 Pi Agent 管理，但**用户交互通过 Electron UI** 进行：

```
用户: 在输入框输入"今天和ta去咖啡馆"
    ↓
UI: 显示"正在生成叙事..."
    ↓
[系统] Pi Agent 加载 crush 档案
    ↓
[系统] Pi Agent 直接调用 LLM 生成
    ↓
UI: 显示生成的叙事文本
    ↓
用户: 点击"重新生成"或"确认保存"
```

### Pi Agent 在 Electron 中的角色

Pi Agent 作为 **后台代理**，负责：
1. **管理对话状态**：跟踪用户当前在哪一步
2. **调用工具**：根据用户选择调用相应的工具
3. **生成叙事**：核心功能，直接调用 LLM 生成叙事

UI 负责**渲染和用户交互**，Pi Agent 负责**逻辑决策**。

---

## 关键文件清单

### 新增文件

| 文件路径 | 说明 |
|---------|------|
| `python/cli.py` | Python CLI 统一入口（核心接口） |
| `src/main/index.ts` | Electron 主进程入口 |
| `src/main/ipc.ts` | IPC 处理器 |
| `src/renderer/components/DayWriting/` | 【核心】日写组件 |
| `src/renderer/components/WritingInput/` | 写作输入组件 |
| `src/agent/agent.ts` | Pi Agent 初始化 |
| `src/agent/events.ts` | 事件流处理 |
| `src/tools/day-writer.ts` | 【核心】日写工具 |
| `src/tools/fragment-crud.ts` | 【辅助】碎片管理工具 |
| `src/tools/crush-manager.ts` | 角色管理工具 |
| `src/tools/tag-recommender.ts` | 标签推荐工具 |
| `src/tools/types.ts` | TypeBox 类型定义 |
| `src/services/python-bridge.ts` | Node.js/Python IPC 桥接 |
| `src/services/writing-service.ts` | 写作服务 |
| `.pi/skills/day/SKILL.md` | 叙事生成 Skill |

### 迁移文件（从现有 scripts/）

| 原文件 | 迁移位置 |
|-------|---------|
| `scripts/fragment_models.py` | `python/scripts/` |
| `scripts/fragment_manager.py` | `python/scripts/` |
| `scripts/fragment_prompt_generator.py` | `python/scripts/` |
| `scripts/fragment_state_machine.py` | `python/scripts/` |
| `scripts/fragment_utils.py` | `python/scripts/` |
| `scripts/tag_recommender.py` | `python/scripts/` |
| `scripts/blind_matcher.py` | `python/scripts/` |

---

## 实现步骤（全程 AI 编写代码）

### Phase 0: 技术验证

**AI 负责验证**：
1. Pi Agent SDK 与 Electron 的兼容性
2. Python Bridge 性能基准（子进程调用延迟测试）
3. keytar 与 Electron 的集成测试
4. 流式输出的延迟测试

**AI 编写验证脚本**：
- `tests/validation/test-pi-agent.ts` - Pi Agent SDK 验证
- `tests/validation/test-python-bridge.ts` - Python Bridge 性能测试
- `tests/validation/test-keytar.ts` - keytar 集成测试

**验收标准**：
- 子进程调用延迟 < 500ms
- keytar 成功存储/读取 API Key
- Pi Agent 流式事件正常推送

---

### Phase 1: Python CLI 封装

**AI负责编写**：
1. 创建 `python/cli.py` 统一入口
2. 实现所有 FragmentManager 方法的 CLI 封装
3. 实现 `integrate_prompt` 命令（核心）
4. 添加错误处理和 JSON 序列化

**AI 编写测试**：
- 编写 `tests/unit/test_cli.py` 测试所有 CLI 命令
- 验证 JSON 输入输出格式正确

---

### Phase 2: Node.js Python Bridge

**AI 负责编写**：
1. 创建 `src/services/python-bridge.ts`
2. 实现 `PythonBridge` 类封装 CLI 调用
3. 添加超时和错误处理机制
4. 实现命令调用封装

**AI 编写测试**：
- 编写 `tests/unit/test-python-bridge.ts`
- 验证错误传递和超时机制

---

### Phase 3: Electron UI 基础框架

**AI 负责编写**：
1. 重构 `yourcrush-client/src/` 目录结构
2. 实现 `src/main/index.ts` - Electron 主进程入口
3. 实现 `src/main/window.ts` - 窗口管理
4. 实现 `src/main/ipc.ts` - IPC 处理器
5. 创建 `src/renderer/index.html` - HTML 入口
6. 创建 `src/renderer/App.tsx` - React 应用入口
7. 配置 `package.json` - electron-builder 配置
8. 配置 TypeScript 编译选项

**AI 编写测试**：
- 验证 Electron 应用可正常启动
- 验证窗口显示正确
- 验证 IPC 通信正常

---

### Phase 4: Pi Agent 工具定义（合并为 4 个核心工具）

**AI 负责编写**：
1. 创建 `src/tools/types.ts` - TypeBox 类型定义
2. 创建 `src/tools/day-writer.ts` - 【核心】日写工具
3. 创建 `src/tools/fragment-crud.ts` - 【辅助】碎片管理工具
4. 创建 `src/tools/crush-manager.ts` - 角色管理工具
5. 创建 `src/tools/tag-recommender.ts` - 标签推荐工具

**AI 编写测试**：
- 编写 `tests/unit/test-tools.ts`
- 验证工具参数类型正确
- 验证工具执行逻辑正确
- 验证 action 参数条件必填逻辑

---

### Phase 5: Agent 初始化和 Skill

**AI 负责编写**：
1. 创建 `src/agent/agent.ts` - Agent 初始化和配置
2. 创建 `src/agent/events.ts` - 事件流处理
3. 创建 `src/types/writing.ts` - TypeScript 类型定义
4. 创建 `src/utils/logger.ts` - 日志工具
5. 创建 `src/utils/config.ts` - 配置加载
6. 创建 `.pi/skills/day/SKILL.md` - 叙事生成 Skill 定义
7. 创建 `.pi/skills/fragment/SKILL.md` - 碎片日记 Skill 定义

**AI 编写测试**：
- 验证 Agent 可正常启动
- 验证工具正确加载
- 验证事件流正常

---

### Phase 6: 服务层

**AI 负责编写**：
1. 创建 `src/services/writing-service.ts` - 写作服务
2. 创建 `src/services/fragment-service.ts` - 碎片服务
3. 创建 `src/services/crush-service.ts` - 角色服务
4. 完善类型定义

**AI 编写测试**：
- 编写 `tests/unit/test-services.ts`
- 验证服务层 API 完善

---

### Phase 7: UI 组件开发

**AI 负责编写**：
1. 实现 `src/renderer/components/DayWriting/DayWriting.tsx` - 【核心】日写组件
2. 实现 `src/renderer/components/WritingInput/WritingInput.tsx` - 写作输入组件
3. 实现 `src/renderer/components/FragmentInput/FragmentInput.tsx` - 【辅助】碎片输入组件
4. 实现 `src/renderer/components/FragmentList/FragmentList.tsx` - 碎片列表组件
5. 实现 `src/renderer/components/CrushSelector/CrushSelector.tsx` - 角色选择组件
6. 实现 `src/renderer/components/TagRecommend/TagRecommend.tsx` - 标签推荐组件
7. 实现 `src/renderer/components/AgentConfig/AgentConfig.tsx` - Agent 配置界面
8. 实现 `src/renderer/components/NewUserGuide/NewUserGuide.tsx` - 新手引导
9. 编写相关 CSS 样式

**Agent 配置界面功能**：
- API Key 配置（Anthropic / OpenAI / Google 等）- 使用 keytar 存入系统密钥链
- 模型选择（支持多 Provider）
- Thinking Level 配置
- 角色切换

**API Key 安全存储**：
- 使用 `keytar` 存入系统密钥链（Windows Credential Manager）
- 首次配置后自动填充，无需重复输入
- 卸载应用不遗留敏感数据
- 如 keytar 集成困难，fallback 到 electron-store

**新手引导功能**：
- 首次启动检测和欢迎页
- 创建第一个角色向导
- 功能介绍轮播
- 写作示例展示

---

### Phase 8: 集成测试和文档

**AI 负责编写**：
1. 编写 `tests/integration/test-day-writing.ts` - 叙事生成集成测试
2. 编写 `tests/integration/test-fragment.ts` - 碎片日记集成测试
3. 编写 `README.md` - 项目文档
4. 编写 `docs/API.md` - API 文档
5. 配置 `.github/workflows/ci.yml` - CI/CD 配置
6. 配置 electron-builder 打包配置

**AI 执行验证**：
- 运行所有单元测试
- 运行集成测试
- 执行 `npm run build` 打包验证

---

## 验收标准

每个 Phase 完成后，AI 自检：
1. 代码语法正确（`python -m py_compile` / `tsc --noEmit`）
2. 类型检查通过
3. 单元测试通过
4. 集成测试通过

最终验收：
- Electron 应用可正常启动
- 叙事生成功能正常
- 碎片日记功能正常
- 可成功打包为 `.exe` 文件

---

## 验证方式

1. **Python CLI 测试**：
   ```bash
   python python/cli.py integrate_prompt --params '{"crush_slug": "test", "clue": "今天去咖啡馆"}'
   ```

2. **Electron 启动测试**：
   ```bash
   cd yourcrush-client
   npm run dev  # 开发模式
   ```

3. **端到端测试**：
   - 启动应用 → 选择角色 → 输入事件线索 → 验证叙事生成

4. **打包测试**：
   ```bash
   npm run build  # 构建打包
   # 验证 .exe 可正常安装运行
   ```

---

## 技术要点

### Electron + Pi Agent 集成原则

1. **主进程运行 Agent**：Pi Agent 在 Electron 主进程运行，通过 IPC 与渲染进程通信
2. **渲染进程负责 UI**：React 组件渲染界面，调用主进程 API
3. **事件流推送**：Pi Agent 的流式事件通过 IPC 推送到 UI 层

### 叙事生成核心原则

1. **直接调用 LLM**：叙事生成直接由 Pi Agent 调用 LLM，不经过 Python
2. **Python 仅组装 Prompt**：碎片辅助时，Python 仅负责组装 Prompt 矩阵
3. **角色档案加载**：Pi Agent 在生成前加载 crush 的 memory.md 和 persona.md

### Node.js/Python 集成原则

1. **Python 保持独立**：业务逻辑在 Python 端，Node.js 仅负责调用
2. **标准化接口**：通过 CLI + JSON 实现通信
3. **错误传递**：Python 异常通过 JSON 的 `error` 字段传递
4. **超时控制**：设置 30 秒超时

### Pi Agent 工具设计原则

1. **TypeBox 参数验证**：使用 TypeBox 定义参数类型
2. **返回结构化结果**：统一返回 `{ content, details }` 格式
3. **错误不抛异常**：工具内错误通过返回值报告
4. **流式进度更新**：通过 `onUpdate` 回调支持进度显示

### 统一错误处理

```typescript
// 定义统一的错误类型
class YourCrushError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

enum ErrorCode {
  FRAGMENT_NOT_FOUND = 'FRAGMENT_NOT_FOUND',
  CRUSH_NOT_FOUND = 'CRUSH_NOT_FOUND',
  PYTHON_BRIDGE_ERROR = 'PYTHON_BRIDGE_ERROR',
  API_KEY_MISSING = 'API_KEY_MISSING',
  TOOL_EXECUTION_ERROR = 'TOOL_EXECUTION_ERROR',
}
```

### 流式输出处理

```typescript
// Pi Agent 流式事件 → UI 更新
const handleStreaming = async (event: StreamingEvent) => {
  switch (event.type) {
    case 'text_delta':
      appendToNarrative(event.delta);  // 流式文本 →叙事文本框
      break;
    case 'tool_execution_start':
      showLoading(event.toolName);     // 工具执行 → Loading状态
      break;
    case 'tool_execution_end':
      refreshFragmentList();            // 工具完成 → 刷新列表
      break;
  }
};
```

### 配置管理

```typescript
// src/config/index.ts
interface AppConfig {
  piAgent: {
    model: string;
    thinkingLevel: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    streamFn?: string;
  };
  python: {
    bridgeMode: 'process';  // 固定为子进程调用
    scriptPath: string;
  };
  ui: {
    theme: 'light' | 'dark';
    language: 'zh' | 'en';
  };
}
```

---

## 变更记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-05-31 | v1.0 | 初始版本，基于 Pi Agent SDK 模式重构为 Electron 桌面应用 |