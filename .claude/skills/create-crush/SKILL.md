# create-crush — 角色蒸馏 / Character Distillation

> 从聊天记录或描述中创建暗恋对象角色

## 使用方法 / How to Use

```
/create-crush
```

## 工作流程 / Workflow

1. **信息录入** — 引导录入花名、基本信息、性格画像
2. **导入原材料** — 接受聊天记录、照片、或直接文字描述
3. **性格分析** — 从原材料中提取说话风格、情感模式、行为特征
4. **生成 persona.md** — 构建 5 层人物性格档案
5. **生成 memory.md** — 构建关系记忆、时间线、甜蜜档案

## 原材料支持 / Supported Inputs

- QQ 聊天记录（txt/mht）
- 微信聊天记录（WeChatMsg/留痕/PyWxDump/纯文本）
- 社交媒体内容（朋友圈/微博/小红书/Instagram）
- 照片
- 直接文字描述

## 输出文件 / Output Files

| 文件 | 说明 |
|------|------|
| `crushes/<slug>/persona.md` | 人物性格（5 层结构） |
| `crushes/<slug>/memory.md` | 关系记忆与时间线 |
| `crushes/<slug>/meta.json` | 元数据 |

## 追加原材料 / Append Materials

创建完成后，再次运行 `/create-crush` 可追加新原材料，系统会增量合并到现有文件中。

---

# English Version

> Create a crush character from chat logs or descriptions

## Usage

```
/create-crush
```

## Workflow

1. **Info intake** — Guide through name, basic info, personality
2. **Import materials** — Accept chat logs, photos, or text descriptions
3. **Personality analysis** — Extract speaking style, emotional patterns, behaviors
4. **Generate persona.md** — Build 5-layer personality profile
5. **Generate memory.md** — Build relationship memory, timeline, sweet archive

## Supported Inputs

- QQ chat logs (txt/mht)
- WeChat chat logs
- Social media content
- Photos
- Direct text descriptions

## Output Files

| File | Description |
|------|-------------|
| `crushes/<slug>/persona.md` | Character personality (5-layer structure) |
| `crushes/<slug>/memory.md` | Relationship memory and timeline |
| `crushes/<slug>/meta.json` | Metadata |
