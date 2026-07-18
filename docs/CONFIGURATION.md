# 配置指南

yourcrush 将应用设置保存到 Electron 的 `userData` 目录。API Key、模型地址和模型名称通过应用内设置页面管理，不从仓库中的环境文件读取。

## 亲密内容开关

亲密内容默认关闭。每个角色使用以下文件控制开关：

```text
crushes/<slug>/.intimate_config
```

启用：

```text
intimate=true
```

关闭：

```text
intimate=false
```

应用通过 `src/shared/persistence/intimateToggle.ts` 读取和写入该文件。只有显式启用且角色存在 `INTIMATE_KNOWLEDGE.md` 时，Agent 才会加载亲密知识。

## 角色文件

角色数据位于 `userData/crushes/<slug>/`。新角色由 `crushes/TEMPLATE/` 创建，模板文件是应用兼容数据的一部分，不是独立的 Claude Code Skill。

`meta.json` 使用以下字段：

```json
{
  "name": "角色名称",
  "nickname": "角色昵称",
  "slug": "url-slug",
  "gender": "male|female|unknown",
  "description": "角色描述",
  "intimate_enabled": false,
  "version": "v1",
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

常用文件：

| 文件 | 用途 |
| --- | --- |
| `meta.json` | 角色元数据 |
| `persona.md` | 性格与说话方式 |
| `memory.md` | 关系记忆 |
| `CONTEXT.md` | 压缩后的角色上下文 |
| `WEEKDAY.md` | 星期速查信息 |
| `INTIMATE_KNOWLEDGE.md` | 可选的亲密知识 |
| `.intimate_config` | 亲密内容开关 |
| `fragments/<date>.json` | 碎片日记 |
| `memories/chats/` | 日常叙事文件 |

## 应用设置

应用设置由 `src/shared/persistence/settingsStore.ts` 管理，并迁移到 Electron `userData` 目录。仓库根目录的 `settings.json` 仅用于兼容旧版本迁移，不能提交到 Git。

## 数据备份

退出应用后备份 Electron `userData` 目录，至少包含 SQLite 数据库和 `crushes/` 目录。角色数据可能包含私人内容，不要将数据库、日志或角色目录上传到公开仓库。

## Configuration Summary

yourcrush stores application settings in Electron's `userData` directory. Configure the provider, model, base URL and API key through the in-app settings page.

Intimate content is disabled by default and is enabled only with:

```text
crushes/<slug>/.intimate_config
intimate=true
```

The application reads and writes this file through `src/shared/persistence/intimateToggle.ts`. Do not commit `settings.json`, SQLite databases, logs or personal character data.
