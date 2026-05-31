# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**语言：所有对话输出使用中文。思维链全程使用中文思考。**

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

```
yourcrush/
├── .claude/                        # Claude Code 配置目录
│   └── skills/                     # Pi Agent Skills（底层代理框架）
│       ├── create-crush/           # 角色创建工具
│       │   ├── prompts/            # 分析和构建 Prompt
│       │   │   ├── intake.md       # 输入收集
│       │   │   ├── memory_analyzer.md  # 记忆分析
│       │   │   ├── memory_builder.md   # 记忆构建
│       │   │   ├── merger.md       # 合并器
│       │   │   ├── persona_analyzer.md # 性格分析
│       │   │   └── persona_builder.md  # 性格构建
│       │   └── tools/              # 辅助脚本
│       │       ├── day_pipeline.py     # Day 处理流水线
│       │       ├── context_generator.py # 上下文生成器
│       │       ├── persona_splitter.py  # 性格分割器
│       │       ├── wechat_parser.py     # 微信聊天解析
│       │       ├── qq_parser.py         # QQ 聊天解析
│       │       ├── social_parser.py     # 社交媒体解析
│       │       ├── photo_analyzer.py    # 照片分析
│       │       ├── intimate_extractor.py # 亲密内容提取
│       │       ├── skill_writer.py      # Skill 写入器
│       │       ├── day_checker.py       # Day 检查器
│       │       ├── day_updater.py       # Day 更新器
│       │       ├── pre_write_check.py   # 写入前检查
│       │       ├── wordcount.py         # 字数统计
│       │       ├── version_manager.py   # 版本管理
│       │       └── fix_*.py             # 各种修复脚本
│       ├── create-user/            # 用户档案创建
│       ├── day/                    # 日常写作（含碎片日记）
│       │   ├── SKILL.md            # Day Skill 配置
│       │   └── fragments/          # 碎片日记配置
│       │       ├── fragment_input.md       # 碎片输入指南
│       │       ├── fragment_integrate.md   # 碎片整合指南
│       │       ├── fragment_prompts.md     # 碎片 Prompt
│       │       └── fragment_settings.md    # 碎片设置
│       └── progress/               # 进度追踪
│           └── SKILL.md            # Progress Skill 配置
├── crushes/                        # 角色数据存储
│   ├── TEMPLATE/                   # 空白模板
│   │   ├── memory.md               # 关系记忆模板
│   │   ├── persona.md              # 人物性格模板
│   │   ├── meta.json               # 元数据模板
│   │   ├── SKILL.md                # Skill 配置模板
│   │   ├── CONTEXT.md              # 压缩上下文模板
│   │   ├── WEEKDAY.md              # 星期速查表模板
│   │   ├── PROMPT.md               # Prompt 记录模板
│   │   ├── INTIMATE_KNOWLEDGE.md   # 亲密知识库模板
│   │   ├── .intimate_config        # 亲密内容开关
│   │   ├── memories/               # 聊天记录目录
│   │   │   └── chats/
│   │   └── plans/                  # 日程规划目录
│   ├── example/                    # 示例角色
│   └── demo/                       # 演示角色
├── scripts/                        # 核心 Python 模块
│   ├── fragment_models.py          # 碎片数据模型（Fragment、FragmentDay）
│   ├── fragment_utils.py           # 工具函数（ID 生成、时间处理、验证）
│   ├── fragment_state_machine.py   # 状态机（EDITABLE→READONLY_REGENERABLE→READONLY_FINAL）
│   ├── fragment_manager.py         # 碎片管理器（CRUD、整合、乐观锁）
│   ├── fragment_prompt_generator.py # Prompt 生成器（13种组合矩阵）
│   ├── tag_recommender.py          # 标签推荐器（含降频策略）
│   ├── blind_matcher.py            # Blind 模式匹配器（关键词+语义相似度）
│   ├── init_template.py            # 初始化新角色模板
│   └── toggle_intimate.py          # 亲密内容开关
├── tags/                           # 标签库
│   └── tag_library.json            # 环境标签和行为标签定义
├── tests/                          # 测试文件
│   └── test_fragment.py            # 碎片日记测试（77 项用例）
├── docs/                           # 文档目录
│   ├── SKILL_SYSTEM.md             # Skill 系统说明
│   ├── WRITING_STANDARDS.md        # 写作标准规范
│   ├── TEMPLATE_GUIDE.md           # 模板使用指南
│   ├── CONFIGURATION.md            # 配置指南
│   ├── PI_AGENT_REFERENCE.md       # Pi Agent 参考文档
│   └── features/                   # 功能 PRD
│       ├── fragment-journal-prd.md # 碎片日记 PRD
│       └── relationship-progress-prd.md # 关系进展 PRD
├── examples/                       # 示例目录
│   └── demo/                       # 演示数据
│       ├── memories/               # 示例聊天记录
│       └── plans/                  # 示例日程规划
├── user/                           # 用户档案
│   ├── profile.md                  # 用户性格档案
│   └── writing_style.md            # 写作风格偏好
├── .pi/                            # Pi Agent 配置目录
│   └── skills/                     # 自定义扩展
│       └── yourcrush/              # yourcrush 扩展
├── yourcrush-client/               # Pi Agent 客户端（Node.js）
│   └── node_modules/
│       └── @earendil-works/        # Pi Agent 核心包
│           ├── pi-agent-core/      # 代理核心（v0.78.0）
│           ├── pi-ai/              # AI 模型集成
│           ├── pi-coding-agent/    # 编码代理 CLI
│           └── pi-tui/             # 终端 UI 库
├── .github/                        # GitHub 配置
│   └── workflows/
│       └── ci.yml                  # CI/CD 配置
├── README.md                       # 项目说明
├── CONTRIBUTING.md                 # 贡献指南
├── CODE_OF_CONDUCT.md              # 行为准则
├── CONTENT_POLICY.md               # 内容政策
├── SECURITY.md                     # 安全政策
├── LICENSE                         # MIT 开源协议
├── Dockerfile                      # Docker 配置
├── docker-compose.yml              # Docker Compose 配置
├── docker-run.sh                   # Docker 运行脚本
└── .gitignore                      # Git 忽略规则
```

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

### 角色管理

```bash
# 初始化新角色模板
python scripts/init_template.py --name "小明" --nickname "小雪" --slug "xiaoxue"

# 切换亲密内容开关
python scripts/toggle_intimate.py --slug "xiaoxue" --enable
python scripts/toggle_intimate.py --slug "xiaoxue" --disable
python scripts/toggle_intimate.py --slug "xiaoxue" --status
```

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
    // 调用 Python 脚本处理碎片
    const result = await execPythonScript("scripts/fragment_manager.py", params);
    return {
      content: [{ type: "text", text: result }],
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

### Pi Agent 与 Python 脚本集成

Pi Agent（TypeScript/Node.js）与 Python 脚本通过子进程调用集成：

```typescript
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function execPythonScript(scriptPath: string, params: any): Promise<string> {
  const paramsJson = JSON.stringify(params);
  const command = `python ${scriptPath} --params '${paramsJson}'`;

  const { stdout, stderr } = await execAsync(command);

  if (stderr) {
    throw new Error(`Python script error: ${stderr}`);
  }

  return stdout;
}

// 在工具中使用
const recordFragmentTool: AgentTool = {
  name: "record_fragment",
  description: "记录碎片日记",
  execute: async (toolCallId, params) => {
    const result = await execPythonScript("scripts/fragment_manager.py", {
      action: "record",
      crush_slug: params.crush_slug,
      fragment_data: params.fragment_data,
    });
    return { content: [{ type: "text", text: result }] };
  },
};
```

**集成要点**：
- Python 脚本负责数据处理和业务逻辑
- Pi Agent 负责对话管理和工具编排
- 通过 JSON 格式传递参数和结果
- 错误通过 stderr 和异常处理机制传递

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
