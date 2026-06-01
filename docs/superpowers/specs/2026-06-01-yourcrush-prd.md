# yourcrush 产品需求文档（PRD）

> 基于 Pi Agent SDK 的恋爱日记 Electron 桌面应用

**日期**：2026-06-01
**版本**：v1.0
**状态**：已批准

---

## 1. 产品概述

### 1.1 产品定义

**yourcrush** 是一个基于 Pi Agent SDK 的恋爱日记 Electron 桌面应用，帮助用户记录与 crush 的日常生活。

### 1.2 目标用户

- 恋爱中的人
- 想要记录恋爱生活的人
- 喜欢写作的人

### 1.3 产品价值

- 帮助用户记录恋爱生活
- 提供智能写作辅助
- 保护用户隐私
- 提供良好的用户体验

### 1.4 产品形态

- Electron 桌面应用
- 支持 Windows、macOS、Linux
- 支持中英文

---

## 2. 技术架构

### 2.1 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 后端框架 | Pi Agent SDK | 0.78.0 |
| 前端框架 | React | 18 |
| 类型系统 | TypeScript | 5.x |
| 构建工具 | Vite | 5.x |
| UI 组件库 | Chakra UI | 3.x |
| 桌面框架 | Electron | 28.x |
| 测试框架 | Jest + Playwright | 最新 |
| 许可证 | MIT | - |

### 2.2 架构设计

```
yourcrush-app/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── main.ts              # 主进程入口
│   │   ├── preload.ts           # 预加载脚本
│   │   └── ipc.ts               # IPC 通信
│   ├── renderer/                # Electron 渲染进程
│   │   ├── index.html           # 入口 HTML
│   │   ├── main.ts              # 渲染进程入口
│   │   ├── components/          # React 组件
│   │   ├── pages/               # 页面
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── stores/              # 状态管理
│   │   ├── services/            # 服务层
│   │   ├── utils/               # 工具函数
│   │   └── styles/              # 样式
│   ├── agent/                   # Pi Agent SDK
│   │   ├── agent.ts             # Agent 实例
│   │   ├── tools/               # 工具定义
│   │   ├── state/               # 状态管理
│   │   └── events/              # 事件处理
│   └── scripts/                 # Python 脚本
│       ├── day/                 # 日常写作模块
│       │   ├── __init__.py
│       │   ├── pipeline.py      # 主入口
│       │   ├── service.py       # 服务层
│       │   ├── validators/      # 验证器
│       │   ├── extractors/      # 提取器
│       │   ├── updaters/        # 更新器
│       │   ├── generators/      # 生成器
│       │   └── sync/            # 同步器
│       ├── fragment/            # 碎片日记模块
│       │   ├── __init__.py
│       │   ├── models.py
│       │   ├── state_machine.py
│       │   ├── manager.py
│       │   ├── prompt_generator.py
│       │   ├── tag_recommender.py
│       │   ├── blind_matcher.py
│       │   └── utils.py
│       ├── parsers/             # 解析器模块
│       │   ├── __init__.py
│       │   ├── wechat_parser.py
│       │   ├── qq_parser.py
│       │   └── social_parser.py
│       └── utils/               # 工具函数
│           ├── __init__.py
│           ├── file_utils.py
│           └── date_utils.py
├── tests/                       # 测试文件
│   ├── unit/                    # 单元测试
│   ├── integration/             # 集成测试
│   ├── e2e/                     # 端到端测试
│   └── performance/             # 性能测试
├── docs/                        # 文档
│   ├── api/                     # API 文档
│   ├── user/                    # 用户文档
│   └── developer/               # 开发者文档
├── scripts/                     # 脚本
│   ├── build.sh                 # 构建脚本
│   ├── deploy.sh                # 部署脚本
│   └── test.sh                  # 测试脚本
├── package.json                 # 依赖配置
├── tsconfig.json                # TypeScript 配置
├── vite.config.ts               # Vite 配置
├── electron-builder.yml         # Electron 构建配置
├── .env.example                 # 环境变量示例
├── .gitignore                   # Git 忽略规则
├── LICENSE                      # MIT 许可证
└── README.md                    # 项目说明
```

### 2.3 数据流

```
用户输入
    ↓
渲染进程（React）
    ↓ IPC 通信
主进程（Electron）
    ↓ 工具调用
Pi Agent SDK
    ↓ 子进程调用
Python 脚本
    ↓ 文件操作
本地存储
```

### 2.4 模块依赖

```
渲染进程
    ↓
主进程
    ↓
Pi Agent SDK
    ↓
Python 脚本
    ↓
本地文件系统
```

---

## 3. 功能需求

### 3.1 功能模块

| 优先级 | 功能 | 说明 | 状态 |
|--------|------|------|------|
| P0 | 日常写作 | 生成、编辑、查看日常写作 | 待开发 |
| P0 | 碎片日记 | 记录、查看、编辑碎片日记 | 待开发 |
| P1 | 角色管理 | 创建、编辑、删除角色 | 待开发 |
| P2 | 设置 | 配置应用设置 | 待开发 |
| P3 | 帮助 | 提供帮助文档 | 待开发 |
| P3 | 更新 | 检查更新、安装更新 | 待开发 |

### 3.2 日常写作

#### 3.2.1 功能描述

日常写作是核心功能，帮助用户记录与 crush 的日常生活。

#### 3.2.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 生成日常写作 | 根据角色记忆和性格，生成一天的生活叙事 | P0 |
| 编辑日常写作 | 编辑已生成的日常写作 | P0 |
| 查看日常写作 | 查看已生成的日常写作 | P0 |
| 删除日常写作 | 删除已生成的日常写作 | P1 |
| 导出日常写作 | 导出日常写作为 Markdown、JSON、CSV | P2 |

#### 3.2.3 用户流程

1. 用户选择角色
2. 用户输入日期描述
3. 系统生成日常写作
4. 用户查看、编辑、保存

#### 3.2.4 数据模型

```typescript
interface Day {
  id: string;
  slug: string;
  dayNumber: number;
  title: string;
  content: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}
```

#### 3.2.5 API 接口

```typescript
// 生成日常写作
interface GenerateDayRequest {
  slug: string;
  dayNumber: number;
  dayFile?: string;
  summary?: string;
  sexCount?: number;
  sexDetails?: string;
  handwriting?: string;
  ycmPill?: number;
}

interface GenerateDayResponse {
  success: boolean;
  data?: Day;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取日常写作列表
interface GetDaysRequest {
  slug: string;
  page?: number;
  pageSize?: number;
}

interface GetDaysResponse {
  success: boolean;
  data?: Day[];
  total?: number;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取日常写作详情
interface GetDayRequest {
  slug: string;
  dayNumber: number;
}

interface GetDayResponse {
  success: boolean;
  data?: Day;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 更新日常写作
interface UpdateDayRequest {
  slug: string;
  dayNumber: number;
  content: string;
}

interface UpdateDayResponse {
  success: boolean;
  data?: Day;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 删除日常写作
interface DeleteDayRequest {
  slug: string;
  dayNumber: number;
}

interface DeleteDayResponse {
  success: boolean;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}
```

### 3.3 碎片日记

#### 3.3.1 功能描述

碎片日记是辅助功能，帮助用户记录零散的恋爱瞬间。

#### 3.3.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 记录碎片 | 记录一个碎片日记 | P0 |
| 查看碎片 | 查看碎片日记列表 | P0 |
| 编辑碎片 | 编辑已记录的碎片日记 | P0 |
| 删除碎片 | 删除已记录的碎片日记 | P1 |
| 整合碎片 | 将碎片日记整合到日常写作 | P1 |
| 导出碎片 | 导出碎片日记为 Markdown、JSON、CSV | P2 |

#### 3.3.3 用户流程

1. 用户选择角色
2. 用户输入碎片信息（来源、情绪、内容）
3. 系统记录碎片日记
4. 用户查看、编辑、保存

#### 3.3.4 数据模型

```typescript
interface Fragment {
  id: string;
  slug: string;
  origin: 'user' | 'crush' | 'ambient';
  mood: 'positive' | 'negative' | 'neutral' | 'mixed';
  content: string;
  envTags: string[];
  behaviorTags: string[];
  createdAt: string;
  updatedAt: string;
}

interface FragmentDay {
  date: string;
  fragments: Fragment[];
  status: 'in_progress' | 'unfinished' | 'expired' | 'completed';
}
```

#### 3.3.5 API 接口

```typescript
// 记录碎片
interface RecordFragmentRequest {
  slug: string;
  origin: 'user' | 'crush' | 'ambient';
  mood: 'positive' | 'negative' | 'neutral' | 'mixed';
  content: string;
  envTags?: string[];
  behaviorTags?: string[];
}

interface RecordFragmentResponse {
  success: boolean;
  data?: Fragment;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取碎片列表
interface GetFragmentsRequest {
  slug: string;
  date?: string;
  page?: number;
  pageSize?: number;
}

interface GetFragmentsResponse {
  success: boolean;
  data?: FragmentDay[];
  total?: number;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取碎片详情
interface GetFragmentRequest {
  slug: string;
  fragmentId: string;
}

interface GetFragmentResponse {
  success: boolean;
  data?: Fragment;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 更新碎片
interface UpdateFragmentRequest {
  slug: string;
  fragmentId: string;
  content?: string;
  envTags?: string[];
  behaviorTags?: string[];
}

interface UpdateFragmentResponse {
  success: boolean;
  data?: Fragment;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 删除碎片
interface DeleteFragmentRequest {
  slug: string;
  fragmentId: string;
}

interface DeleteFragmentResponse {
  success: boolean;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 整合碎片
interface IntegrateFragmentsRequest {
  slug: string;
  date: string;
}

interface IntegrateFragmentsResponse {
  success: boolean;
  data?: Day;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}
```

### 3.4 角色管理

#### 3.4.1 功能描述

角色管理是基础功能，帮助用户管理 crush 角色。

#### 3.4.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 创建角色 | 创建新的 crush 角色 | P0 |
| 编辑角色 | 编辑已创建的 crush 角色 | P0 |
| 查看角色 | 查看角色详情 | P0 |
| 删除角色 | 删除已创建的 crush 角色 | P1 |
| 导入角色 | 导入角色数据 | P2 |
| 导出角色 | 导出角色数据 | P2 |

#### 3.4.3 用户流程

1. 用户点击"创建角色"
2. 用户输入角色信息
3. 系统创建角色
4. 用户查看、编辑、保存

#### 3.4.4 数据模型

```typescript
interface Crush {
  slug: string;
  name: string;
  nickname: string;
  memory: string;
  persona: string;
  meta: CrushMeta;
  createdAt: string;
  updatedAt: string;
}

interface CrushMeta {
  version: string;
  profile: {
    relationship_status: string;
  };
}
```

#### 3.4.5 API 接口

```typescript
// 创建角色
interface CreateCrushRequest {
  name: string;
  nickname: string;
}

interface CreateCrushResponse {
  success: boolean;
  data?: Crush;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取角色列表
interface GetCrushesRequest {
  page?: number;
  pageSize?: number;
}

interface GetCrushesResponse {
  success: boolean;
  data?: Crush[];
  total?: number;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 获取角色详情
interface GetCrushRequest {
  slug: string;
}

interface GetCrushResponse {
  success: boolean;
  data?: Crush;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 更新角色
interface UpdateCrushRequest {
  slug: string;
  name?: string;
  nickname?: string;
  memory?: string;
  persona?: string;
}

interface UpdateCrushResponse {
  success: boolean;
  data?: Crush;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}

// 删除角色
interface DeleteCrushRequest {
  slug: string;
}

interface DeleteCrushResponse {
  success: boolean;
  errors?: Error[];
  warnings?: Warning[];
  metadata?: Metadata;
}
```

### 3.5 设置

#### 3.5.1 功能描述

设置功能帮助用户配置应用。

#### 3.5.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 主题设置 | 设置应用主题（浅色、深色、自动） | P0 |
| 语言设置 | 设置应用语言（中文、英文） | P0 |
| 存储设置 | 设置数据存储位置 | P1 |
| 备份设置 | 设置自动备份策略 | P1 |
| 导入导出设置 | 设置导入导出格式 | P2 |

#### 3.5.3 数据模型

```typescript
interface Settings {
  theme: 'light' | 'dark' | 'auto';
  language: 'zh' | 'en';
  storagePath: string;
  backupEnabled: boolean;
  backupPath: string;
  backupInterval: number;
  exportFormat: 'json' | 'markdown' | 'csv';
}
```

### 3.6 帮助

#### 3.6.1 功能描述

帮助功能提供使用说明。

#### 3.6.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 使用说明 | 提供使用说明 | P0 |
| 常见问题 | 提供常见问题解答 | P1 |
| 联系支持 | 提供联系方式 | P2 |

### 3.7 更新

#### 3.7.1 功能描述

更新功能帮助用户检查和安装更新。

#### 3.7.2 功能列表

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 检查更新 | 检查是否有新版本 | P0 |
| 安装更新 | 安装新版本 | P0 |
| 更新日志 | 显示更新日志 | P1 |

---

## 4. 非功能需求

### 4.1 性能要求

| 指标 | 要求 |
|------|------|
| 启动时间 | < 2 秒 |
| 页面切换 | < 0.5 秒 |
| 数据加载 | < 1 秒 |
| 内存占用 | < 500 MB |

### 4.2 安全要求

| 要求 | 说明 |
|------|------|
| 数据加密 | 本地数据加密存储 |
| 输入验证 | 所有输入数据验证 |
| 错误处理 | 智能错误处理 |
| 隐私保护 | 不收集用户数据 |

### 4.3 可访问性要求

| 要求 | 说明 |
|------|------|
| 键盘导航 | 支持键盘导航 |
| 屏幕阅读器 | 支持屏幕阅读器 |
| 高对比度 | 支持高对比度模式 |
| 字体大小 | 支持字体大小调整 |

### 4.4 国际化要求

| 要求 | 说明 |
|------|------|
| 语言支持 | 支持中文和英文 |
| 日期格式 | 支持本地化日期格式 |
| 数字格式 | 支持本地化数字格式 |

### 4.5 测试要求

| 类型 | 覆盖率 |
|------|--------|
| 单元测试 | >= 80% |
| 集成测试 | >= 70% |
| 端到端测试 | >= 60% |
| 性能测试 | 所有关键路径 |

### 4.6 部署要求

| 平台 | 支持 |
|------|------|
| Windows | Windows 10+ |
| macOS | macOS 10.15+ |
| Linux | Ubuntu 20.04+ |

### 4.7 更新要求

| 要求 | 说明 |
|------|------|
| 自动更新 | 支持自动检查更新 |
| 手动更新 | 支持手动检查更新 |
| 增量更新 | 支持增量更新 |

---

## 5. UI 设计

### 5.1 设计原则

- **现代风格**：时尚、美观、易于扩展
- **简洁清晰**：界面简洁，信息清晰
- **一致性**：保持界面一致性
- **可访问性**：支持可访问性标准

### 5.2 布局设计

```
┌─────────────────────────────────────────────┐
│  侧边栏  │           内容区                 │
│          │                                   │
│  日常写作 │  ┌─────────────────────────────┐ │
│  碎片日记 │  │         页面内容             │ │
│  角色管理 │  │                             │ │
│  设置    │  │                             │ │
│  帮助    │  │                             │ │
│  更新    │  └─────────────────────────────┘ │
│          │                                   │
└─────────────────────────────────────────────┘
```

### 5.3 主题设计

- **浅色主题**：白色背景，深色文字
- **深色主题**：深色背景，浅色文字
- **自动主题**：根据系统设置自动切换

### 5.4 交互设计

- **动画**：页面切换、元素显示隐藏
- **过渡**：状态变化、数据更新
- **提示**：操作反馈、错误提示

### 5.5 组件设计

- **卡片**：展示内容摘要
- **列表**：展示详细信息
- **表单**：输入数据
- **按钮**：触发操作
- **对话框**：确认操作
- **通知**：显示消息

---

## 6. 数据设计

### 6.1 数据存储

- **位置**：本地文件系统
- **格式**：JSON、Markdown
- **结构**：按角色、日期组织

### 6.2 数据备份

- **手动备份**：用户手动触发
- **自动备份**：定时自动备份
- **备份位置**：用户指定路径

### 6.3 数据导入导出

- **JSON**：完整数据格式
- **Markdown**：可读性格式
- **CSV**：表格格式

### 6.4 数据迁移

- **一次性迁移**：将现有数据迁移到新格式
- **向后兼容**：支持旧格式数据

---

## 7. 安全设计

### 7.1 数据安全

- **加密存储**：本地数据加密存储
- **访问控制**：限制数据访问权限
- **数据备份**：定期备份数据

### 7.2 应用安全

- **输入验证**：验证所有输入数据
- **错误处理**：智能错误处理
- **日志记录**：记录关键操作日志

### 7.3 隐私保护

- **不收集数据**：不收集用户数据
- **本地存储**：数据存储在本地
- **用户控制**：用户完全控制数据

---

## 8. 测试设计

### 8.1 测试类型

| 类型 | 说明 | 工具 |
|------|------|------|
| 单元测试 | 测试单个函数/模块 | Jest |
| 集成测试 | 测试模块之间的交互 | Jest |
| 端到端测试 | 测试完整用户流程 | Playwright |
| 性能测试 | 测试性能指标 | 自定义 |

### 8.2 测试策略

- **先写测试**：先写测试，再写代码
- **测试驱动**：测试驱动开发
- **持续测试**：持续运行测试

### 8.3 测试覆盖

| 模块 | 单元测试 | 集成测试 | 端到端测试 |
|------|----------|----------|------------|
| 日常写作 | 80% | 70% | 60% |
| 碎片日记 | 80% | 70% | 60% |
| 角色管理 | 80% | 70% | 60% |
| 设置 | 80% | 70% | 60% |
| 帮助 | 80% | 70% | 60% |
| 更新 | 80% | 70% | 60% |

---

## 9. 部署设计

### 9.1 构建流程

1. 编译 TypeScript
2. 打包 React 应用
3. 打包 Electron 应用
4. 生成安装包

### 9.2 部署平台

| 平台 | 格式 |
|------|------|
| Windows | .exe, .msi |
| macOS | .dmg, .pkg |
| Linux | .deb, .rpm, .AppImage |

### 9.3 更新流程

1. 检查更新
2. 下载更新
3. 安装更新
4. 重启应用

---

## 10. 迁移设计

### 10.1 迁移策略

**一次性迁移**：将所有现有功能迁移到新架构。

### 10.2 迁移步骤

1. 迁移 Python 脚本
2. 迁移 Pi Agent SDK 集成
3. 迁移 Electron 应用
4. 迁移 React 前端
5. 迁移测试
6. 迁移文档

### 10.3 迁移验证

- **代码通过**：代码编译通过，没有语法错误
- **测试通过**：所有测试都通过
- **功能验证**：功能符合预期

---

## 11. `/goal` 命令设计

### 11.1 命令定义

`/goal` 命令让 Claude Code 独立完成项目代码的编写。

### 11.2 命令格式

```
/goal <目标描述>
```

### 11.3 命令参数

| 参数 | 说明 | 必填 |
|------|------|------|
| 目标描述 | 描述要完成的目标 | 是 |

### 11.4 命令执行流程

1. 解析目标描述
2. 分解任务
3. 顺序执行任务
4. 生成代码、文档、测试
5. 验收（代码通过、测试通过、功能验证）
6. 输出结果

### 11.5 命令输出

- **代码**：生成的代码
- **文档**：生成的文档
- **测试**：生成的测试

### 11.6 命令错误处理

- **重试执行**：遇到错误时重试，直到成功
- **自动回滚**：遇到无法解决的错误时，自动回滚到初始状态
- **智能日志**：根据环境自动调整日志级别

### 11.7 命令进度报告

- **详细报告**：报告每个步骤的进度

### 11.8 命令验收标准

- **代码通过**：代码编译通过，没有语法错误
- **测试通过**：所有测试都通过
- **功能验证**：功能符合预期

---

## 12. 项目计划

### 12.1 时间预期

3-5 天

### 12.2 里程碑

| 里程碑 | 说明 | 时间 |
|--------|------|------|
| M1 | 项目初始化 | 第 1 天 |
| M2 | 核心功能开发 | 第 2-3 天 |
| M3 | 辅助功能开发 | 第 4 天 |
| M4 | 测试和文档 | 第 5 天 |

### 12.3 交付物

- 代码
- 测试
- 文档
- 演示

---

## 13. 验收标准

### 13.1 代码验收

- 代码编译通过
- 没有语法错误
- 符合编码规范

### 13.2 测试验收

- 单元测试覆盖率 >= 80%
- 集成测试覆盖率 >= 70%
- 端到端测试覆盖率 >= 60%
- 所有测试通过

### 13.3 功能验收

- 功能符合需求
- 用户体验良好
- 性能符合要求

### 13.4 文档验收

- 文档齐全
- 文档清晰
- 文档准确

---

## 14. 风险和应对

### 14.1 技术风险

| 风险 | 应对 |
|------|------|
| Pi Agent SDK 兼容性 | 提前测试，发现问题及时解决 |
| Electron 性能问题 | 优化代码，减少资源占用 |
| 数据迁移问题 | 制定详细迁移计划，备份数据 |

### 14.2 进度风险

| 风险 | 应对 |
|------|------|
| 时间不足 | 优先开发核心功能，辅助功能延后 |
| 人员不足 | 合理分配任务，提高效率 |

### 14.3 质量风险

| 风险 | 应对 |
|------|------|
| 测试不足 | 提高测试覆盖率，增加测试用例 |
| 代码质量 | 代码审查，遵循编码规范 |

---

## 15. 附录

### 15.1 术语表

| 术语 | 说明 |
|------|------|
| crush | 暗恋对象 |
| 碎片日记 | 零散的恋爱瞬间记录 |
| 日常写作 | 一天的生活叙事 |
| Pi Agent SDK | 底层代理框架 |

### 15.2 参考文档

- [Pi Agent SDK 文档](https://github.com/earendil-works/pi)
- [Electron 文档](https://www.electronjs.org/)
- [React 文档](https://react.dev/)
- [Chakra UI 文档](https://chakra-ui.com/)

### 15.3 变更历史

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2026-06-01 | v1.0 | 初始版本 |
