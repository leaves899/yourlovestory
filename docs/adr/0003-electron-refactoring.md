# ADR-0003: Electron 桌面应用重构

## 状态

已批准

## 上下文

yourcrush 项目当前基于 Claude Code Skills 构建，需要迁移到独立的桌面应用形态。

**用户需求**：
1. 重构为基于 Pi Agent SDK 的创作软件
2. Electron 桌面应用形态
3. 完全迁移，不保留 Claude Code Skills

## 决策

### 核心定位

| 功能 | 定位 | 说明 |
|------|------|------|
| **叙事生成** | 核心功能 | 用户提供事件线索，直接生成叙事 |
| **碎片日记** | 辅助功能 | 可选的素材记录功能 |

### 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 应用层 | Electron | 桌面应用框架 |
| 代理层 | Pi Agent SDK | 核心对话代理 |
| 业务层 | TypeScript | 全 TypeScript 实现（无 Python 桥接） |

### 迁移策略

- 完全迁移，不保留 Claude Code Skills
- Python 逻辑全部重写为 TypeScript
- 先实现核心 UI，再补充辅助功能

### 测试策略

- TDD 驱动
- 每个 Phase 完成后编写测试

### 优先级

1. 先实现 Pi Agent + LLM 叙事生成
2. 验证核心价值
3. 再扩展其他功能

## 后果

### 正面
- 单一语言栈，减少桥接复杂度
- 类型安全，IDE 支持更好
- 打包更简单（无需 Python 运行时）

### 负面
- 工作量较大（需要重写所有 Python 逻辑）
- 需要测试验证所有功能

## 相关文档

- [重构计划](../REFACTORING_PLAN.md)
- [CONTEXT.md](../../CONTEXT.md)
