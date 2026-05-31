# Goal: yourcrush Client v0.3.0 — 创建角色与用户档案 GUI 化

## 你的任务

将 `/create-crush` 和 `/create-user` 两个 CLI Skill 集成到 Electron GUI，让用户无需命令行即可完成角色创建和用户档案管理。

开发目录：`d:/CLAUDECODE/yourcrush/yourcrush-client`

---

## 当前状态

v0.2.0 核心闭环已打通（录入碎片 → 查看碎片 → 生成叙事 → 阅读叙事）。

目前"创建角色"和"用户档案"在启动页只显示 CLI 命令提示，用户需要手动在终端执行。下一步是将这两个流程 GUI 化。

---

## 任务清单

### 任务 1：创建用户档案页面（CreateUserPage）

**目标**：用户通过表单录入性格特点和写作风格，生成 `user/profile.md` 和 `user/writing_style.md`。

**参考**：`.claude/skills/create-user/SKILL.md` 中的 4 个引导问题。

**步骤**：
1. 创建 `src/renderer/pages/CreateUserPage.tsx`
2. 设计分步表单（Step 1-4）：
   - Step 1：性格特点（MBTI 选择、性格标签多选、说话习惯）
   - Step 2：恋爱观与情感表达
   - Step 3：写作风格偏好（视角、情感浓度、节奏、措辞风格）
   - Step 4：确认预览
3. 添加 IPC 通道 `user:save`：
   - 主进程接收表单数据，生成 `user/profile.md` 和 `user/writing_style.md`
   - 参考 `.claude/skills/create-user/` 下的模板格式
4. 更新 store 添加 `'create-user'` 页面类型
5. 更新 App.tsx 路由
6. 更新 StartupPage 的"用户档案"卡片，从 `action: 'cli'` 改为 `action: 'navigate'`

**关键文件**：
- 新建：`src/renderer/pages/CreateUserPage.tsx`
- 修改：`src/main/ipc.ts`（添加 `user:save`）
- 修改：`src/preload/index.ts`（添加 `saveUserProfile`）
- 修改：`src/renderer/store/index.ts`（添加页面类型）
- 修改：`src/renderer/App.tsx`（添加路由）
- 修改：`src/renderer/pages/StartupPage.tsx`（修改卡片 action）
- 参考：`user/profile.md`、`user/writing_style.md`（目标格式）

**验证**：
- 从启动页点击"用户档案"卡片 → 进入表单
- 填写各步骤 → 确认 → 文件写入 `user/` 目录
- 重新打开应用 → 读取已有档案回填到表单

---

### 任务 2：创建角色页面（CreateCrushPage）

**目标**：用户通过表单输入暗恋对象信息，创建 `crushes/<slug>/` 目录及核心文件。

**参考**：`.claude/skills/create-crush/prompts/intake.md` 中的 3 个问题序列。

**步骤**：
1. 创建 `src/renderer/pages/CreateCrushPage.tsx`
2. 设计分步表单（Step 1-3）：
   - Step 1：花名/代号（必填）→ 自动生成 slug
   - Step 2：基本信息（认识时长、关系状态、职业、城市）→ 可跳过
   - Step 3：性格画像（MBTI、星座、性格标签、印象）→ 可跳过
3. 添加 IPC 通道 `crush:create`：
   - 主进程接收数据，创建 `crushes/<slug>/` 目录
   - 生成 `meta.json`（基本信息）
   - 生成 `persona.md`（性格画像模板）
   - 生成 `memory.md`（空白记忆文件）
   - 生成 `SKILL.md`（从模板复制并填入变量）
   - 参考 `crushes/TEMPLATE/` 目录结构
4. 更新 store 添加 `'create-crush'` 页面类型
5. 更新 App.tsx 路由
6. 更新 StartupPage 的"创建角色"卡片，从 `action: 'cli'` 改为 `action: 'navigate'`
7. 创建成功后 CrushSelector 自动刷新列表

**关键文件**：
- 新建：`src/renderer/pages/CreateCrushPage.tsx`
- 修改：`src/main/ipc.ts`（添加 `crush:create`）
- 修改：`src/preload/index.ts`（添加 `createCrush`）
- 修改：`src/renderer/store/index.ts`（添加页面类型）
- 修改：`src/renderer/App.tsx`（添加路由）
- 修改：`src/renderer/pages/StartupPage.tsx`（修改卡片 action）
- 参考：`crushes/TEMPLATE/`（目标目录结构）
- 参考：`.claude/skills/create-crush/prompts/intake.md`（问题序列）

**验证**：
- 从启动页点击"创建角色"卡片 → 进入表单
- 填写代号"测试角色" → 确认 → `crushes/ceshi_juese/` 目录创建
- 目录包含 `meta.json`、`persona.md`、`memory.md`、`SKILL.md`
- CrushSelector 下拉列表自动出现新角色

---

## 编码规范

- `npx tsc --noEmit` 必须通过
- 不要改动未涉及的文件
- 不要添加未被要求的功能
- 匹配现有代码风格（中文注释、TypeBox 校验、Zustand 状态管理）
- 每完成一个任务，运行 `npm run dev` 验证

---

## 完成标准

当以下场景端到端可用时，v0.3.0 即告完成：

1. 启动页 → 点击"用户档案" → 进入表单 → 填写 → 保存 → `user/` 目录生成文件
2. 启动页 → 点击"创建角色" → 进入表单 → 填写代号 → 确认 → `crushes/<slug>/` 目录创建
3. CrushSelector 自动刷新，显示新创建的角色
4. 选择新角色 → 进入写作 → 碎片录入和叙事生成正常工作

---

## 参考文档

- `docs/CLIENT_STATUS.md` — 当前开发状态
- `.claude/skills/create-user/SKILL.md` — 用户档案 Skill 定义
- `.claude/skills/create-crush/prompts/intake.md` — 角色创建问题序列
- `crushes/TEMPLATE/` — 角色目录模板
- `user/profile.md` — 用户档案目标格式
- `user/writing_style.md` — 写作风格目标格式
