# ADR-0002: Pi Agent 集成

## 状态

已批准

## 上下文

yourcrush 需要一个 AI 代理框架来处理：
- 用户输入解析
- 碎片日记生成
- 角色数据管理
- 多模型支持

## 决策

采用 **Pi Agent** 作为底层代理框架：

1. **Node.js 客户端**
   - 使用 `@earendil-works/pi-coding-agent`
   - 负责与 Pi Agent 通信

2. **Python 脚本**
   - 负责核心业务逻辑
   - 通过子进程调用集成

3. **Skill 系统**
   - `.claude/skills/` 目录存放 Skills
   - 每个 Skill 负责特定功能

4. **事件驱动**
   - 实时事件推送
   - 支持流式输出

## 后果

### 正面
- 强大的 AI 能力
- 灵活的扩展性
- 多模型支持
- 丰富的事件系统

### 负面
- 技术栈复杂（Node.js + Python）
- 需要维护两个运行环境
- 依赖外部框架

## 相关文档

- [Pi Agent 参考文档](../PI_AGENT_REFERENCE.md)
- [Skill 系统说明](../SKILL_SYSTEM.md)
