# onboard — 新手引导 / Onboarding Guide

> 检测当前进度，给出个性化的下一步指引

## 使用方法 / How to Use

```
/onboard
```

## 工作流程 / Workflow

按以下步骤检测用户状态，然后输出对应的引导。

### Step 1: 检测用户档案

读取 `user/profile.md`，检查 `- **MBTI**：` 这一行冒号后面是否为空。

- 为空（或整个文件不存在）→ **State 0**
- 不为空 → 继续

### Step 2: 检测角色

扫描 `crushes/` 目录下的子目录，排除 `TEMPLATE` 和 `demo`。

- 无有效子目录 → **State 1**
- 有子目录，读取其中 `meta.json` 的 `name` 字段：
  - 值为 `{{CHARACTER_NAME}}`、空字符串、或文件不存在 → **State 2**（空壳）
  - 有实际值（如"小晚"）→ 继续

### Step 3: 检测 Day 文件

检查该角色目录下 `memories/chats/` 中 `day*.md` 文件的数量。

- 无 day 文件 → **State 3**
- 1-4 个 day 文件 → **State 4**
- 5 个及以上 → **State 5**

---

## 状态输出 / State Outputs

### State 0 — 无用户档案

```
欢迎来到 yourcrush！

你还没有创建自己的档案。先来认识一下你自己吧。

运行 /create-user 开始创建你的性格档案。
这会让 AI 写作时更贴合你的风格。

创建完成后，再运行 /onboard 查看下一步。
```

### State 1 — 有档案，无角色

```
你的档案已就绪！接下来创建你的暗恋对象。

运行 /create-crush 开始角色创建。
你可以提供聊天记录、照片，或者直接描述 ta 的性格。

创建完成后，再运行 /onboard 查看下一步。
```

### State 2 — 角色为空壳

```
你创建了角色目录，但信息还不够完整。

建议运行 /create-crush 继续完善角色信息。
你需要提供 ta 的性格描述或聊天记录，AI 才能写出属于你们的故事。
```

### State 3 — 角色就绪，无 Day

```
{角色昵称} 已就绪！来写你的第一个 Day 吧。

运行 /day 开始写作，例如：
  /day 上周五，我们第一次单独吃饭

提示：想看看示例效果？运行：
  python scripts/import_demo.py
导入后查看 crushes/example/ 下的文件，了解角色数据结构和 Day 写作格式。
```

### State 4 — 刚开始写作

```
你已经写了 {N} 个 Day 了！继续加油。

运行 /day 继续写作，例如：
  /day 昨天，我们一起看了电影

想查看关系进展？运行 /progress
```

### State 5 — 持续写作中

```
你已经写了 {N} 个 Day ！你们的故事在不断丰富。

运行 /day 继续写作
运行 /progress 查看关系发展阶段和建议
运行 /onboard 随时查看引导
```

---

## 注意事项 / Notes

- 检测时自动跳过 `TEMPLATE` 和 `demo` 目录
- 如果有多个角色，显示 Day 数量最多的那个
- 引导内容根据实际状态动态生成，不要硬编码角色名

---

# English Version

> Detect current progress and provide personalized next-step guidance

## Usage

```
/onboard
```

## Workflow

1. Check `user/profile.md` — MBTI field empty? → State 0
2. Scan `crushes/` (exclude TEMPLATE, demo) — no valid dirs? → State 1
3. Check `meta.json` name field — placeholder? → State 2
4. Count `day*.md` files in `memories/chats/` — 0? → State 3, <5? → State 4, >=5? → State 5

## Notes

- Automatically skips `TEMPLATE` and `demo` directories
- If multiple crushes exist, shows the one with the most Day files
