# CONTEXT.md — 领域术语表

> 本文档定义 yourcrush 项目的核心领域术语，帮助 AI 和开发者建立统一的语言。

---

## 项目概述

**yourcrush** 是一个恋爱日记应用，帮助用户记录与暗恋对象的日常生活。核心理念是"软件化开发"，构建可维护、可扩展、可测试的软件系统。

---

## 核心概念

### Crush（角色）
用户的暗恋对象。每个角色有独立的数据目录 `crushes/<slug>/`，包含：
- `persona.md` — 角色性格档案
- `memory.md` — 关系记忆
- `meta.json` — 元数据
- `fragments/` — 碎片日记目录

**不要说**：对象、对象、ta、她/他
**要说**：crush、角色

### Slug（角色标识符）
角色的唯一标识符，用于目录命名。例如：`xiaoxue`、`demo`

### Day（日）
以天为单位的叙事单元，记录一天的完整故事。存储在 `crushes/<slug>/days/` 目录。

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

### FragmentDay（碎片日）
某一天的所有碎片集合。存储为 `crushes/<slug>/fragments/<date>.json`

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

---

## 技术栈

### Pi Agent
底层代理框架，负责：
- 加载和执行 Skills
- 管理角色数据和状态
- 处理用户输入和生成输出

### TypeScript
核心业务逻辑全部使用 TypeScript 实现：
- `src/shared/fragment/` — 碎片模型、状态机、存储、推荐和整合
- `src/shared/day/` — 日常叙事生成与文件存储
- `src/shared/crush/` — 角色数据与兼容数据迁移
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
核心功能，用户提供事件线索，系统生成符合 day 写作原则的叙事。

**不要说**：写作、写日记
**要说**：叙事生成

### 碎片辅助叙事（Fragment-Assisted Narrative）
辅助功能，用户输入碎片，系统整合后生成叙事。

### 事件线索（Event Clue）
用户输入的简短描述，如"今天和ta去咖啡馆"。

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
