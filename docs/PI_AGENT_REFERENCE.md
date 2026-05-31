# Pi Agent 参考文档

> 基于 [pi-doc.com](https://pi-doc.com/) 官方文档整理，版本 0.78.0

Pi 是一个极简的终端编码助手。它的核心设计保持轻量，同时通过 TypeScript 扩展、Skill（技能）、Prompt 模板、主题和 Pi 软件包进行扩展。

**核心理念**：基元而非功能——子代理、计划模式、权限门禁、SSH 执行、沙箱、MCP 集成等高级功能均可通过扩展自行构建，而非内置于核心中。

---

## 目录

- [包结构](#包结构)
- [四种运行模式](#四种运行模式)
- [核心特性](#核心特性)
- [安装与认证](#安装与认证)
- [上下文工程体系](#上下文工程体系)
- [Agent 完整配置选项](#agent-完整配置选项)
- [Agent 状态与方法](#agent-状态与方法)
- [工具定义](#工具定义)
- [Steering 和 Follow-up](#steering-和-follow-up)
- [Pi AI 统一 LLM API](#pi-ai-统一-llm-api)
- [Streaming 事件参考](#streaming-事件参考)
- [Thinking/Reasoning](#thinkingreasoning)
- [图片输入与生成](#图片输入与生成)
- [支持的 Providers 与环境变量](#支持的-providers-与环境变量)
- [自定义模型](#自定义模型)
- [低级 API（agentLoop）](#低级-apiagentloop)
- [Quickstart 操作指南](#quickstart-操作指南)
- [参考链接](#参考链接)

---

## 包结构

| 包名 | 版本 | 用途 |
|------|------|------|
| `@earendil-works/pi-coding-agent` | 0.78.0 | 交互式编码代理 CLI |
| `@earendil-works/pi-agent-core` | 0.78.0 | 代理运行时（工具调用、状态管理、事件流） |
| `@earendil-works/pi-ai` | 0.78.0 | 统一多提供商 LLM API（Anthropic、OpenAI、Google 等） |
| `@earendil-works/pi-tui` | 0.78.0 | 终端 UI 库（差分渲染） |

## 四种运行模式

| 模式 | 命令 | 用途 |
|------|------|------|
| 交互模式 | `pi` | 完整 TUI 体验，适合日常使用 |
| Print/JSON 模式 | `pi -p "query"` | 一次性查询，适合脚本集成 |
| RPC 模式 | `pi --mode rpc` | 通过 stdin/stdout JSONL 进程集成 |
| SDK 模式 | `npm install @earendil-works/pi-agent-core` | 嵌入 Node.js 应用 |

## 核心特性

1. **有状态代理**：维护对话历史和上下文状态
2. **工具执行**：支持并行（parallel，默认）和顺序（sequential）两种工具执行模式
3. **事件流**：实时事件推送，支持 UI 更新和进度显示
4. **多模型支持**：集成 Anthropic、OpenAI、Google 等 20+ LLM 提供商
5. **自定义消息类型**：通过声明合并扩展 AgentMessage
6. **Steering 和 Follow-up**：支持中断代理和队列后续工作
7. **可组合扩展**：通过 `.pi/skills/` 目录添加自定义扩展
8. **会话管理**：树形结构存储，分支导航，支持共享

## 安装与认证

```bash
# 安装
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 或 curl 安装（Linux/macOS）
curl -fsSL https://pi.dev/install.sh | sh
```

**认证方式一：订阅登录**（在 Pi 内执行 `/login`）

支持 Claude Pro/Max、ChatGPT Plus/Pro (Codex)、GitHub Copilot。

**认证方式二：API Key**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

## 上下文工程体系

Pi Agent 提供多层上下文工程，用于精确控制模型行为。

### 上下文文件层级

| 层级 | 文件 | 作用范围 |
|------|------|----------|
| 全局指令 | `~/.pi/agent/AGENTS.md` | 所有项目 |
| 项目指令 | 父目录到当前目录的 `AGENTS.md` 或 `CLAUDE.md` | 当前项目 |
| 系统提示 | `SYSTEM.md` | 按项目替换系统提示 |
| 按需加载 | Skills | 按需加载的能力包 |

### Compaction（上下文压缩）

自动对早期消息进行摘要和剪枝，管理上下文窗口。通过 `transformContext` 钩子实现自定义压缩策略。

### 会话树形导航

会话以树形结构存储，使用 `/tree` 导航到任意历史点继续对话。`/share` 可上传到 GitHub Gist 获得可分享链接。

## Agent 完整配置选项

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";

const agent = new Agent({
  // 初始状态
  initialState: {
    systemPrompt: string,
    model: Model<any>,
    thinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh",
    tools: AgentTool<any>[],
    messages: AgentMessage[],
  },

  // 消息转换管道（自定义消息类型时必须）
  // AgentMessage[] → transformContext() → AgentMessage[] → convertToLlm() → Message[] → LLM
  convertToLlm: (messages) => messages.filter(...),

  // 上下文预处理（剪枝、压缩）
  transformContext: async (messages, signal) => pruneOldMessages(messages),

  // Steering 模式：默认 "one-at-a-time"
  steeringMode: "one-at-a-time" | "all",

  // Follow-up 模式：默认 "one-at-a-time"
  followUpMode: "one-at-a-time" | "all",

  // 自定义流函数（用于代理后端）
  streamFn: streamProxy,

  // 会话 ID（用于 Provider 缓存）
  sessionId: "session-123",

  // 动态 API Key 解析（用于 OAuth 令牌刷新）
  getApiKey: async (provider) => refreshToken(),

  // 工具执行模式：默认 "parallel"
  toolExecution: "parallel" | "sequential",

  // 工具前置钩子（验证后可阻止执行）
  beforeToolCall: async ({ toolCall, args, context }) => {
    if (toolCall.name === "bash") {
      return { block: true, reason: "bash is disabled" };
    }
  },

  // 工具后置钩子（处理结果后决定是否终止）
  afterToolCall: async ({ toolCall, result, isError, context }) => {
    if (toolCall.name === "notify_done" && !isError) {
      return { terminate: true };
    }
  },

  // 自定义思考预算（基于 token 的 Provider）
  thinkingBudgets: {
    minimal: 128,
    low: 512,
    medium: 1024,
    high: 2048,
  },
});
```

## Agent 状态与方法

### AgentState 接口

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  tools: AgentTool<any>[];
  messages: AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

访问状态通过 `agent.state`。赋值时顶层数组会被复制，修改返回的数组将修改当前状态。

### Agent 方法参考

| 方法 | 说明 |
|------|------|
| `agent.prompt("Hello")` | 文本提示 |
| `agent.prompt("What's this?", [{type:"image", data, mimeType}])` | 带图片的提示 |
| `agent.prompt({role:"user", content:"Hello", timestamp})` | 直接传入 AgentMessage |
| `agent.continue()` | 从当前上下文继续（最后消息须为 user 或 toolResult） |
| `agent.abort()` | 取消当前操作 |
| `agent.waitForIdle()` | 等待完成 |
| `agent.reset()` | 重置代理状态 |
| `agent.subscribe(fn)` | 订阅事件，返回 unsubscribe 函数 |
| `agent.steer(msg)` | 在代理运行时中断并发送新指令 |
| `agent.followUp(msg)` | 在当前工作完成后添加后续任务 |

## 工具定义

```typescript
import { Type } from "typebox";

const readFileTool: AgentTool = {
  name: "read_file",
  label: "Read File",         // 用于 UI 显示
  description: "Read a file's contents",
  parameters: Type.Object({
    path: Type.String({ description: "File path" }),
  }),
  // 覆盖执行模式：sequential 强制整个批次串行执行
  executionMode?: "sequential" | "parallel",
  execute: async (toolCallId, params, signal, onUpdate) => {
    // 可选：流式进度更新
    onUpdate?.({ content: [{ type: "text", text: "Reading..." }], details: {} });

    // 错误处理：抛出错误而非返回错误内容
    if (!fs.existsSync(params.path)) {
      throw new Error(`File not found: ${params.path}`);
    }

    // terminate: true 可提示跳过后续 LLM 调用（需所有工具同时设置）
    return {
      content: [{ type: "text", text: content }],
      details: { path: params.path, size: content.length },
    };
  },
};
```

**错误处理原则**：抛出错误而非返回错误消息内容。错误会被 agent 捕获并以 `isError: true` 报告给 LLM。

## Steering 和 Follow-up

```typescript
// 在代理运行时中断
agent.steer({
  role: "user",
  content: "Stop! Do this instead.",
  timestamp: Date.now(),
});

// 在代理完成后添加后续工作
agent.followUp({
  role: "user",
  content: "Also summarize the result.",
  timestamp: Date.now(),
});

// 队列管理
agent.steeringMode = "one-at-a-time";  // 或 "all"
agent.followUpMode = "one-at-a-time";
agent.clearSteeringQueue();
agent.clearFollowUpQueue();
agent.clearAllQueues();
```

## Pi AI 统一 LLM API

`@earendil-works/pi-ai` 提供统一的多提供商 LLM API，支持自动模型发现、Provider 配置、Token 和成本追踪，以及跨 Provider 无缝切换。

### 快速开始

```typescript
import { Type, getModel, stream, complete, Context, Tool } from '@earendil-works/pi-ai';

// 获取模型（带类型安全的自动补全）
const model = getModel('openai', 'gpt-4o-mini');

// 构建对话上下文（可序列化、可跨模型传递）
const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'What time is it?' }],
  tools: [{
    name: 'get_time',
    description: 'Get the current time',
    parameters: Type.Object({
      timezone: Type.Optional(Type.String({ description: 'Timezone' }))
    })
  }]
};

// 流式 API
const s = stream(model, context);
for await (const event of s) {
  switch (event.type) {
    case 'text_delta': process.stdout.write(event.delta); break;
    case 'toolcall_end': console.log('Tool:', event.toolCall.name); break;
    case 'done': console.log('Done:', event.reason); break;
  }
}
const finalMessage = await s.result();
context.messages.push(finalMessage);

// 非流式 API
const response = await complete(model, context);
```

### 跨 Provider 切换

消息在不同 Provider 间自动转换。不同 Provider 的 assistant 消息中的 thinking 块会被转为带 `<thinking>` 标签的文本。所有 Provider 可以处理来自其他 Provider 的消息类型，包括 text、tool calls、thinking 块等。

### 上下文序列化

`Context` 对象可通过 `JSON.stringify()` 直接序列化，支持持久化和恢复。

```typescript
const serialized = JSON.stringify(context);
localStorage.setItem('conversation', serialized);
const restored: Context = JSON.parse(localStorage.getItem('conversation')!);
```

## Streaming 事件参考

所有 streaming 事件在 assistant 消息生成期间发出：

| 事件类型 | 说明 | 关键属性 |
|---------|------|---------|
| `start` | 流开始 | `partial`: 初始消息结构 |
| `text_start` | 文本块开始 | `contentIndex` |
| `text_delta` | 文本增量 | `delta`: 新文本, `contentIndex` |
| `text_end` | 文本块完成 | `content`: 完整文本 |
| `thinking_start` | 思考块开始 | `contentIndex` |
| `thinking_delta` | 思考增量 | `delta`: 新内容 |
| `thinking_end` | 思考完成 | `content`: 完整思考 |
| `toolcall_start` | 工具调用开始 | `contentIndex` |
| `toolcall_delta` | 工具参数流式 | `delta`, `partial.content[].arguments` |
| `toolcall_end` | 工具调用完成 | `toolCall`: 完整工具调用 |
| `done` | 流完成 | `reason`: "stop"/"length"/"toolUse", `message` |
| `error` | 出错 | `reason`: "error"/"aborted", `error` |

**注意**：不同内容块的事件不保证连续。Provider 可能在同一 chunk 中发出 text、thinking 和 toolcall 事件。需要使用 `contentIndex` 将事件关联到对应的块。

### Stop Reason（停止原因）

| 值 | 说明 |
|-----|------|
| `"stop"` | 正常完成 |
| `"length"` | 达最大 Token 限制 |
| `"toolUse"` | 模型调用工具，期待 toolResult |
| `"error"` | 生成错误 |
| `"aborted"` | 请求已取消 |

## Thinking/Reasoning

### 统一接口

```typescript
import { completeSimple, streamSimple } from '@earendil-works/pi-ai';

// 简化的 reasoning 接口
const response = await completeSimple(model, context, {
  reasoning: 'medium'  // minimal | low | medium | high | xhigh
});

// 流式获取 thinking 内容
const s = streamSimple(model, context, { reasoning: 'high' });
for await (const event of s) {
  if (event.type === 'thinking_delta') process.stdout.write(event.delta);
}
```

### Provider 特定选项

```typescript
// Anthropic
await complete(anthropicModel, context, {
  thinkingEnabled: true,
  thinkingBudgetTokens: 8192
});

// OpenAI
await complete(openaiModel, context, {
  reasoningEffort: 'medium',
  reasoningSummary: 'detailed'  // Responses API only
});

// Google Gemini
await complete(googleModel, context, {
  thinking: { enabled: true, budgetTokens: 8192 }
});
```

## 图片输入与生成

### 图片分析（需 vision 模型）

```typescript
import { readFileSync } from 'fs';
import { getModel, complete } from '@earendil-works/pi-ai';

const model = getModel('openai', 'gpt-4o-mini');
const imageBuffer = readFileSync('image.png');

const response = await complete(model, {
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image', data: imageBuffer.toString('base64'), mimeType: 'image/png' }
    ]
  }]
});
```

### 图片生成

使用 `getImageModel()` 和 `generateImages()`，而非 `stream()` / `complete()`。

```typescript
import { getImageModel, generateImages } from '@earendil-works/pi-ai';

const imgModel = getImageModel('openrouter', 'google/gemini-2.5-flash-image');
const result = await generateImages(imgModel, {
  input: [{ type: 'text', text: 'A red circle on white background.' }]
});

for (const block of result.output) {
  if (block.type === 'image') {
    console.log(block.mimeType);
    console.log(block.data.substring(0, 32));
  }
}
```

## 支持的 Providers 与环境变量

| Provider | API Key 环境变量 | 认证方式 |
|----------|-----------------|---------|
| Anthropic | `ANTHROPIC_API_KEY` | API Key / OAuth |
| OpenAI | `OPENAI_API_KEY` | API Key / OAuth |
| Google | `GEMINI_API_KEY` | API Key |
| Vertex AI | `GOOGLE_CLOUD_API_KEY` | API Key / ADC |
| Azure OpenAI | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_BASE_URL` | API Key |
| Mistral | `MISTRAL_API_KEY` | API Key |
| Groq | `GROQ_API_KEY` | API Key |
| Cerebras | `CEREBRAS_API_KEY` | API Key |
| DeepSeek | `DEEPSEEK_API_KEY` | API Key |
| xAI | `XAI_API_KEY` | API Key |
| OpenRouter | `OPENROUTER_API_KEY` | API Key |
| Together AI | `TOGETHER_API_KEY` | API Key |
| MiniMax | `MINIMAX_API_KEY` | API Key |
| Cloudflare AI Gateway | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_GATEWAY_ID` | API Key |
| Cloudflare Workers AI | `CLOUDFLARE_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` | API Key |
| Fireworks | `FIREWORKS_API_KEY` | API Key |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | API Key |
| Kimi For Coding | `KIMI_API_KEY` | API Key |
| Xiaomi MiMo | `XIAOMI_API_KEY` | API Key |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` | OAuth |
| Amazon Bedrock | 无（AWS SDK） | IAM / ADC |
| 任意 OpenAI 兼容 | 自定义 | API Key |

**OAuth Providers**（需 `/login` 交互式登录）：Anthropic（Claude Pro/Max）、OpenAI Codex（ChatGPT Plus/Pro）、GitHub Copilot（Copilot 订阅）。

## 自定义模型

可为本地推理服务创建自定义模型：

```typescript
import { Model, stream } from '@earendil-works/pi-ai';

// Ollama 本地模型
const ollamaModel: Model<'openai-completions'> = {
  id: 'llama-3.1-8b',
  name: 'Llama 3.1 8B (Ollama)',
  api: 'openai-completions',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434/v1',
  reasoning: false,
  input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 32000,
};

// LiteLLM 代理
const litellmModel: Model<'openai-completions'> = {
  id: 'gpt-4o',
  name: 'GPT-4o (via LiteLLM)',
  api: 'openai-completions',
  provider: 'litellm',
  baseUrl: 'http://localhost:4000/v1',
  reasoning: false,
  input: ['text', 'image'],
  cost: { input: 2.5, output: 10, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000,
  maxTokens: 16384,
  compat: {
    supportsStore: false,
  }
};

// 使用自定义模型
const response = await stream(ollamaModel, context, {
  apiKey: 'dummy'  // Ollama 不需要真实密钥
});
```

### API 兼容性设置

`openai-completions` API 由许多 Provider 实现，存在细微差异。可通过 `compat` 字段覆盖：

```typescript
interface OpenAICompletionsCompat {
  supportsStore?: boolean;              // store 字段支持
  supportsDeveloperRole?: boolean;      // developer role vs system
  supportsReasoningEffort?: boolean;    // reasoning_effort 支持
  supportsUsageInStreaming?: boolean;   // 流式用量统计
  supportsStrictMode?: boolean;         // 工具 strict 模式
  maxTokensField?: 'max_completion_tokens' | 'max_tokens';
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  requiresThinkingAsText?: boolean;
  thinkingFormat?: 'openai' | 'openrouter' | 'deepseek' | 'together' | 'zai' | 'qwen';
  cacheControlFormat?: 'anthropic';
}
```

## 低级 API（agentLoop）

无需 Agent 类的直接控制：

```typescript
import { agentLoop, agentLoopContinue } from "@earendil-works/pi-agent-core";

const context: AgentContext = {
  systemPrompt: "You are helpful.",
  messages: [],
  tools: [],
};

const config: AgentLoopConfig = {
  model: getModel("openai", "gpt-4o"),
  convertToLlm: (msgs) => msgs.filter(m => ["user","assistant","toolResult"].includes(m.role)),
  toolExecution: "parallel",
};

for await (const event of agentLoop([userMessage], context, config)) {
  console.log(event.type);
}

// 从现有上下文继续
for await (const event of agentLoopContinue(context, config)) {
  console.log(event.type);
}
```

### Proxy 代理模式（浏览器使用）

```typescript
import { Agent, streamProxy } from "@earendil-works/pi-agent-core";

const agent = new Agent({
  streamFn: (model, context, options) =>
    streamProxy(model, context, {
      ...options,
      authToken: "...",
      proxyUrl: "https://your-server.com",
    }),
});
```

## Quickstart 操作指南

```bash
# 安装
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 启动 Pi
cd /path/to/project
pi

# 认证 - 方式一：订阅登录（在 Pi 内执行）
/login     # 选择 Provider：Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot

# 认证 - 方式二：API Key（启动前设置环境变量）
export ANTHROPIC_API_KEY=sk-ant-...
pi

# 项目级指令文件
# 创建 AGENTS.md（全局 ~/.pi/agent/AGENTS.md 或项目级 AGENTS.md/CLAUDE.md）
# 更改后运行 /reload

# 非交互模式
pi -p "Summarize this codebase"
cat README.md | pi -p "Summarize this text"

# 引用文件
pi @README.md @src/app.ts "Review these together"
# 在支持的终端中可使用 Ctrl+V（Windows 为 Alt+V）粘贴图像

# 运行 shell 命令（在交互模式下）
!npm run lint     # 输出发送给模型
!!npm run lint    # 输出不发送给模型

# 切换模型
/model            # 选择模型
Ctrl+L            # 快捷切换
Shift+Tab         # 切换 thinking level

# 会话管理
pi -c             # 继续最近的会话
pi -r             # 浏览历史会话
pi --name "my task"     # 设置会话显示名称
pi --session <path|id>  # 打开特定会话
/tree             # 树形导航
/fork /clone      # 分支和克隆
/share            # 分享到 GitHub Gist
```

## 参考链接

### 官方资源
- **GitHub 仓库**: [earendil-works/pi](https://github.com/earendil-works/pi)
- **国内文档（主站）**: [pi-doc.com](https://pi-doc.com/)
- **npm**: [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent)

### 文档页面
- **快速开始**: [pi-doc.com/docs/latest/quickstart](https://pi-doc.com/docs/latest/quickstart.html)
- **使用指南**: [pi-doc.com/docs/latest/usage](https://pi-doc.com/docs/latest/usage)
- **Provider 设置**: [pi-doc.com/docs/latest/providers](https://pi-doc.com/docs/latest/providers)
- **Settings 配置**: [pi-doc.com/docs/latest/settings](https://pi-doc.com/docs/latest/settings)
- **快捷键**: [pi-doc.com/docs/latest/keybindings](https://pi-doc.com/docs/latest/keybindings)
- **会话管理**: [pi-doc.com/docs/latest/sessions](https://pi-doc.com/docs/latest/sessions)
- **Compaction**: [pi-doc.com/docs/latest/compaction](https://pi-doc.com/docs/latest/compaction)
- **Extensions 扩展**: [pi-doc.com/docs/latest/extensions](https://pi-doc.com/docs/latest/extensions)
- **Skills**: [pi-doc.com/docs/latest/skills](https://pi-doc.com/docs/latest/skills)
- **Prompt 模板**: [pi-doc.com/docs/latest/prompt-templates](https://pi-doc.com/docs/latest/prompt-templates)
- **主题**: [pi-doc.com/docs/latest/themes](https://pi-doc.com/docs/latest/themes)
- **Pi Packages**: [pi-doc.com/docs/latest/packages](https://pi-doc.com/docs/latest/packages)
- **SDK 编程式使用**: [pi-doc.com/docs/latest/sdk](https://pi-doc.com/docs/latest/sdk)
- **RPC 模式**: [pi-doc.com/docs/latest/rpc](https://pi-doc.com/docs/latest/rpc)
- **JSON 事件流模式**: [pi-doc.com/docs/latest/json](https://pi-doc.com/docs/latest/json)
- **TUI 组件**: [pi-doc.com/docs/latest/tui](https://pi-doc.com/docs/latest/tui)
- **会话格式**: [pi-doc.com/docs/latest/session-format](https://pi-doc.com/docs/latest/session-format)
- **自定义模型**: [pi-doc.com/docs/latest/models](https://pi-doc.com/docs/latest/models)
- **自定义 Provider**: [pi-doc.com/docs/latest/custom-provider](https://pi-doc.com/docs/latest/custom-provider)
- **开发指南**: [pi-doc.com/docs/latest/development](https://pi-doc.com/docs/latest/development)

### Pi 包
- **Pi Agent Core**: [@earendil-works/pi-agent-core](https://github.com/earendil-works/pi/tree/main/packages/agent)
- **Pi AI**: [@earendil-works/pi-ai](https://github.com/earendil-works/pi/tree/main/packages/ai)
- **Pi Coding Agent**: [@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent)
- **Pi TUI**: [@earendil-works/pi-tui](https://github.com/earendil-works/pi/tree/main/packages/tui)

### 版本信息
- Pi Agent 当前版本：**0.78.0**
- Node.js 最低要求：**22.19.0+**
