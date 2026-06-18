# 配置指南 / Configuration Guide

> 了解如何配置和管理 yourcrush

---

## 亲密内容开关 / Intimate Content Toggle

### 什么是亲密内容模块

亲密内容模块用于存储和生成更私密的叙事内容。这是一项可选功能，默认关闭。

### 工作原理

亲密内容通过独立的配置文件 `.intimate_config` 控制：

```
crushes/<slug>/.intimate_config
```

配置文件内容：
```bash
intimate=true   # 开启
# 或
intimate=false  # 关闭
```

---

## 启用/禁用亲密模块 / Enable/Disable Intimate Module

### 手动方式 / Manual Method

原 Python CLI 工具 `toggle_intimate.py` 已迁移为 TypeScript 实现
（`src/shared/persistence/intimateToggle.ts`），命令行入口不再保留。
直接编辑 `.intimate_config` 文件即可：

The original Python CLI tool `toggle_intimate.py` has been migrated to TypeScript
(`src/shared/persistence/intimateToggle.ts`); the CLI entry is no longer provided.
Edit `.intimate_config` directly instead:

```bash
# 开启 / Enable
echo "intimate=true" > crushes/<slug>/.intimate_config

# 关闭 / Disable
echo "intimate=false" > crushes/<slug>/.intimate_config
```

### 配置文件格式 / Config File Format

`.intimate_config` 文件内容（兼容旧格式）：

```bash
intimate=true   # 开启 / enabled
intimate=false  # 关闭 / disabled
```

---

## 配置文件说明 / Configuration Files

### meta.json - 角色元数据

```json
{
  "name": "角色真实姓名",
  "nickname": "角色昵称",
  "slug": "url-slug",
  "gender": "male|female|unknown",
  "description": "角色描述",
  "intimate": false,
  "created_at": "ISO8601 时间戳",
  "last_updated": "ISO8601 时间戳"
}
```

### .intimate_config - 亲密内容开关

```
intimate=true|false
```

### SKILL.md - Skill 配置

```yaml
---
name: crush-slug
description: 角色描述
version: 1.0.0
---
```

---

## 数据存储位置 / Data Storage Locations

### 角色数据根目录

```
crushes/<slug>/
```

### 核心文件

| 文件 | 用途 | 敏感度 |
|------|------|--------|
| `memory.md` | 关系记忆 | 高 |
| `persona.md` | 性格特征 | 高 |
| `meta.json` | 元数据 | 中 |
| `.intimate_config` | 亲密开关 | 低 |
| `SKILL.md` | Skill配置 | 低 |

### 聊天记录

```
crushes/<slug>/memories/chats/
```

### 日程规划

```
crushes/<slug>/plans/
```

---

## 环境变量 / Environment Variables

yourcrush 暂不需要环境变量配置。

---

## 数据备份建议 / Data Backup Recommendations

### 需要备份的文件

- `crushes/` 整个目录
- 特别是 `memory.md` 和 `persona.md`

### 备份方式

```bash
# 压缩备份
tar -czvf backup.tar.gz crushes/

# 或复制到其他位置
cp -r crushes/ ~/backups/crushes/
```

---

## 安全建议 / Security Recommendations

1. **本地存储** - 所有数据存储在本地，不上传到云端
2. **权限控制** - 确保 `crushes/` 目录权限正确
3. **定期备份** - 防止数据丢失
4. **不分享数据** - 不与他人分享角色文件

---

# English Version

# Configuration Guide

> Understanding how to configure and manage yourcrush

---

## Intimate Content Toggle

### What is the Intimate Content Module

The intimate content module stores and generates more private narrative content. This is an optional feature, disabled by default.

### How It Works

Intimate content is controlled by a separate configuration file `.intimate_config`:

```
crushes/<slug>/.intimate_config
```

Configuration file content:
```bash
intimate=true   # enabled
# or
intimate=false  # disabled
```

---

## Enable/Disable Intimate Module

### Manual Method

The original Python CLI tool `toggle_intimate.py` has been migrated to TypeScript
(`src/shared/persistence/intimateToggle.ts`); the CLI entry is no longer provided.
Edit `.intimate_config` directly:

```bash
# Enable
echo "intimate=true" > crushes/<slug>/.intimate_config

# Disable
echo "intimate=false" > crushes/<slug>/.intimate_config
```

---

## Configuration Files

### meta.json - Character Metadata

```json
{
  "name": "Character real name",
  "nickname": "Character nickname",
  "slug": "url-slug",
  "gender": "male|female|unknown",
  "description": "Character description",
  "intimate": false,
  "created_at": "ISO8601 timestamp",
  "last_updated": "ISO8601 timestamp"
}
```

### .intimate_config - Intimate Content Toggle

```
intimate=true|false
```

### SKILL.md - Skill Configuration

```yaml
---
name: crush-slug
description: Character description
version: 1.0.0
---
```

---

## Data Storage Locations

### Character Data Root Directory

```
crushes/<slug>/
```

### Core Files

| File | Purpose | Sensitivity |
|------|---------|-------------|
| `memory.md` | Relationship memory | High |
| `persona.md` | Personality traits | High |
| `meta.json` | Metadata | Medium |
| `.intimate_config` | Intimate toggle | Low |
| `SKILL.md` | Skill config | Low |

### Chat Records

```
crushes/<slug>/memories/chats/
```

### Schedule Planning

```
crushes/<slug>/plans/
```

---

## Environment Variables

yourcrush does not require environment variables configuration.

---

## Data Backup Recommendations

### Files to Backup

- Entire `crushes/` directory
- Especially `memory.md` and `persona.md`

### Backup Methods

```bash
# Compressed backup
tar -czvf backup.tar.gz crushes/

# Or copy to another location
cp -r crushes/ ~/backups/crushes/
```

---

## Security Recommendations

1. **Local Storage** - All data stored locally, not uploaded to cloud
2. **Permission Control** - Ensure `crushes/` directory permissions are correct
3. **Regular Backup** - Prevent data loss
4. **Don't Share Data** - Don't share character files with others