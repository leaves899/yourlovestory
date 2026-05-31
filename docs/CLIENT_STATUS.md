# yourcrush Client 开发状态报告

**版本**：v0.2.0  
**日期**：2025-05-30（更新于 2025-05-31）  
**状态**：核心闭环已打通 — 进入功能扩展阶段

---

## 一、当前阶段总结

客户端 v0.2.0 已完成**核心写作闭环**：用户可以录入碎片、查看碎片、生成叙事、阅读叙事。

Python 桥接层已接入真实的 `fragment_manager.py`，"生成叙事"按钮已添加并正确管理加载状态，Agent 配置已注入 LLM 调用链路。

一句话概括：**核心可用，开始扩展。**

---

## 二、已完成模块

### 2.1 主进程（Main Process）

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 应用入口 | `src/main/index.ts` | ✅ 完成 | BrowserWindow 创建、开发/生产环境加载 |
| IPC 通信 | `src/main/ipc.ts` | ✅ 完成 | 6 个通道，TypeBox 校验、超时保护 |
| Agent 集成 | `src/main/agent.ts` | ✅ 完成 | Pi Agent 创建，3 个工具注册，配置注入 |
| Python 桥接 | `src/main/python-bridge.ts` | ✅ 完成 | JSON-RPC 协议、Windows 兼容、崩溃通知 |
| 上下文缓存 | `src/main/context-cache.ts` | ✅ 完成 | LRU 缓存（10 条，5 分钟 TTL） |
| 配置持久化 | `src/main/config.ts` | ✅ 完成 | Agent 配置读写，存储到 userData |

### 2.2 安全层（Preload）

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| API 白名单 | `src/preload/index.ts` | ✅ 完成 | 10 个方法暴露，5 个危险通道列入黑名单 |

### 2.3 渲染进程（Renderer）

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 启动页 | `pages/StartupPage.tsx` | ✅ 完成 | 4 个 Skill 卡片、快速入口、配置入口 |
| Agent 配置页 | `pages/AgentConfigPage.tsx` | ✅ 完成 | 14 个 Provider、温度滑块、Token 配置 |
| 写作布局 | `App.tsx` (WritingLayout) | ✅ 完成 | 双栏布局：侧边栏 + 主区域 |
| 碎片输入 | `components/FragmentInput.tsx` | ✅ 完成 | 来源/心情选择、TypeBox 校验 |
| 碎片列表 | `components/FragmentList.tsx` | ✅ 完成 | 日期选择器、按日加载 |
| 叙事渲染 | `components/NarrativeView.tsx` | ✅ 完成 | DOMPurify 消毒、ReactMarkdown 渲染、生成按钮 |
| 状态管理 | `store/index.ts` | ✅ 完成 | Zustand，页面路由 + 写作状态 |
| 类型定义 | `shared/types.ts` | ✅ 完成 | TypeBox schema + TypeScript 类型 |

### 2.4 Python 桥接层

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 碎片桥接 | `scripts/fragment_bridge.py` | ✅ 完成 | 接入真实 `fragment_manager.py` |

### 2.5 构建与开发

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| Vite 配置 | `vite.config.ts` | ✅ 完成 | 三目标构建（main/preload/renderer） |
| TypeScript | `tsconfig.json` | ✅ 完成 | strict 模式，路径别名 |
| 打包配置 | `package.json` (build) | ✅ 完成 | electron-builder，输出到 release/ |
| 开发启动器 | `scripts/start-dev.js` | ✅ 完成 | 修复 Git Bash 的 ELECTRON_RUN_AS_NODE 问题 |

---

## 三、已修复问题

| 问题 | 修复内容 |
|------|----------|
| Windows Python 命令 | `python-bridge.ts` 根据平台选择 `python` / `python3` |
| Bridge disconnect 泄漏 | `onBridgeDisconnect` 返回清理函数，useEffect 正确卸载 |
| isGenerating 状态 | 按钮点击时设 true，stream:end/error/disconnect 时设 false |
| Python 桥接 stub | `fragment_bridge.py` 已接入真实 `fragment_manager.py` |
| 无生成按钮 | `NarrativeView` 已添加"生成叙事"按钮，带加载状态 |

---

## 四、剩余技术债务

1. **占位页面未清理** — `HomePage.tsx`、`WritingPage.tsx`、`SettingsPage.tsx` 是空壳，未被路由使用
2. **BLOCKED_CHANNELS 未运行时执行** — 黑名单已定义但无运行时拦截
3. **CrushSelector 硬编码** — 只有 `example` 一个选项，未动态加载角色
4. **StatusBar 不响应状态** — 始终显示"就绪"，不反映 Python 进程真实状态

---

## 五、架构总览

```
┌─────────────────────────────────────────────────────┐
│                  Renderer Process                    │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │StartupPage│  │WritingPage│  │ AgentConfigPage   │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
│        │              │               │              │
│        └──────────────┴───────────────┘              │
│                       │                              │
│              Zustand Store + window.electron.*        │
└───────────────────────┬─────────────────────────────┘
                        │ contextBridge
┌───────────────────────┴─────────────────────────────┐
│                   Main Process                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  ipc.ts   │  │ agent.ts │  │ python-bridge.ts  │  │
│  │ 6 handlers│  │ Pi Agent │  │ JSON-RPC over     │  │
│  └──────────┘  └──────────┘  │ stdio             │  │
│                               └────────┬──────────┘  │
│  ┌──────────┐  ┌──────────┐           │             │
│  │config.ts  │  │  cache   │           │             │
│  │ userData  │  │ LRU 5min │           │             │
│  └──────────┘  └──────────┘           │             │
└───────────────────────────────────────┬─────────────┘
                                        │
┌───────────────────────────────────────┴─────────────┐
│                Python Process                        │
│     fragment_bridge.py → fragment_manager.py         │
└─────────────────────────────────────────────────────┘
```

---

## 六、下一步开发方向

### P1 — 体验完善（当前优先）

1. **CrushSelector 动态加载**  
   - 扫描 `crushes/` 目录，动态填充下拉列表
   - 切换角色时重新加载上下文

2. **叙事历史浏览**  
   - 添加 IPC 通道读取已生成的叙事文件
   - 在侧边栏或独立面板展示历史叙事列表

3. **StatusBar 接入真实状态**  
   - 监听 Python bridge 的连接/断开事件
   - 显示"已连接"/"已断开"/"重连中"等状态

### P2 — 功能扩展

4. **创建角色 GUI 化**  
   - 将 `/create-crush` CLI 流程集成到 GUI
   - 分步向导：输入基本信息 → 上传素材 → 生成 Skill

5. **用户档案 GUI 化**  
   - 将 `/create-user` CLI 流程集成到 GUI
   - 表单化录入性格特点、写作风格偏好

6. **进展追踪页面**  
   - 实现 `ProgressPage`，展示关系阶段、指标、建议

7. **安全加固**  
   - 运行时强制执行 BLOCKED_CHANNELS
   - 清理占位页面

8. **打包与分发**  
   - 多平台打包测试（Windows installer、macOS dmg、Linux AppImage）
   - 自动更新机制（electron-updater）

---

## 七、里程碑

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| **v0.2.0** | P0 完成，核心闭环可用 | ✅ 已完成 |
| **v0.3.0** | P1 完成，体验流畅 | 📋 规划中 |
| **v0.4.0** | P2 部分完成，功能丰富 | 📋 规划中 |

---

## 八、核心闭环流程

```
用户打开应用
    │
    ▼
StartupPage ──→ AgentConfigPage（配置 LLM）
    │
    ▼
进入写作 ──→ CrushSelector 选择角色
    │
    ▼
FragmentInput 录入碎片 ──→ Python Bridge (record) ──→ fragment_manager.py
    │
    ▼
FragmentList 查看碎片 ──→ Python Bridge (list) ──→ fragment_manager.py
    │
    ▼
点击"生成叙事" ──→ Python Bridge (integrate) ──→ fragment_manager.py
    │                     │
    ▼                     ▼
Agent.prompt() ◄── 上下文注入（config: apiKey/model/temperature）
    │
    ▼
流式输出 ──→ NarrativeView 渲染（DOMPurify + ReactMarkdown）
    │
    ▼
用户阅读叙事
```

核心闭环已端到端可用 ✅
