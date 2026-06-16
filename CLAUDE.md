# CLAUDE.md

**语言：所有对话输出使用中文。思维链全程使用中文思考。**

## 项目概述

**核心理念：软件化开发，非技能化开发。**

## 1. 软件化开发原则

**构建可维护、可扩展、可测试的软件系统。**

开发必须遵循：
- **完整性**：每个功能都是完整的软件模块，而非临时脚本
- **结构性**：清晰的目录结构、模块划分、依赖管理
- **可测试性**：编写单元测试、集成测试，确保代码质量
- **文档化**：README、API 文档、代码注释齐全
- **版本控制**：规范的 Git 工作流、语义化版本号

## 2. 项目架构规范

**每个项目必须具备完整的软件工程结构。**

标准项目结构：
```
projectName/
├── src/              # 源代码
├── tests/            # 测试文件
├── docs/             # 文档
├── config/           # 配置文件
├── scripts/          # 构建/部署脚本
├── package.json      # 依赖管理（或对应语言的依赖文件）
├── README.md         # 项目说明
├── .gitignore        # 版本控制忽略规则
└── LICENSE           # 开源协议（如适用）
```

禁止：
- 零散的脚本文件直接放在根目录
- 缺少文档和测试的"一次性"代码
- 硬编码配置，必须使用配置文件或环境变量

## 3. 编码标准

**生产级代码质量，非原型级。**

必须：
- 遵循语言/框架的最佳实践和设计模式
- 实现适当的错误处理和日志记录
- 编写清晰的函数/类文档
- 保持单一职责原则
- 使用类型系统（TypeScript、类型注解等）

禁止：
- 魔法数字和硬编码字符串
- 过长的函数（超过 50 行需重构）
- 深度嵌套（超过 3 层需重构）
- 重复代码（提取为公共模块）

## 4. 测试驱动开发

**没有测试的代码不算完成。**

必须：
- 为每个模块编写单元测试
- 关键路径需要集成测试
- 测试覆盖率不低于 80%
- 测试用例清晰、可重复、独立

## 5. 依赖与配置管理

**显式依赖，环境无关配置。**

必须：
- 使用包管理器（npm、pip、cargo 等）管理依赖
- 锁定依赖版本（package-lock.json、requirements.txt 等）
- 配置与代码分离
- 提供环境变量示例文件（.env.example）

禁止：
- 全局安装依赖
- 硬编码路径、URL、密钥
- 缺少版本锁定的依赖声明

## 6. 文档要求

**代码自解释，文档提供全局视图。**

必须包含：
- **README.md**：项目概述、安装步骤、使用示例、API 说明
- **API 文档**：接口定义、参数说明、返回值、错误码
- **架构文档**：系统设计、模块关系、数据流
- **变更日志**：CHANGELOG.md，记录版本变更

## 7. 版本控制与发布

**语义化版本，规范提交。**

版本号格式：MAJOR.MINOR.PATCH
- MAJOR：不兼容的 API 变更
- MINOR：向后兼容的功能新增
- PATCH：向后兼容的问题修复

提交信息格式：
```
<type>(<scope>): <subject>

类型：feat、fix、docs、style、refactor、test、chore
范围：可选，影响的模块
主题：简洁描述变更
```

## 8. 安全实践

**安全是默认状态，非可选功能。**

必须：
- 输入验证和输出编码
- 使用参数化查询防止 SQL 注入
- 实施认证和授权
- 敏感数据加密存储
- 定期更新依赖，修复安全漏洞

敏感信息处理：
- 使用环境变量或密钥管理服务
- 绝不提交密钥到版本控制
- 自动脱敏日志中的敏感信息

## 9. 项目初始化

**使用 `/init` 命令初始化项目配置。**

新项目开始时必须执行：
```
/init
```

该命令将：
- 扫描项目结构和代码库
- 分析依赖关系和技术栈
- 生成项目特定的配置建议
- 更新 CLAUDE.md 以反映实际项目状态

执行时机：
- 克隆或创建新项目后
- 重大架构变更后
- 技术栈迁移后
- 每个开发会话开始时（推荐）

---

## 项目架构

### 技术栈

- **Python 3.9+** - 脚本和解析器
- **Pi Agent** - 底层代理框架（[GitHub](https://github.com/earendil-works/pi)）
- **JSON** - 数据存储（碎片日记、元数据）
- **Markdown** - 文档和角色数据（memory.md、persona.md）

### Pi Agent 集成

Pi Agent 是本项目的底层代理框架（[GitHub](https://github.com/earendil-works/pi) | [国内文档](https://pi-doc.com/docs/latest/)），负责：
- 加载和执行 Skills
- 管理角色数据和状态
- 处理用户输入和生成输出
- 协调各个模块的交互

**Pi Agent 包结构**：

| 包名 | 用途 |
|------|------|
| `@earendil-works/pi-coding-agent` | 交互式编码代理 CLI |
| `@earendil-works/pi-agent-core` | 代理运行时（工具调用和状态管理） |
| `@earendil-works/pi-ai` | 统一多提供商 LLM API（OpenAI、Anthropic、Google 等） |
| `@earendil-works/pi-tui` | 终端 UI 库（差分渲染） |

**安装方式**：

```bash
# 方式一：npm 全局安装
npm install -g @earendil-works/pi-coding-agent

# 方式二：curl 安装
curl -fsSL https://pi.dev/install.sh | sh
```

**Pi Agent 核心特性**：

1. **有状态代理**：维护对话历史和上下文状态
2. **工具执行**：支持并行和顺序两种工具执行模式
3. **事件流**：实时事件推送，支持 UI 更新和进度显示
4. **多模型支持**：集成 Anthropic、OpenAI、Google 等多种 LLM 提供商
5. **自定义消息类型**：通过声明合并扩展 AgentMessage
6. **Steering 和 Follow-up**：支持中断代理和队列后续工作
7. **可组合扩展**：通过 `.pi/skills/` 目录添加自定义扩展
8. **会话管理**：默认存储在 `~/.pi/agent/sessions`

**Pi Agent 架构**：

```typescript
// 核心类
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  initialState: {
    systemPrompt: "You are a helpful assistant.",
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
  },
});

// 事件订阅
agent.subscribe((event) => {
  if (event.type === "message_update") {
    // 处理流式更新
  }
});

// 发送提示
await agent.prompt("Hello!");
```

**事件系统**：

| 事件类型 | 描述 |
|---------|------|
| `agent_start` | 代理开始处理 |
| `agent_end` | 代理运行结束 |
| `turn_start` | 新回合开始 |
| `turn_end` | 回合完成 |
| `message_start` | 消息开始 |
| `message_update` | 消息更新（流式） |
| `message_end` | 消息完成 |
| `tool_execution_start` | 工具开始执行 |
| `tool_execution_update` | 工具执行进度 |
| `tool_execution_end` | 工具执行完成 |

**工具定义示例**：

```typescript
import { Type } from "typebox";

const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    const content = await fs.readFile(params.path, "utf-8");
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};
```

**配置文件**：
- `.claude/skills/` - Skill 定义和配置
- `crushes/<slug>/` - 角色数据存储
- `scripts/` - Python 脚本和工具

**Pi Agent 版本**：0.78.0（@earendil-works/pi-agent-core）

> 完整的 Pi Agent 开发文档请参阅 [docs/PI_AGENT_REFERENCE.md](docs/PI_AGENT_REFERENCE.md)。

### 项目结构

> 当前处于 `重构` 分支，正在按 [ADR-0003](docs/adr/0003-electron-refactoring.md) 从 Claude Code Skills 迁移到 Electron + Pi Agent SDK 桌面应用。结构会随重构推进变化，更新本段时请同步。

```
yourcrush/
├── src/                            # Electron 应用源码（TypeScript）
│   ├── main/                       # 主进程
│   │   ├── main.ts                 # 入口
│   │   ├── ipc.ts                  # IPC 通信
│   │   └── preload.ts              # 预加载脚本
│   ├── renderer/                   # 渲染进程（React）
│   │   ├── App.tsx                 # 应用根
│   │   ├── main.tsx                # 渲染入口
│   │   ├── index.html
│   │   ├── pages/                  # 路由页面
│   │   │   ├── CrushPage.tsx       # 角色页
│   │   │   ├── DayPage.tsx         # 日间写作页
│   │   │   ├── FragmentPage.tsx    # 碎片日记页
│   │   │   ├── SettingsPage.tsx    # 设置页
│   │   │   ├── UpdatePage.tsx      # 更新页
│   │   │   └── HelpPage.tsx        # 帮助页
│   │   ├── components/             # 组件
│   │   │   ├── Layout.tsx / Sidebar.tsx
│   │   │   ├── DayWriting/         # Day 写作组件
│   │   │   └── WritingInput/       # 写作输入组件
│   │   ├── stores/                 # Zustand 状态（crush/day/fragment store）
│   │   ├── services/               # 业务服务（TypeScript，取代 Python 逻辑）
│   │   │   ├── crushService.ts
│   │   │   ├── dayService.ts
│   │   │   └── fragmentService.ts
│   │   └── hooks/
│   ├── agent/                      # Pi Agent 集成
│   │   ├── agent.ts                # 代理实例
│   │   └── tools/                  # Agent 工具（crushTool / dayTool / fragmentTool）
│   └── scripts/                    # 过渡用 Python 脚本（将逐步迁移到 src/renderer/services）
│       ├── fragment/               # 碎片模块（外观模式：manager 委托 crud/locker/integrator/backup/storage）
│       ├── day/ parsers/ utils/    # Day / 解析 / 工具
│       ├── init_template.py        # 角色模板初始化
│       └── toggle_intimate.py      # 亲密内容开关
├── crushes/                        # 角色数据存储（运行时数据）
│   ├── TEMPLATE/                   # 空白角色模板
│   ├── example/  demo/             # 示例/演示角色
├── tests/                          # 测试
│   ├── unit/                       # 单元测试（test_crush / test_day / test_fragment）
│   ├── integration/                # 集成测试（test_day_integration / test_fragment_integration）
│   └── e2e/                        # Playwright 端到端（test_app.spec.ts）
├── tags/                           # 标签库（tag_library.json）
├── examples/                       # 示例数据（demo/memories、demo/plans）
├── user/                           # 用户档案（profile.md、writing_style.md）
├── docs/                           # 文档
│   ├── adr/                        # 架构决策记录（0001~0003）
│   ├── agents/                     # Agent 协作约定（issue-tracker / triage-labels / domain）
│   ├── features/                   # 功能 PRD（fragment-journal-prd、relationship-progress-prd）
│   ├── PI_AGENT_REFERENCE.md       # Pi Agent 参考
│   ├── REFACTORING_PLAN.md         # 重构计划
│   ├── CLIENT_STATUS.md            # 客户端实现状态
│   ├── WRITING_STANDARDS.md        # 写作标准
│   └── …
├── .github/workflows/ci.yml        # CI/CD
├── viewer/                         # Day 阅读器（单文件 HTML）
├── dist/                           # 构建产物（.gitignore）
├── release/                        # 打包输出
├── package.json                    # 依赖（Electron 28 / React 18 / Pi Agent 0.78 / Zustand）
├── vite.config.ts                  # 渲染进程构建
├── tsconfig*.json                  # TypeScript 配置（base/main/node）
├── electron-builder.yml            # 打包配置
├── README.md / CONTRIBUTING.md / CONTENT_POLICY.md / SECURITY.md / LICENSE
├── Dockerfile / docker-compose.yml # Docker 部署（旧形态，重构后评估是否保留）
└── .gitignore
```

**已删除（重构移除）**：`.claude/skills/`（create-crush / create-user / day / progress）、`yourcrush-client/`、顶层 `scripts/`、`.pi/`、`src/scripts/utils/date_utils.py`。

**待清理 / 未跟踪**：`.agents/`、`.claude/skills/<开发工具>`（caveman、tdd、prototype 等第三方 skills，属开发工具，非项目业务）、`skills-lock.json`、`CONTEXT.md`（已纳入领域文档）。

### 数据流

```
用户输入碎片（来源+情绪+内容）
    ↓
TagRecommender 推荐标签（含降频策略）
    ↓
FragmentManager.record_fragment() 记录碎片
    ↓
FragmentStateMachine 状态判断和权限检查
    ↓
FragmentPromptGenerator 生成 Prompt（13种组合矩阵）
    ↓
day Skill 生成叙事文本
    ↓
存储到 crushes/<slug>/fragments/<date>.json
```

### 碎片日记状态机

```
EDITABLE（可编辑）
    ↓ 用户触发写作
READONLY_REGENERABLE（只读，可重新生成）
    ↓ 用户确认
READONLY_FINAL（只读，不可修改）
```

日期状态：
- **IN_PROGRESS**（进行中）：碎片所属日期 = 当前日期
- **UNFINISHED**（未完成）：7天内未完成，可整合
- **EXPIRED**（已过期）：超过7天，只读归档
- **COMPLETED**（已完成）：不可编辑、不可删除

---

## 常用开发命令

### 测试

```bash
# 运行所有测试
pytest

# 运行单个测试文件
pytest tests/test_fragment.py

# 运行特定测试函数
pytest tests/test_fragment.py::test_fragment_utils
```

### 语法检查

```bash
# 检查单个 Python 文件语法
python -m py_compile scripts/fragment_models.py

# 检查所有 Python 文件
find . -name "*.py" -exec python -m py_compile {} \;
```

### Lint 检查

```bash
# 检查是否有私密信息泄露
grep -r "小明\|xiaoming\|李薇" . --include="*.py" --include="*.md" --include="*.yml"

# 检查 Markdown 格式
for f in docs/*.md; do
  grep -qE "^#\s*$" "$f" && echo "Empty title in $f"
  grep -qE "\s+$" "$f" && echo "Trailing whitespace in $f"
done
```

### 角色管理（重构后）

角色管理功能已迁移到 `yourcrush-client/src/services/` 目录，使用 TypeScript 实现。

### Skill 命令（Pi Agent）

```bash
# 添加 Skill
claude skill add ./day
claude skill add ./.claude/skills

# 查看已添加的 Skill
claude skill list

# 运行 Skill
claude skill run create-crush    # 角色创建
claude skill run day             # 日常写作
claude skill run progress        # 进度追踪
```

**注意**：以上命令基于 Claude Code Skills 接口。如果 Pi Agent 使用不同的命令格式，请参考 [Pi Agent 文档](https://github.com/earendil-works/pi) 进行调整。

### Pi Agent 配置示例

**TypeScript 配置**：

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

// 创建代理实例
const agent = new Agent({
  initialState: {
    systemPrompt: `你是一个恋爱日记助手，帮助用户记录与 crush 的日常生活。
    请使用温暖、细腻的语言，注重心理描写和情感表达。`,
    model: getModel("anthropic", "claude-sonnet-4-20250514"),
    thinkingLevel: "medium",
  },
  toolExecution: "parallel",  // 并行执行工具
  steeringMode: "one-at-a-time",
  followUpMode: "one-at-a-time",
});

// 定义工具
const recordFragmentTool: AgentTool = {
  name: "record_fragment",
  label: "Record Fragment",
  description: "记录一个碎片日记",
  parameters: Type.Object({
    origin: Type.String({ description: "来源：user/crush/ambient" }),
    mood: Type.String({ description: "情绪：positive/negative/neutral/mixed" }),
    content: Type.String({ description: "碎片内容" }),
    env_tags: Type.Array(Type.String(), { description: "环境标签" }),
    behavior_tags: Type.Array(Type.String(), { description: "行为标签" }),
  }),
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 重构后：直接使用 TypeScript 服务处理碎片
    // const result = await fragmentManager.record(params);
    return {
      content: [{ type: "text", text: "碎片已记录" }],
      details: { success: true },
    };
  },
};

// 添加工具到代理
agent.state.tools = [recordFragmentTool];

// 事件订阅
agent.subscribe(async (event) => {
  switch (event.type) {
    case "message_start":
      console.log("开始处理消息...");
      break;
    case "message_update":
      // 流式输出
      process.stdout.write(event.assistantMessageEvent.delta);
      break;
    case "tool_execution_start":
      console.log(`执行工具: ${event.toolName}`);
      break;
    case "tool_execution_end":
      console.log(`工具执行完成: ${event.toolName}`);
      break;
    case "agent_end":
      console.log("处理完成");
      break;
  }
});

// 发送提示
await agent.prompt("今天她发了一个可爱的表情包，我好开心");
```

**Steering 和 Follow-up 使用**：

```typescript
// 在代理运行时中断
agent.steer({
  role: "user",
  content: "等等，我想先记录另一个碎片",
  timestamp: Date.now(),
});

// 在代理完成后添加后续工作
agent.followUp({
  role: "user",
  content: "请总结今天的碎片",
  timestamp: Date.now(),
});
```

**状态管理**：

```typescript
// 访问代理状态
console.log(agent.state.isStreaming);      // 是否正在流式处理
console.log(agent.state.messages);          // 消息历史
console.log(agent.state.pendingToolCalls); // 待处理的工具调用

// 更新状态
agent.state.systemPrompt = "新的系统提示";
agent.state.model = getModel("openai", "gpt-4o");
agent.state.thinkingLevel = "high";

// 重置代理
agent.reset();
```

---

## 代码规范

### Python 代码

- 遵循 PEP 8 规范
- 使用类型注解（typing）
- 数据类使用 `@dataclass` 装饰器
- 枚举类使用 `Enum` 基类

### 文档规范

- 所有文档保持中英双语
- 使用清晰的标题层次
- 代码示例使用 Markdown 代码块

### 提交规范

- 提交前运行 `python -m py_compile` 检查语法
- 提交前运行 `grep` 检查私密信息
- 分支命名：`feature/*`、`fix/*`

---

## 关键设计决策

### 碎片日记架构

1. **三层标签体系**：核心维度（来源+情绪）→ 场景标签（环境+行为）→ 用户标签
2. **四种写作模式**：Raw（自由）、Guided（引导）、Themed（主题）、Blind（盲写）
3. **乐观锁机制**：版本号校验，防止并发冲突
4. **降频策略**：连续跳过3次 → 阈值从50%提高到70%

### 数据存储

- 所有数据存储在本地 `crushes/<slug>/` 目录
- 碎片按日期存储：`crushes/<slug>/fragments/<date>.json`
- 使用 JSON 格式，支持序列化/反序列化

### 状态管理

- 状态机驱动：EDITABLE → READONLY_REGENERABLE → READONLY_FINAL
- 日期状态自动计算：IN_PROGRESS → UNFINISHED → EXPIRED
- 已完成状态不可逆

### Pi Agent 与 TypeScript 服务集成

Pi Agent（TypeScript/Node.js）直接调用 TypeScript 服务，无需 Python 桥接：

```typescript
// 重构后：直接使用 TypeScript 服务
import { FragmentManager } from './services/fragment-manager';
import { WritingService } from './services/writing-service';

// 初始化服务
const fragmentManager = new FragmentManager();
const writingService = new WritingService();

// 在工具中使用
const recordFragmentTool: AgentTool = {
  name: "record_fragment",
  description: "记录碎片日记",
  execute: async (toolCallId, params) => {
    const result = await fragmentManager.record({
      action: "record",
      crush_slug: params.crush_slug,
      fragment_data: params.fragment_data,
    });
    return { content: [{ type: "text", text: result }] };
  },
};
```

**集成要点**：
- 所有业务逻辑使用 TypeScript 实现
- Pi Agent 直接调用 TypeScript 服务
- 类型安全，IDE 支持更好
- 无需 Python 运行时依赖

### Pi Agent 扩展系统

Pi Agent 支持通过 `.pi/skills/` 目录添加自定义扩展：

```
.pi/
└── skills/
    └── yourcrush/
        ├── package.json          # 扩展配置
        ├── index.ts              # 扩展入口
        └── tools/                # 自定义工具
            └── fragment.ts       # 碎片日记工具
```

**扩展配置示例**（package.json）：

```json
{
  "name": "yourcrush-skill",
  "version": "1.0.0",
  "pi": {
    "extensions": ["index.ts"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": ">=0.74.0"
  }
}
```

**注册自定义命令**：

```typescript
import { pi } from "@earendil-works/pi-coding-agent";

// 注册 /record-fragment 命令
pi.registerCommand("record-fragment", {
  description: "记录一个碎片日记",
  handler: async (ctx, args) => {
    // 处理碎片记录逻辑
    ctx.ui.notify("碎片已记录");
  },
});
```

**会话数据存储**：
- 默认位置：`~/.pi/agent/sessions/`
- 可通过配置自定义存储路径
- 支持会话持久化和恢复

---

## 项目特有约束

### 私密信息保护

**绝不包含真实人物信息到代码库。**

提交前运行：
```bash
grep -r "小明\|xiaoming\|李薇" . --include="*.py" --include="*.md" --include="*.yml"
```

应返回空（CONTRIBUTING.md 和 ci.yml 中的检测模式除外）。

### 亲密内容处理

亲密内容模块（INTIMATE_KNOWLEDGE.md）**默认关闭**。

- 用户必须通过 `toggle_intimate.py --enable` 显式启用
- `SKILL.md` 检查 `.intimate_config` 配置决定是否加载
- 配置缺失时默认为不加载

### 写作标准约束

- 禁止使用破折号「——」
- 禁止过度使用省略号「...」
- 禁止硬编码 Day 数字或具体日期

### 时间线保护

- 禁止硬编码 Day 数字或具体日期
- 时间线必须通过动态计算得出

---

## Git 与 PR 规则

**安全操作，可验证结果。**

必须：
- 解决合并冲突后，必须读取冲突文件验证解决结果
- 提交后运行 `git diff HEAD~1 --stat` 验证实际提交了什么
- `.gitignore` 必须包含：`node_modules/`、`*.tgz`、`dist/`、`out/`、`__pycache__/`
- 分支命名：`feature/*`、`fix/*`、`refactor/*`

禁止：
- 用 `git rebase` 删除文件或修改 PR 内容——用新 commit
- 在没有检查现有 PR 的情况下创建重复 PR
- force push 到 master/main 分支
- 提交包含敏感信息（密钥、token、密码）

当 Git 操作复杂度超过简单 commit/push 时：
- 先说明计划，再执行
- 如果 rebase/冲突解决失败超过 2 次，停下来让我手动处理
- 永远不要在我不知情的情况下 force push

---

## Agent skills

### Issue tracker

Issues live in GitHub Issues（leaves899/yourlovestory）. See `docs/agents/issue-tracker.md`.

### Triage labels

使用默认标签：needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — 一个 CONTEXT.md + docs/adr/ 在项目根目录. See `docs/agents/domain.md`.

---

## 参考链接

### Pi Agent 相关
- **GitHub 仓库**: [earendil-works/pi](https://github.com/earendil-works/pi)
- **国内文档**: [pi-doc.com](https://pi-doc.com/)
- **Pi Agent Core**: [@earendil-works/pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent)
- **Pi AI**: [@earendil-works/pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)
- **Pi Coding Agent**: [@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)
- **Pi TUI**: [@earendil-works/pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui)
- **参考文档**: [docs/PI_AGENT_REFERENCE.md](docs/PI_AGENT_REFERENCE.md)
- **版本**: 0.78.0

### 项目文档
- **README.md**: 项目概述和快速开始
- **CONTRIBUTING.md**: 贡献指南
- **docs/SKILL_SYSTEM.md**: Skill 系统详细说明
- **docs/WRITING_STANDARDS.md**: 写作标准规范
- **docs/TEMPLATE_GUIDE.md**: 模板使用指南
- **docs/CONFIGURATION.md**: 配置指南
- **docs/features/fragment-journal-prd.md**: 碎片日记 PRD

### 外部依赖
- **Python 3.9+**: 脚本运行环境
- **Node.js 22.19.0+**: Pi Agent 运行环境
- **Anthropic Claude**: 默认 LLM 提供商
- **OpenAI GPT**: 备选 LLM 提供商
- **Google Gemini**: 备选 LLM 提供商

---

**软件化开发的标志：** 每个项目都是可独立部署、可维护、可扩展的完整系统，而非临时脚本或技能插件的集合。
