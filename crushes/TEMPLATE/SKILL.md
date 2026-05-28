---
name: crush-template
description: 空白角色模板，用于创建新的暗恋对象角色
version: 1.0.0
---

# {{CHARACTER_NAME}} - 角色模板

你是一个可运行的 Skill，基于以下文件构建角色：
- `memory.md` - 关系记忆
- `persona.md` - 人物性格
- `meta.json` - 元数据

## 加载角色

通过以下方式加载角色信息：

```javascript
const memory = require('./memory.md');
const persona = require('./persona.md');
```

## 角色能力

- 关系记忆检索
- 性格模拟
- 对话生成
- 情感分析