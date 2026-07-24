# ADR-0005：长篇工作台优先与旧数据一次性导入

## 状态

已批准

## 背景

yourcrush 同时包含早期恋爱日记能力和新的长篇创作能力。两套能力的存储边界、术语和入口不同：旧日记以 Crush 目录和 JSON Fragment 为中心，工作台以 SQLite 创作项目和 SourceMaterial 为中心。如果继续把两套模型作为一条实时链路维护，容易产生双写冲突、术语漂移和无法审核的自动修改。

## 决策

1. **长篇工作台是默认产品主线**
   - 默认入口进入工作台项目流程。
   - 旧 Day、Crush、Fragment 和关系进度页面保留为兼容入口，不再作为新功能的主要扩展边界。

2. **旧数据只做一次性导入**
   - 旧 Crush 导入工作台 Character。
   - 旧 Fragment 导入工作台 SourceMaterial。
   - 导入前提供预览和确认，使用 `crush_slug` 与 `fragment_id` 作为幂等来源标识。
   - 导入完成后，SourceMaterial 与旧 JSON Fragment 独立维护，不做持续同步或双写。

3. **工作台以可审核创作闭环为边界**
   - 项目、素材、大纲、章节生成、章节版本、叙事记忆和伏笔由 SQLite 事务与领域服务管理。
   - Agent 通过注册工具访问领域服务，不能绕过服务直接写仓储。

4. **关系进度统一为五阶段模型**
   - 阶段顺序为：陌生人、认识、暧昧、表白、热恋。
   - 阶段规则由 `src/shared/relationship/` 动态提供给兼容 Day 叙事。
   - 亲密阶段规则和亲密知识必须受角色 `.intimate_config` 约束，关闭时不得生成亲密细节。

5. **独立 Skill 入口废弃**
   - 应用运行时能力由 `src/agent` 注册工具提供。
   - `crushes/TEMPLATE/SKILL.md` 仅作为历史模板资产处理，新代码不得依赖或加载它。

## 后果

### 正面

- 工作台有明确的项目边界、审核边界和数据所有权。
- 旧用户可以保留原有日记数据，同时逐步迁移到长篇创作流程。
- 一次性导入避免 JSON 与 SQLite 长期双写导致的数据分叉。
- 五阶段关系模型与亲密内容策略可以在同一 seam 约束。

### 负面

- 导入后用户需要理解 Fragment 与 SourceMaterial 的差异。
- 旧入口和工作台会在一段时间内同时存在，文档必须明确兼容边界。
- 独立 Skill 文档和旧 PRD 不能再视为当前实现契约。

## 相关文档

- [CONTEXT.md](../../CONTEXT.md)
- [碎片日记 PRD](../features/fragment-journal-prd.md)
- [关系进度历史 PRD](../features/relationship-progress-prd.md)
