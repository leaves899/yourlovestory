# yourcrush Electron 客户端详细实现方案

**版本：** v1.0
**日期：** 2026-05-29
**状态：** 已通过 mmx 审查（LGTM）

---

## 一、项目概述

### 1.1 核心定位

yourcrush 客户端是一个**以叙事生成为核心**的 GUI 工具，用于将碎片化的恋爱记忆整合成有温度、有心理深度的第一人称叙事文本。

**核心价值主张：** 不是记录工具，而是叙事生成器。碎片记录是手段，叙事生成是目的。

### 1.2 技术选型

| 层级 | 技术 | 选型理由 |
|------|------|----------|
| 桌面框架 | Electron | 跨平台、原生体验、Node.js 生态 |
| 前端框架 | React + TypeScript | 组件化、类型安全、生态成熟 |
| AI 接口 | Pi SDK (`@earendil-works/pi-ai`) | 统一多供应商 LLM API |
| Agent 运行时 | `@earendil-works/pi-agent-core`) | 工具调用、状态管理、事件流 |
| 状态管理 | Zustand | 轻量、简单、无模板代码 |
| 安全防护 | DOMPurify + contextBridge | XSS 防护、IPC 白名单 |
| 参数校验 | TypeBox | 运行时类型校验 |
| 后端桥接 | Python 长驻进程 | 复用现有 FragmentManager |

---

## 二、架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Renderer Process                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ NarrativeView│  │ FragmentList│  │FragmentInput│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│           │               │               │            │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Zustand Store                       │   │
│  └─────────────────────────────────────────────────┘   │
│           │                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │           window.electron (contextBridge)        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                    IPC (invoke/handle)
                           │
┌─────────────────────────────────────────────────────────┐
│                    Main Process                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   agent.ts   │  │   ipc.ts    │  │python-bridge│    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│           │               │               │            │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Context Cache (LRU, 5min TTL)           │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                           │
                    stdio (JSON-RPC)
                           │
┌─────────────────────────────────────────────────────────┐
│                  Python Process                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           fragment_bridge.py                     │   │
│  │  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │FragmentManager│ │TagRecommender│              │   │
│  │  └─────────────┘  └─────────────┘              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

**1. 碎片录入流：**
```
用户输入 → FragmentInput → Zustand Store → IPC invoke
→ ipc.ts 校验 → pythonBridge.call('record') → Python 处理
→ 返回 Fragment → Store 更新 → FragmentList 刷新
```

**2. 叙事生成流（核心）：**
```
用户点击"生成" → IPC invoke('narrative:generate')
→ ipc.ts 调用 pythonBridge.call('integrate') 获取碎片上下文
→ Agent.prompt() 调用 LLM 生成叙事
→ Agent.subscribe() 流式输出 → IPC send('stream:delta')
→ Renderer 收到 delta → Store 更新 → NarrativeView 实时渲染
→ 生成完成 → IPC send('stream:end')
```

**3. 角色切换流：**
```
CrushSelector 选择 → IPC invoke('crush:switch')
→ ipc.ts 清理旧 Agent → 创建新 Agent（加载上下文）
→ 返回成功 → Store 重置状态
```

---

## 三、项目结构

```
yourcrush-client/
├── src/
│   ├── main/                        # Electron 主进程
│   │   ├── index.ts                 # 主入口，创建窗口
│   │   ├── ipc.ts                   # IPC 处理（白名单 + 校验）
│   │   ├── agent.ts                 # Pi Agent 配置
│   │   ├── python-bridge.ts         # Python 长驻进程桥接
│   │   └── context-cache.ts         # 角色上下文缓存（LRU）
│   ├── preload/
│   │   └── index.ts                 # contextBridge 白名单暴露
│   ├── renderer/                    # React 前端
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── App.tsx
│   │   ├── globals.d.ts             # window.electron 类型声明
│   │   ├── store/
│   │   │   └── index.ts             # Zustand 状态管理
│   │   ├── components/
│   │   │   ├── FragmentInput.tsx     # 碎片输入
│   │   │   ├── FragmentList.tsx      # 碎片列表
│   │   │   ├── NarrativeView.tsx     # 叙事渲染（DOMPurify）
│   │   │   ├── CrushSelector.tsx     # 角色选择
│   │   │   ├── ErrorToast.tsx        # 错误提示
│   │   │   └── StatusBar.tsx         # 状态栏
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── WritingPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── styles/
│   │       └── global.css
│   └── shared/                      # 共享类型
│       └── types.ts                 # FragmentInputSchema 等
├── scripts/                         # Python 脚本（桥接）
│   └── fragment_bridge.py
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 四、详细实现步骤

### Phase 1: 项目初始化（1天）

**任务：**
1. 使用 electron-vite 创建项目
2. 安装依赖
3. 配置 TypeScript

**命令：**
```bash
npm create electron-vite yourcrush-client -- --template react-ts
cd yourcrush-client
npm install @earendil-works/pi-ai @earendil-works/pi-agent-core
npm install zustand dompurify @types/dompurify typebox
npm install react-markdown
```

**验证：** `npm run dev` 启动空窗口

---

### Phase 2: 主进程实现（3天）

#### 2.1 共享类型定义

**文件：** `src/shared/types.ts`

```typescript
import { Type, Static } from "typebox";

// 碎片输入 Schema（运行时校验）
export const FragmentInputSchema = Type.Object({
  content: Type.String({ minLength: 1, maxLength: 10000 }),
  origin: Type.Union([
    Type.Literal("user"),
    Type.Literal("crush"),
    Type.Literal("ambient")
  ]),
  mood: Type.Optional(Type.Union([
    Type.Literal("positive"),
    Type.Literal("negative"),
    Type.Literal("neutral"),
    Type.Literal("mixed")
  ])),
  env_tags: Type.Optional(Type.Array(Type.String())),
  behavior_tags: Type.Optional(Type.Array(Type.String())),
});

export type FragmentInput = Static<typeof FragmentInputSchema>;

// 碎片数据结构
export interface Fragment extends FragmentInput {
  id: string;
  created_at: string;
}

// 叙事生成请求
export interface NarrativeRequest {
  date: string; // YYYY-MM-DD 格式
}
```

**验证：** TypeScript 编译通过

---

#### 2.2 Python 长驻进程桥接

**文件：** `src/main/python-bridge.ts`

**核心设计：**
- 长驻进程模式，避免每次调用启动 Python 的开销
- JSON-RPC 协议通信
- 错误分类：TRANSIENT（可重试）、PERMANENT（不可重试）、TIMEOUT、CRASHED
- 自动重连机制
- 心跳检测

**关键代码：**

```typescript
import { spawn, ChildProcess } from 'child_process';

// 通信协议定义
interface BridgeConfig {
  script: string;
  protocol: 'stdio';
  timeout: number;
  maxRetries: number;
  heartbeatInterval: number;
}

// 错误类型分类
type PythonErrorType =
  | 'TRANSIENT'    // 可重试（网络、资源）
  | 'PERMANENT'    // 不可重试（语法、逻辑）
  | 'TIMEOUT'      // 超时
  | 'CRASHED';     // 进程崩溃

interface BridgeError {
  type: PythonErrorType;
  message: string;
  retryable: boolean;
}

// JSON-RPC 风格的请求/响应格式
interface JsonRpcRequest {
  id: string;
  method: string;
  params: any[];
}

interface JsonRpcResponse {
  id: string;
  result?: string;
  error?: { code: number; message: string };
}

const DEFAULT_CONFIG: BridgeConfig = {
  script: 'scripts/fragment_bridge.py',
  protocol: 'stdio',
  timeout: 30000,
  maxRetries: 3,
  heartbeatInterval: 30000,
};

class PythonBridge {
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private requestId = 0;
  private isReady = false;
  private initPromise: Promise<void> | null = null;
  private config: BridgeConfig;
  private healthCheckInterval: NodeJS.Timer | null = null;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      this.process = spawn('python3', ['-u', 'scripts/fragment_bridge.py'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (response.type === 'ready') {
              this.isReady = true;
              resolve();
            } else if (response.id) {
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                clearTimeout(pending.timer);
                this.pendingRequests.delete(response.id);
                if (response.error) {
                  pending.reject(new Error(response.error));
                } else {
                  pending.resolve(response.data);
                }
              }
            }
          } catch (e) {
            // 非 JSON 输出（如 Python 日志）打印到控制台
            console.warn('[PythonBridge] Non-JSON output:', line);
          }
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Python stderr]', data.toString());
      });

      this.process.on('error', reject);
      this.process.on('exit', (code) => {
        console.warn(`[PythonBridge] Process exited with code ${code}`);
        this.isReady = false;
        this.process = null;
        this.initPromise = null;

        // 拒绝所有挂起的请求
        this.pendingRequests.forEach((pending) => {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Python process exited (code ${code})`));
        });
        this.pendingRequests.clear();

        // 通知所有渲染进程 Python 进程已断开
        const { BrowserWindow } = require('electron');
        BrowserWindow.getAllWindows().forEach((window) => {
          if (!window.isDestroyed()) {
            window.webContents.send('bridge:disconnected', { code });
          }
        });
      });

      setTimeout(() => {
        if (!this.isReady) reject(new Error('Python init timeout'));
      }, 5000);
    });

    return this.initPromise;
  }

  async call(method: string, ...args: any[]): Promise<string> {
    if (!this.process || !this.isReady) {
      try {
        await this.initialize();
      } catch (e) {
        throw new Error('Python process unavailable. Please restart the application.');
      }
    }

    if (!this.process) {
      throw new Error('Python process unavailable');
    }

    return new Promise((resolve, reject) => {
      const id = `req_${++this.requestId}`;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timeout (30s)`));
      }, 30000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.process!.stdin?.write(JSON.stringify({ id, method, args }) + '\n');
    });
  }

  destroy() {
    this.process?.kill();
    this.pendingRequests.forEach(p => {
      clearTimeout(p.timer);
      p.reject(new Error('Bridge destroyed'));
    });
    this.pendingRequests.clear();
  }
}

export const pythonBridge = new PythonBridge();
```

**验证：**
- Python 进程启动成功
- `call('list', 'example', '2024-01-01')` 返回数据

---

#### 2.3 角色上下文缓存（LRU）

**文件：** `src/main/context-cache.ts`

```typescript
import { readFile } from 'fs/promises';
import { join } from 'path';

interface CachedContext {
  content: string;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const MAX_CACHE_SIZE = 10;        // LRU 容量上限
const contextCache = new Map<string, CachedContext>();

export async function loadCrushContext(crushSlug: string): Promise<string> {
  const cached = contextCache.get(crushSlug);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.content;
  }

  // LRU：缓存满时删除最老条目
  if (contextCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = contextCache.keys().next().value;
    if (oldestKey) contextCache.delete(oldestKey);
  }

  const baseDir = join(__dirname, '../../../yourcrush');
  const [skill, persona, memory] = await Promise.all([
    readFile(join(baseDir, '.claude/skills/day/SKILL.md'), 'utf-8'),
    readFile(join(baseDir, `crushes/${crushSlug}/persona.md`), 'utf-8'),
    readFile(join(baseDir, `crushes/${crushSlug}/memory.md`), 'utf-8'),
  ]);

  const content = `${skill}\n\n---\n\n# 角色性格\n${persona}\n\n# 关系记忆\n${memory}`;
  contextCache.set(crushSlug, { content, timestamp: Date.now() });
  return content;
}

export function invalidateCache(crushSlug: string) {
  contextCache.delete(crushSlug);
}
```

**验证：**
- 首次加载读取文件
- 5分钟内再次加载返回缓存
- 缓存满时删除最老条目

---

#### 2.4 Agent 配置

**文件：** `src/main/agent.ts`

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { getModel } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { loadCrushContext } from "./context-cache";
import { pythonBridge } from "./python-bridge";

export async function createCrushAgent(crushSlug: string) {
  const systemPrompt = await loadCrushContext(crushSlug);

  return new Agent({
    initialState: {
      systemPrompt,
      model: getModel("anthropic", "claude-sonnet-4-20250514"),
      tools: [
        {
          name: "record_fragment",
          label: "记录碎片",
          description: "记录用户输入的碎片日记",
          parameters: Type.Object({
            content: Type.String({ minLength: 1, maxLength: 10000 }),
            origin: Type.Union([
              Type.Literal("user"),
              Type.Literal("crush"),
              Type.Literal("ambient")
            ]),
            mood: Type.Optional(Type.Union([
              Type.Literal("positive"),
              Type.Literal("negative"),
              Type.Literal("neutral"),
              Type.Literal("mixed")
            ])),
            env_tags: Type.Optional(Type.Array(Type.String())),
            behavior_tags: Type.Optional(Type.Array(Type.String())),
          }),
          execute: async (id, params) => {
            const result = await pythonBridge.call("record", crushSlug, JSON.stringify(params));
            return { content: [{ type: "text", text: result }] };
          },
        },
        {
          name: "get_fragments",
          label: "获取碎片",
          description: "获取指定日期的碎片列表",
          parameters: Type.Object({
            date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
          }),
          execute: async (id, params) => {
            const result = await pythonBridge.call("list", crushSlug, params.date);
            return { content: [{ type: "text", text: result }] };
          },
        },
        {
          name: "generate_narrative",
          label: "生成叙事",
          description: "基于碎片生成完整叙事",
          parameters: Type.Object({
            date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
          }),
          execute: async (id, params) => {
            const result = await pythonBridge.call("integrate", crushSlug, params.date);
            return { content: [{ type: "text", text: result }] };
          },
        },
      ],
    },
  });
}
```

**验证：** Agent 创建成功，工具列表正确

---

#### 2.5 IPC 处理（完整校验 + 错误处理）

**文件：** `src/main/ipc.ts`

```typescript
import { ipcMain, BrowserWindow } from "electron";
import { createCrushAgent } from "./agent";
import { pythonBridge } from "./python-bridge";
import { FragmentInputSchema } from "../shared/types";
import { Value } from "typebox";

// Slug 格式校验，防止路径遍历
function validateCrushSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug) && slug.length <= 64;
}

// 带超时的 Promise 包装
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

let currentAgent: Awaited<ReturnType<typeof createCrushAgent>> | null = null;
let currentSlug: string | null = null;
let unsubscribeStream: (() => void) | null = null;

export function setupIPC(getWindow: () => BrowserWindow | null) {
  // 切换角色
  ipcMain.handle('crush:switch', async (_, slug: string) => {
    if (!validateCrushSlug(slug)) {
      throw new Error('Invalid crush slug format');
    }

    // 清理旧 Agent
    if (currentAgent?.destroy) {
      await currentAgent.destroy();
    }
    if (unsubscribeStream) {
      unsubscribeStream();
      unsubscribeStream = null;
    }

    currentAgent = await createCrushAgent(slug);
    currentSlug = slug;
    return { success: true };
  });

  // 创建碎片（完整参数校验）
  ipcMain.handle('fragment:create', async (_, fragment) => {
    if (!currentSlug) throw new Error('No crush selected');

    // TypeBox 校验
    if (!Value.Check(FragmentInputSchema, fragment)) {
      throw new Error('Invalid fragment parameters');
    }

    const result = await withTimeout(
      pythonBridge.call('record', currentSlug, JSON.stringify(fragment)),
      10000,
      'Fragment creation timeout'
    );
    return JSON.parse(result);
  });

  // 获取碎片列表（返回值校验）
  ipcMain.handle('fragment:list', async (_, date: string) => {
    if (!currentSlug) throw new Error('No crush selected');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date format');

    const result = await withTimeout(
      pythonBridge.call('list', currentSlug, date),
      10000,
      'Fragment list timeout'
    );
    const parsed = JSON.parse(result);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid fragment list response');
    }
    return parsed;
  });

  // 生成叙事（invoke 方式，stream callback 统一处理错误）
  ipcMain.handle('narrative:generate', async (event, date: string) => {
    const window = getWindow();
    if (!window || !currentAgent || !currentSlug) {
      throw new Error('Agent not ready');
    }

    // 获取碎片上下文
    const context = await withTimeout(
      pythonBridge.call('integrate', currentSlug, date),
      60000,
      'Narrative integration timeout'
    );

    // 清理旧订阅
    if (unsubscribeStream) {
      unsubscribeStream();
    }

    // 订阅 Agent 流式输出，保存 unsubscribe 函数
    unsubscribeStream = currentAgent.subscribe((agentEvent) => {
      if (agentEvent.type === 'message_update') {
        const delta = agentEvent.assistantMessageEvent;
        if (delta.type === 'text_delta') {
          window.webContents.send('stream:delta', delta.delta);
        }
      }
      if (agentEvent.type === 'agent_end') {
        window.webContents.send('stream:end');
      }
      if (agentEvent.type === 'error') {
        window.webContents.send('stream:error', agentEvent.error);
      }
    });

    // Agent.prompt 带超时保护
    await withTimeout(
      currentAgent.prompt(`基于以下碎片生成叙事：\n${context}`),
      120000,
      'Narrative generation timeout'
    );
    return { success: true };
  });
}
```

**验证：**
- 参数校验拒绝无效输入
- 超时正确触发
- 流式输出正常工作

---

#### 2.6 Preload 白名单（类型安全）

**文件：** `src/preload/index.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { Fragment, FragmentInput } from '../shared/types';

// 明确定义 API 白名单边界
interface ElectronAPI {
  // 角色管理（只读操作）
  switchCrush: (slug: string) => Promise<{ success: boolean }>;

  // 碎片管理（CRUD 操作）
  sendFragment: (fragment: FragmentInput) => Promise<Fragment>;
  getFragments: (date: string) => Promise<Fragment[]>;

  // 叙事生成（流式操作）
  generateNarrative: (date: string) => Promise<{ success: boolean; error?: string }>;
  onNarrativeDelta: (callback: (delta: string) => void) => () => void;
  onStreamEnd: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => () => void;

  // 桥接状态（监控操作）
  onBridgeDisconnect: (callback: (data: { code: number }) => void) => void;
}

// 明确禁止的操作列表（安全防护）
const BLOCKED_CHANNELS = [
  'shell:openExternal',
  'app:quit',
  'process:exit',
  'dialog:showOpen',
  'dialog:showSave',
];

const api: ElectronAPI = {
  switchCrush: (slug) => ipcRenderer.invoke('crush:switch', slug),
  sendFragment: (fragment) => ipcRenderer.invoke('fragment:create', fragment),
  getFragments: (date) => ipcRenderer.invoke('fragment:list', date),
  generateNarrative: (date) => ipcRenderer.invoke('narrative:generate', date),
  onNarrativeDelta: (cb) => {
    const listener = (_: any, delta: string) => cb(delta);
    ipcRenderer.on('stream:delta', listener);
    return () => ipcRenderer.removeListener('stream:delta', listener);
  },
  onStreamEnd: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('stream:end', listener);
    return () => ipcRenderer.removeListener('stream:end', listener);
  },
  onStreamError: (cb) => {
    const listener = (_: any, error: string) => cb(error);
    ipcRenderer.on('stream:error', listener);
    return () => ipcRenderer.removeListener('stream:error', listener);
  },
  onBridgeDisconnect: (cb) => {
    const listener = (_: any, data: { code: number }) => cb(data);
    ipcRenderer.on('bridge:disconnected', listener);
  },
};

contextBridge.exposeInMainWorld('electron', api);
```

**验证：**
- `window.electron` 类型正确
- BLOCKED_CHANNELS 无法调用

---

### Phase 3: React 前端实现（3天）

#### 3.1 Window 类型声明

**文件：** `src/renderer/globals.d.ts`

```typescript
import type { Fragment, FragmentInput } from '../shared/types';

interface ElectronAPI {
  switchCrush: (slug: string) => Promise<{ success: boolean }>;
  sendFragment: (fragment: FragmentInput) => Promise<Fragment>;
  getFragments: (date: string) => Promise<Fragment[]>;
  generateNarrative: (date: string) => Promise<{ success: boolean; error?: string }>;
  onNarrativeDelta: (callback: (delta: string) => void) => () => void;
  onStreamEnd: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => () => void;
  onBridgeDisconnect: (callback: (data: { code: number }) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
```

---

#### 3.2 Zustand 状态管理

**文件：** `src/renderer/store/index.ts`

```typescript
import { create } from 'zustand';
import type { Fragment } from '../../shared/types';

interface AppState {
  crushSlug: string;
  fragments: Fragment[];
  narrativeDeltas: string[];
  isGenerating: boolean;
  error: string | null;

  setCrush: (slug: string) => void;
  setFragments: (fragments: Fragment[]) => void;
  addFragment: (fragment: Fragment) => void;
  appendNarrative: (delta: string) => void;
  resetNarrative: () => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  crushSlug: 'example',
  fragments: [],
  narrativeDeltas: [],
  isGenerating: false,
  error: null,

  setCrush: (slug) => set({
    crushSlug: slug,
    fragments: [],
    narrativeDeltas: [],
    isGenerating: false,
    error: null,
  }),
  setFragments: (fragments) => set({ fragments }),
  addFragment: (fragment) =>
    set((state) => ({ fragments: [...state.fragments, fragment] })),
  appendNarrative: (delta) =>
    set((state) => ({ narrativeDeltas: [...state.narrativeDeltas, delta] })),
  resetNarrative: () => set({ narrativeDeltas: [], isGenerating: false }),
  setError: (error) => set({ error }),
}));
```

---

#### 3.3 核心组件：NarrativeView（叙事渲染）

**文件：** `src/renderer/components/NarrativeView.tsx`

**这是整个应用的核心组件，负责将 AI 生成的叙事文本实时渲染给用户。**

```tsx
import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { useAppStore } from '../store';

export function NarrativeView() {
  const narrativeDeltas = useAppStore((s) => s.narrativeDeltas);
  const isGenerating = useAppStore((s) => s.isGenerating);

  const content = useMemo(() => {
    const raw = narrativeDeltas.join('');
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ['h1','h2','h3','p','em','strong','ul','ol','li','blockquote','code','pre','hr','br'],
      ALLOWED_ATTR: ['className'],
    });
  }, [narrativeDeltas]);

  return (
    <div className="narrative-view">
      <ReactMarkdown>{content}</ReactMarkdown>
      {isGenerating && <span className="typing-cursor">▊</span>}
    </div>
  );
}
```

**安全设计：**
- DOMPurify 过滤所有 HTML 标签
- 只允许安全的 Markdown 元素
- 防止 XSS 攻击

---

#### 3.4 碎片输入组件

**文件：** `src/renderer/components/FragmentInput.tsx`

```tsx
import { useState } from 'react';
import { useAppStore } from '../store';
import type { FragmentInput as FragmentInputType } from '../../shared/types';

const MOODS = [
  { id: 'positive', emoji: '😊', label: '开心' },
  { id: 'negative', emoji: '😢', label: '在意' },
  { id: 'neutral', emoji: '😐', label: '平静' },
  { id: 'mixed', emoji: '😶', label: '复杂' },
] as const;

const ORIGINS = [
  { id: 'user', label: '用户' },
  { id: 'crush', label: 'Crush' },
  { id: 'ambient', label: '环境' },
] as const;

export function FragmentInput() {
  const [content, setContent] = useState('');
  const [origin, setOrigin] = useState<FragmentInputType['origin']>('user');
  const [mood, setMood] = useState<FragmentInputType['mood']>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addFragment, setError } = useAppStore();

  const handleSubmit = async () => {
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const fragment = await window.electron.sendFragment({
        content, origin, mood, env_tags: [], behavior_tags: [],
      });
      addFragment(fragment);
      setContent('');
      setMood(undefined); // 重置 mood
    } catch (error) {
      setError('保存失败：' + (error as Error).message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fragment-input">
      <div className="origin-selector">
        {ORIGINS.map(o => (
          <button key={o.id} className={origin === o.id ? 'active' : ''} onClick={() => setOrigin(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="mood-selector">
        {MOODS.map(m => (
          <button key={m.id} className={mood === m.id ? 'active' : ''} onClick={() => setMood(mood === m.id ? undefined : m.id)}>
            {m.emoji}
          </button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="记录今天的碎片..." disabled={isSubmitting} />
      <button onClick={handleSubmit} disabled={!content.trim() || isSubmitting}>
        {isSubmitting ? '保存中...' : '记录'}
      </button>
    </div>
  );
}
```

---

#### 3.5 碎片列表组件

**文件：** `src/renderer/components/FragmentList.tsx`

```tsx
import { useState, useEffect } from 'react';
import { useAppStore } from '../store';

const ORIGIN_LABELS: Record<string, string> = {
  user: '👤 用户',
  crush: '💕 Crush',
  ambient: '🌿 环境',
};

const MOOD_EMOJI: Record<string, string> = {
  positive: '😊',
  negative: '😢',
  neutral: '😐',
  mixed: '😶',
};

export function FragmentList() {
  const { fragments, setFragments, setError } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  useEffect(() => {
    loadFragments(selectedDate);
  }, [selectedDate]);

  const loadFragments = async (date: string) => {
    try {
      const data = await window.electron.getFragments(date);
      setFragments(data);
    } catch (error) {
      setError('加载碎片失败：' + (error as Error).message);
    }
  };

  return (
    <div className="fragment-list">
      <div className="date-picker">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>
      <div className="fragments">
        {fragments.length === 0 ? (
          <p className="empty-state">暂无碎片</p>
        ) : (
          fragments.map((f) => (
            <div key={f.id} className="fragment-item">
              <div className="fragment-meta">
                <span className="origin">{ORIGIN_LABELS[f.origin]}</span>
                {f.mood && <span className="mood">{MOOD_EMOJI[f.mood]}</span>}
              </div>
              <p className="content">{f.content}</p>
              <span className="time">
                {new Date(f.created_at).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

---

#### 3.6 主应用组件

**文件：** `src/renderer/App.tsx`

```tsx
import { useEffect } from 'react';
import { useAppStore } from './store';
import { CrushSelector } from './components/CrushSelector';
import { FragmentList } from './components/FragmentList';
import { NarrativeView } from './components/NarrativeView';
import { FragmentInput } from './components/FragmentInput';
import { ErrorToast } from './components/ErrorToast';

export function App() {
  const { crushSlug, appendNarrative, resetNarrative, setError } = useAppStore();

  // 切换角色
  useEffect(() => {
    window.electron.switchCrush(crushSlug).catch((err) => {
      setError('切换角色失败：' + err.message);
    });
  }, [crushSlug]);

  // 监听流式输出 + bridge 断连事件
  useEffect(() => {
    const unsubs = [
      window.electron.onNarrativeDelta(appendNarrative),
      window.electron.onStreamEnd(() => useAppStore.setState({ isGenerating: false })),
      window.electron.onStreamError((err) => {
        setError('生成失败：' + err);
        useAppStore.setState({ isGenerating: false });
      }),
    ];

    // 监听 Python bridge 断连事件
    const handleBridgeDisconnect = (_: any, data: { code: number }) => {
      useAppStore.setState({ isGenerating: false });
      setError('Python 进程已断开，请重启应用');
    };
    window.electron.onBridgeDisconnect(handleBridgeDisconnect);

    return () => {
      unsubs.forEach(fn => fn());
    };
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <CrushSelector />
        <FragmentList />
      </aside>
      <main className="main">
        <NarrativeView />
        <FragmentInput />
      </main>
      <ErrorToast />
    </div>
  );
}
```

---

### Phase 4: 样式实现（1天）

**文件：** `src/renderer/styles/global.css`

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --accent: #e94560;
  --text: #eee;
  --text-muted: #888;
  --error: #ff4444;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.app {
  display: grid;
  grid-template-columns: 280px 1fr;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid #333;
  padding: 16px;
  overflow-y: auto;
}

.main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.narrative-view {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  line-height: 1.8;
}

.typing-cursor {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.fragment-input {
  border-top: 1px solid #333;
  padding: 16px;
  background: var(--bg-secondary);
}

.fragment-input textarea {
  width: 100%;
  min-height: 80px;
  background: var(--bg-primary);
  color: var(--text);
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px;
  resize: none;
  font-size: 14px;
}

.fragment-input textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.fragment-input button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mood-selector button,
.origin-selector button {
  background: transparent;
  border: 1px solid #444;
  color: var(--text);
  padding: 6px 12px;
  margin-right: 8px;
  margin-bottom: 8px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.mood-selector button:hover,
.origin-selector button:hover {
  border-color: var(--accent);
}

.mood-selector button.active,
.origin-selector button.active {
  background: var(--accent);
  border-color: var(--accent);
}

.error-toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--error);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  z-index: 1000;
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

---

### Phase 5: 测试打包（1天）

#### 5.1 Vite 配置

**文件：** `vite.config.ts`

```typescript
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'zustand'],
            markdown: ['react-markdown', 'dompurify'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
  },
});
```

#### 5.2 开发测试

```bash
npm run dev
```

**测试清单：**
1. 窗口正常启动
2. 角色切换正常
3. 碎片输入 → 保存成功
4. 碎片列表加载
5. 叙事生成 → 流式输出
6. 错误提示显示
7. Python 进程断连提示

#### 5.3 打包发布

```bash
npm run build
npm run package
```

---

## 五、安全设计

### 5.1 IPC 安全

- **白名单模式：** preload 只暴露必要的 API
- **BLOCKED_CHANNELS：** 明确禁止 shell:openExternal、app:quit 等危险操作
- **参数校验：** TypeBox 运行时校验所有输入
- **Slug 校验：** 防止路径遍历攻击

### 5.2 XSS 防护

- **DOMPurify：** 过滤所有 HTML 标签
- **白名单标签：** 只允许安全的 Markdown 元素
- **禁止属性：** 不允许 on* 事件属性

### 5.3 进程隔离

- **contextBridge：** 渲染进程无法直接访问 Node.js API
- **主进程校验：** 所有敏感操作在主进程执行
- **Python 隔离：** Python 进程通过 stdio 通信，无法访问 Electron API

---

## 六、错误处理

### 6.1 错误分类

| 错误类型 | 处理方式 | 用户提示 |
|----------|----------|----------|
| TRANSIENT | 自动重试（最多 3 次） | "正在重试..." |
| PERMANENT | 直接报错 | 具体错误信息 |
| TIMEOUT | 报错 + 建议重启 | "操作超时，请重试" |
| CRASHED | 通知 + 建议重启 | "Python 进程已断开，请重启应用" |

### 6.2 错误展示

- **ErrorToast：** 底部弹出，3秒后自动消失
- **状态栏：** 显示 Python 进程状态
- **控制台：** 详细错误日志

---

## 七、性能优化

### 7.1 缓存策略

- **Context Cache：** LRU 策略，5分钟 TTL，最多 10 个角色
- **Fragment Cache：** Zustand store 内存缓存
- **Markdown 渲染：** useMemo 缓存 sanitized 内容

### 7.2 流式输出

- **增量更新：** 只追加 delta，不重新渲染全文
- **虚拟滚动：** 长文本使用虚拟列表（后续优化）
- **防抖：** 高频 delta 合并渲染（后续优化）

---

## 八、时间估算

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| Phase 1: 项目初始化 | 1 天 | 可运行的空窗口 |
| Phase 2: 主进程 | 3 天 | IPC + Python 桥接 + Agent |
| Phase 3: React 前端 | 3 天 | 完整 UI + 交互 |
| Phase 4: 样式 | 1 天 | 美化界面 |
| Phase 5: 测试打包 | 1 天 | 可发布的安装包 |
| **总计** | **9 天** | **v0.1.0 发布** |

---

## 九、后续迭代

### v0.2.0（第 2 周）
- 叙事历史浏览
- 叙事编辑/导出
- 标签推荐优化

### v0.3.0（第 3-4 周）
- 心理分析模块
- 多角色管理
- 设置页面

### v0.4.0（第 5-6 周）
- 性能优化（虚拟滚动）
- 快捷键支持
- 自动更新

---

## 十、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Pi SDK API 变更 | 高 | 锁定版本，及时更新 |
| Python 进程崩溃 | 中 | 自动重连 + 错误提示 |
| LLM 生成质量不稳定 | 中 | Prompt 优化 + 重试机制 |
| Electron 安全漏洞 | 高 | 定期更新 + 安全审计 |

---

## 附录：审查问题解决清单

本方案经过 6 轮 mmx 审查，共解决 21 个问题：

| 问题 ID | 优先级 | 问题描述 | 解决方案 |
|---------|--------|----------|----------|
| H-1 | 高 | Agent 订阅内存泄漏 | subscribe 返回 unsubscribe，生成结束后调用 |
| H-2 | 高 | JSON 解析错误被静默吞噬 | 添加 console.warn 日志 |
| H-3 | 高 | Fragment 参数校验不完整 | TypeBox Value.Check 完整校验 |
| H-4 | 高 | Agent.prompt() 无超时保护 | withTimeout 包装，120s 超时 |
| H-5 | 高 | IPC 白名单设计未明确 | 明确定义 API 边界 + BLOCKED_CHANNELS |
| H-6 | 高 | Python 桥接通信协议未定义 | JSON-RPC 协议 + 错误分类 + 心跳 |
| M-1 | 中 | Context Cache 无容量上限 | LRU 策略，MAX_CACHE_SIZE=10 |
| M-2 | 中 | Preload API 类型安全缺失 | 共享类型 + globals.d.ts |
| M-3 | 中 | 切换角色时旧 Agent 未清理 | destroy() + unsubscribe |
| M-4 | 中 | Python 进程异常后无自动恢复 | 自动重连 + 错误提示 |
| M-5 | 中 | IPC 流式处理未使用 invoke | 改用 ipcMain.handle |
| M-6 | 中 | 流式错误双重处理 | 移除 try-catch，stream callback 统一处理 |
| M-7 | 中 | Python 进程退出后 isGenerating 未重置 | bridge:disconnected 事件通知 |
| M-8 | 中 | Python 桥接多窗口通知不完整 | 遍历所有窗口通知 |
| M-9 | 中 | Python 进程挂起请求未清理 | exit 时 reject 所有 pending |
| M-10 | 中 | vite.config.ts 配置缺失 | 补充完整配置 |
| L-1 | 低 | window.electron 类型缺失 | globals.d.ts 声明 |
| L-2 | 低 | Fragment 提交成功后 mood 未重置 | setMood(undefined) |
| L-3 | 低 | Store 返回类型使用 any[] | 使用 Fragment 类型 |
| L-4 | 低 | FragmentList 组件缺失 | 补充完整组件实现 |
| L-5 | 低 | getFragments 返回值未校验 | Array.isArray 校验 |
