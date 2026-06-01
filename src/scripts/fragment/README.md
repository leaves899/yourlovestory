# 碎片日记模块

本模块是碎片日记系统的核心实现，提供碎片的创建、管理、状态机、Prompt 生成等功能。

## 模块结构

```
src/scripts/fragment/
├── __init__.py          # 模块入口，导出所有公共接口
├── models.py            # 数据模型（Fragment、FragmentDay、枚举）
├── utils.py             # 工具函数（ID 生成、时间处理、验证）
├── state_machine.py     # 状态机（状态判断、权限检查、状态转换）
├── manager.py           # 碎片管理器（CRUD、整合、乐观锁）
├── prompt_generator.py  # Prompt 生成器（13种组合矩阵）
├── tag_recommender.py   # 标签推荐器（含降频策略）
├── blind_matcher.py     # Blind 模式匹配器（关键词+语义相似度）
└── README.md            # 本文件
```

## 主要功能

### 1. 数据模型 (`models.py`)

- **Fragment**: 碎片卡片数据结构，包含来源、情绪、内容等维度
- **FragmentDay**: 日期级别碎片数据，维护独立的碎片列表和状态信息
- **枚举类**: FragmentStatus、WritingMode、Origin、Mood、EditState

### 2. 状态机 (`state_machine.py`)

- **状态判断**: 根据日期和完成状态判断当前状态
- **权限检查**: 编辑、删除、整合、添加碎片的权限控制
- **状态转换**: 已完成、已过期状态的转换和撤销

### 3. 碎片管理器 (`manager.py`)

- **CRUD 操作**: 创建、读取、更新、删除碎片
- **日期级别操作**: 获取、完成、状态查询
- **碎片整合**: 单日整合、跨天整合
- **乐观锁机制**: 版本号校验，防止并发冲突
- **备份/回滚机制**: 重新生成叙事时的安全保护

### 4. Prompt 生成器 (`prompt_generator.py`)

- **完整 Prompt 矩阵**: 3来源 × 4情绪 + 跳过 = 13种组合
- **多碎片整合**: 来源合并、情绪处理、内容拼接
- **长度控制**: 超过 1000 字自动压缩

### 5. 标签推荐器 (`tag_recommender.py`)

- **标签推荐**: 环境标签、行为标签的智能推荐
- **降频策略**: 连续跳过 3 次 → 阈值提高到 70%
- **会话统计**: 单次碎片输入会话的统计

### 6. Blind 匹配器 (`blind_matcher.py`)

- **匹配回复**: 从 crush 角色档案中匹配相似内容
- **相似度计算**: 关键词匹配（30%权重）+ 语义相似度（70%权重）
- **阈值控制**: 默认 60%，可调整范围 50%-80%

## 使用示例

### 基本用法

```python
from src.scripts.fragment import (
    Fragment,
    FragmentDay,
    FragmentStateMachine,
    FragmentManager,
    FragmentPromptGenerator,
    TagRecommender,
    BlindMatcher,
)

# 创建碎片管理器
manager = FragmentManager()

# 记录碎片
fragment_data = {
    "origin": "crush",
    "mood": "positive",
    "content": "ta发了一个可爱的表情包",
    "writing_mode": "raw",
    "env_tags": ["工作"],
    "behavior_tags": [],
}

fragment, error = manager.record_fragment("example", fragment_data)
if fragment:
    print(f"记录成功: {fragment.id}")
else:
    print(f"记录失败: {error}")
```

### 状态机使用

```python
from src.scripts.fragment import FragmentStateMachine, EditState, FragmentStatus

# 获取状态
status = FragmentStateMachine.get_status("2026-05-30", False, "2026-05-30")
print(f"状态: {status}")

# 检查权限
can_edit = FragmentStateMachine.can_edit(EditState.EDITABLE)
print(f"可编辑: {can_edit}")

can_delete = FragmentStateMachine.can_delete(FragmentStatus.IN_PROGRESS, False)
print(f"可删除: {can_delete}")
```

### Prompt 生成

```python
from src.scripts.fragment import FragmentPromptGenerator, Fragment

generator = FragmentPromptGenerator()

fragment = Fragment(
    id="frag_20260530_143000_a1b2",
    date="2026-05-30",
    time="14:30",
    origin="crush",
    mood="positive",
    content="ta发了一个表情包",
    env_tags=["工作"],
    behavior_tags=[],
    custom_tags=["可爱"],
    writing_mode="raw",
    theme=None,
    crush_slug="example",
    created_at="2026-05-30T14:30:00",
    updated_at="2026-05-30T14:30:00"
)

prompt = generator.generate_single_fragment_prompt(fragment)
print(f"生成的 Prompt: {prompt}")
```

### 标签推荐

```python
from src.scripts.fragment import TagRecommender

recommender = TagRecommender()
session_id = "test_session_001"

content = "ta今天在公司发了一个可爱的表情包"
result = recommender.recommend(content, "example", session_id)
print(f"推荐结果: {result}")
```

### Blind 匹配

```python
from src.scripts.fragment import BlindMatcher

matcher = BlindMatcher("example")

user_input = "ta今天发了一个表情包，我不知道ta是什么意思"
results = matcher.match_replies(user_input, limit=3, threshold=0.5)
print(f"匹配结果: {results}")
```

## 测试

运行测试脚本：

```bash
cd D:\CLAUDECODE\yourcrush
python -m src.scripts.fragment.test_migration
```

## 迁移说明

本模块已从原始位置 `scripts/` 迁移到 `src/scripts/fragment/`，主要变更：

1. **目录结构**: 从扁平结构改为模块化结构
2. **导入路径**: 从绝对导入改为相对导入
3. **文件命名**: 更简洁的命名（如 `fragment_models.py` → `models.py`）
4. **模块化**: 统一的 `__init__.py` 导出所有公共接口

原始文件保留在 `scripts/` 目录，新代码应使用 `src/scripts/fragment/` 模块。

## 依赖关系

```
models.py (基础模型)
    ↑
utils.py (工具函数)
    ↑
state_machine.py (状态机)
    ↑
manager.py (管理器) ← prompt_generator.py (Prompt 生成)
    ↑
tag_recommender.py (标签推荐)
    ↑
blind_matcher.py (Blind 匹配)
```

## 注意事项

1. **向后兼容**: 原始文件仍保留，现有代码可继续使用
2. **新代码**: 建议使用新的模块路径 `src.scripts.fragment`
3. **测试**: 迁移后已通过功能测试，确保所有功能正常
4. **文档**: 本 README 提供完整的使用说明和示例
