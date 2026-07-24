# CONTEXT.md — 领域术语表

> 本文档定义 yourcrush 项目的核心领域术语，帮助 AI 和开发者建立统一的语言。

---

## 项目概述

**yourcrush** 是一个以长篇创作工作台为主线、兼容恋爱日记的 Electron 应用。工作台负责项目、角色、世界观、素材、大纲、章节版本和叙事记忆；旧 Crush、Day、Fragment 和关系进度页面继续提供兼容访问。核心理念是本地优先、可审核和可恢复的创作流程。

### 当前产品方向

- 默认入口是长篇创作工作台；恋爱日记是明确标注的兼容入口。
- 旧恋爱日记数据只做一次性导入：旧 `Fragment` 导入工作台后成为独立的 `SourceMaterial`，不与 JSON 文件持续双写。
- 工作台的优先垂直闭环是：项目 → 素材 → 大纲 → 章节生成 → 审核版本 → 叙事记忆与伏笔。
- 业务能力由应用内 Pi Agent 注册工具提供，独立 `SKILL.md` 不再是运行时调用入口。

---

## 核心概念

### Crush（角色）
用户的暗恋对象。安装包中的模板位于 `crushes/TEMPLATE/`，运行时角色数据位于 Electron `userData/crushes/<slug>/`，包含：
- `persona.md` — 角色性格档案
- `memory.md` — 关系记忆
- `meta.json` — 元数据
- `fragments/` — 兼容入口使用的碎片日记目录
- `.intimate_config` — 亲密内容开关，默认关闭

**不要说**：对象、对象、ta、她/他
**要说**：crush、角色

### Slug（角色标识符）
角色的唯一标识符，用于目录命名。例如：`xiaoxue`、`demo`

### Day（日）
以天为单位的兼容叙事单元，记录一天的完整故事。运行时文件存储在 `userData/crushes/<slug>/memories/chats/`，文件名中的 Day 编号由数据动态计算。

---

## 碎片日记系统

### Fragment（碎片）
最小的叙事单元，记录一个瞬间。包含：
- `origin` — 来源（user/crush/ambient）
- `mood` — 情绪（positive/negative/neutral/mixed）
- `content` — 内容文本
- `env_tags` — 环境标签
- `behavior_tags` — 行为标签

**不要说**：记录、笔记、条目
**要说**：碎片、fragment

### SourceMaterial（故事素材）
工作台中的可复用故事素材，存储在 SQLite 中并归属于创作项目。它可以来自用户新建内容，也可以由旧恋爱日记 `Fragment` 一次性导入。导入后 SourceMaterial 独立维护，不回写旧 JSON Fragment。

`Fragment` 是兼容入口的数据模型，`SourceMaterial` 是工作台的数据模型。两者不能在新代码中混用命名。

### FragmentDay（碎片日）
某一天的所有碎片集合。运行时存储为 `userData/crushes/<slug>/fragments/<date>.json`

### 来源（Origin）
碎片的产生来源：
- `user` — 用户主动记录
- `crush` — 来自 crush 的内容（聊天、动态等）
- `ambient` — 环境氛围（天气、时间、心情等）

### 情绪（Mood）
碎片的情感倾向：
- `positive` — 正面情绪
- `negative` -—负面情绪
- `neutral` — 中性
- `mixed` — 复杂混合情绪

---

## 标签系统

### 环境标签（Env Tags）
描述碎片发生的场景环境：
- `work` — 工作场所
- `home` — 家
- `school` — 学校
- `cafe` — 咖啡厅
- `park` — 公园
- `restaurant` — 餐厅
- `mall` — 商场
- `cinema` — 电影院
- `gym` — 健身房
- `transport` — 交通工具

### 行为标签（Behavior Tags）
描述 crush 的行为特征：
- `cute` — 可爱
- `cool` — 酷
- `shy` — 害羞
- `happy` — 开心
- `sad` — 难过
- `angry` — 生气

### 降频策略（Frequency Reduction）
防止标签过度推荐的机制：
- 连续跳过 3 次 → 阈值从 50% 提高到 70%
- 用于平衡标签的多样性和准确性

---

## 状态机

### 碎片状态（Fragment Status）
- `EDITABLE` — 可编辑，用户可以修改内容
- `READONLY_REGENERABLE` — 只读，但可以重新生成叙事
- `READONLY_FINAL` — 只读，不可修改

### 日期状态（Date Status）
- `IN_PROGRESS` — 进行中，碎片所属日期 = 当前日期
- `UNFINISHED` — 未完成，7 天内未完成整合
- `EXPIRED` — 已过期，超过 7 天，只读归档
- `COMPLETED` — 已完成，不可编辑、不可删除

### 乐观锁（Optimistic Lock）
防止并发冲突的机制。每次更新时校验版本号，版本不匹配则拒绝更新。

---

## 写作模式

### Raw Mode（自由模式）
用户自由输入，AI 不做引导。

### Guided Mode（引导模式）
AI 提供写作提示，引导用户记录。

### Themed Mode（主题模式）
围绕特定主题（如"第一次约会"）组织写作。

### Blind Mode（盲写模式）
AI 根据关键词和语义相似度匹配内容，生成叙事。

---

## 长篇创作工作台

### Novel Project（创作项目）
工作台的隔离边界。项目包含角色、世界观、组织、关系、SourceMaterial、卷章大纲、章节和版本，不等同于旧的 Crush 目录。

### Outline（大纲）
按卷和章节组织的创作计划。大纲经历草稿、确认、锁定和解锁，章节生成只能使用明确选择的素材与已锁定边界。

### Chapter Version（章节版本）
章节生成后的可审核快照。版本保留摘要、事实核查、生成元数据和修订关系，用户确认后才成为当前采用版本。

### Narrative Memory（叙事记忆）
从章节中提取、待审核或已确认的可复用事实、事件、人物状态和主题。记忆不会未经审核自动改变项目事实。

### Foreshadow（伏笔）
贯穿章节的叙事线索，拥有状态和事件记录，用于追踪埋设、推进与回收。

### 一次性旧数据导入
导入以 `crush_slug` 和旧 `fragment_id` 作为幂等来源标识。导入前展示预览，确认后写入 Character 与 SourceMaterial；导入完成后两套存储不再持续同步。

---

## Prompt 生成矩阵

碎片 Prompt 由 13 种组合构成：
- 来源（3 种）× 情绪（4 种）+ 默认
- 每种组合有特定的 Prompt 模板

---

## 角色系统

### Persona（性格档案）
角色的性格特征、说话方式、兴趣爱好等。

### Memory（关系记忆）
用户与角色的关系历史、重要事件、互动记录。

### Intimate Knowledge（亲密知识库）
可选模块，记录亲密内容。默认关闭，需用户显式启用。

## 关系阶段

关系进度使用五阶段模型，阶段规则由 `src/shared/relationship/` 提供并动态参与兼容 Day 叙事：

| 阶段 | 标识 | 说明 |
| --- | --- | --- |
| 0 | `stranger` | 陌生人 |
| 1 | `acquaintance` | 认识 |
| 2 | `flirting` | 暧昧 |
| 3 | `confession` | 表白 |
| 4 | `passion` | 热恋 |

前两个阶段可按信号累计并请求用户确认推进，后续阶段默认由用户确认或手动设置。涉及亲密内容的信号、Prompt 和规则必须同时受 `.intimate_config` 约束，亲密模式关闭时不得读取或生成亲密细节。

---

## 技术栈

### Pi Agent
底层代理框架，负责：
- 通过 `src/agent` 注册并调用应用工具
- 管理工作台项目会话、任务和状态
- 处理用户输入并生成可审核输出

独立 Skill 包是历史设计，不是当前应用运行时入口。`crushes/TEMPLATE/SKILL.md` 即使作为旧模板文件保留，也不得被新业务依赖。

### TypeScript
核心业务逻辑全部使用 TypeScript 实现：
- `src/shared/fragment/` — 碎片模型、状态机、存储、推荐和整合
- `src/shared/day/` — 日常叙事生成与文件存储
- `src/shared/crush/` — 角色数据与兼容数据迁移
- `src/shared/novelProject/` — 创作项目、角色、世界观、组织、关系与素材
- `src/shared/chapterGeneration/` — 章节生成、摘要、事实核查与恢复
- `src/shared/narrativeWorkbench/` — 叙事记忆、伏笔、技能和修订
- `src/shared/persistence/` — 设置和亲密内容开关
- `src/main/database/` — SQLite 数据库、迁移和仓储
- `src/agent/` — Pi Agent、LLM 适配和动态工具加载

### Electron
桌面应用框架，负责：
- 主进程（Pi Agent 集成）
- 渲染进程（React UI）
- IPC 通信

---

## 重构术语

### 叙事生成（Narrative Generation）
核心功能，用户提供故事素材或事件线索，系统生成可审核的章节或兼容 Day 叙事。

**不要说**：写作、写日记
**要说**：叙事生成

### 碎片辅助叙事（Fragment-Assisted Narrative）
兼容功能，用户输入 Fragment，系统整合后生成 Day 叙事；工作台新流程使用 SourceMaterial。

### 事件线索（Event Clue）
用户输入的简短描述，如"今天和角色去咖啡馆"。

### Pi Agent
底层代理框架，负责对话管理和工具调用。

### Tool（工具）
Pi Agent 的功能单元，如 `day_writer`、`fragment_crud`。

### IPC（进程间通信）
Electron 主进程与渲染进程之间的通信机制。

---

## 术语对照表

| 英文术语 | 中文术语 | 说明 |
|---------|---------|------|
| Fragment | 碎片 | 最小叙事单元 |
| SourceMaterial | 故事素材 | 工作台项目中的可复用素材 |
| FragmentDay | 碎片日 | 某天的所有碎片 |
| Crush | 角色 | 暗恋对象 |
| Slug | 标识符 | 角色唯一 ID |
| Persona | 性格档案 | 角色性格 |
| Memory | 关系记忆 | 互动历史 |
| Origin | 来源 | 碎片产生方式 |
| Mood | 情绪 | 情感倾向 |
| Env Tags | 环境标签 | 场景环境 |
| Behavior Tags | 行为标签 | 行为特征 |
| Frequency Reduction | 降频策略 | 防止标签过度推荐 |
| Optimistic Lock | 乐观锁 | 防止并发冲突 |
| State Machine | 状态机 | 状态转换逻辑 |
| Novel Project | 创作项目 | 长篇工作台的隔离边界 |
| Chapter Version | 章节版本 | 可审核的章节快照 |
| Narrative Memory | 叙事记忆 | 经审核后可复用的叙事事实 |
| Foreshadow | 伏笔 | 可追踪的叙事线索 |
