#!/usr/bin/env python3
"""
fragment_models.py - 碎片日记数据模型

功能 / Functions:
    - Fragment: 碎片卡片数据结构
    - FragmentDay: 日期级别碎片数据
    - 状态枚举（FragmentStatus、WritingMode、Origin、Mood、EditState）
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional


class FragmentStatus(Enum):
    """碎片日期状态"""
    IN_PROGRESS = "in_progress"      # 进行中：碎片所属日期 = 当前日期
    UNFINISHED = "unfinished"        # 未完成（7天内）：可与新碎片整合
    EXPIRED = "expired"              # 已过期（超过7天）：只读归档
    COMPLETED = "completed"          # 已完成：不可编辑、不可删除


class WritingMode(Enum):
    """写作模式"""
    RAW = "raw"                      # 最自由，无引导
    GUIDED = "guided"                # 半结构化，提供方向引导
    THEMED = "themed"                # 主题限定
    BLIND = "blind"                  # 盲写模式


class Origin(Enum):
    """来源标签"""
    USER = "user"                    # 用户主动发起
    CRUSH = "crush"                  # 来自 crush
    AMBIENT = "ambient"              # 环境触发


class Mood(Enum):
    """情绪标签"""
    POSITIVE = "positive"            # 开心、期待、温暖
    NEGATIVE = "negative"            # 难过、失落、在意
    NEUTRAL = "neutral"              # 平静、日常、无特别
    MIXED = "mixed"                  # 复杂、矛盾、说不清


class EditState(Enum):
    """编辑状态"""
    EDITABLE = "editable"                    # 未触发写作：可自由编辑
    READONLY_REGENERABLE = "readonly_regenerable"  # 已触发但未确认：内容只读，仅可重新生成
    READONLY_FINAL = "readonly_final"        # 已完成：全部只读


@dataclass
class Fragment:
    """
    碎片卡片数据结构

    每个碎片包含来源、情绪、内容三个维度的信息
    """
    id: str                    # 格式：frag_{YYYYMMDD}_{HHMMSS}_{4位随机十六进制}
    date: str                  # 碎片日期（YYYY-MM-DD）
    time: Optional[str]        # 碎片时间（HH:MM），为空时使用当前时间
    origin: str                # 来源：user / crush / ambient
    mood: Optional[str]        # 情绪：positive / negative / neutral / mixed / None（跳过）
    content: str               # 碎片内容（5-500 字，Blind 模式 10-500 字）
    env_tags: List[str]        # 环境标签
    behavior_tags: List[str]   # 行为标签
    custom_tags: List[str]     # 用户自定义标签
    writing_mode: str          # 写作模式：raw / guided / themed / blind
    theme: Optional[str]       # themed 模式主题
    crush_slug: str            # 关联的 crush 角色标识
    created_at: str            # 创建时间（ISO 8601）
    updated_at: str            # 最后更新时间（ISO 8601）

    def to_dict(self) -> dict:
        """转换为字典（用于 JSON 序列化）"""
        return {
            "id": self.id,
            "date": self.date,
            "time": self.time,
            "origin": self.origin,
            "mood": self.mood,
            "content": self.content,
            "env_tags": self.env_tags,
            "behavior_tags": self.behavior_tags,
            "custom_tags": self.custom_tags,
            "writing_mode": self.writing_mode,
            "theme": self.theme,
            "crush_slug": self.crush_slug,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'Fragment':
        """从字典创建（用于 JSON 反序列化）"""
        return cls(
            id=data["id"],
            date=data["date"],
            time=data.get("time"),
            origin=data["origin"],
            mood=data.get("mood"),
            content=data.get("content", ""),
            env_tags=data.get("env_tags", []),
            behavior_tags=data.get("behavior_tags", []),
            custom_tags=data.get("custom_tags", []),
            writing_mode=data["writing_mode"],
            theme=data.get("theme"),
            crush_slug=data["crush_slug"],
            created_at=data["created_at"],
            updated_at=data["updated_at"]
        )


@dataclass
class FragmentDay:
    """
    日期级别碎片数据

    每个日期维护独立的碎片列表和状态信息
    """
    date: str                  # 日期（YYYY-MM-DD）
    crush_slug: str            # 关联的 crush 角色标识
    fragments: List[Fragment]  # 碎片列表
    completed: bool            # 日期级别属性：该日期的写作是否已完成
    direction: Optional[str]   # guided 模式方向（日期级别属性，当日所有 guided 碎片共享）
    writing_context: Optional[str]  # 写作上下文（day 模块生成的叙事内容）
    version: int               # 乐观锁版本号（用于并发控制）
    integration_date: Optional[str]  # 跨天整合的物理日期（用于撤销判断）
    created_at: str            # 创建时间
    updated_at: str            # 最后更新时间

    def to_dict(self) -> dict:
        """转换为字典（用于 JSON 序列化）"""
        return {
            "date": self.date,
            "crush_slug": self.crush_slug,
            "fragments": [f.to_dict() for f in self.fragments],
            "completed": self.completed,
            "direction": self.direction,
            "writing_context": self.writing_context,
            "version": self.version,
            "integration_date": self.integration_date,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }

    @classmethod
    def from_dict(cls, data: dict) -> 'FragmentDay':
        """从字典创建（用于 JSON 反序列化）"""
        return cls(
            date=data["date"],
            crush_slug=data["crush_slug"],
            fragments=[Fragment.from_dict(f) for f in data.get("fragments", [])],
            completed=data.get("completed", False),
            direction=data.get("direction"),
            writing_context=data.get("writing_context"),
            version=data.get("version", 1),
            integration_date=data.get("integration_date"),
            created_at=data["created_at"],
            updated_at=data["updated_at"]
        )

    def get_fragment_count(self) -> int:
        """获取碎片数量"""
        return len(self.fragments)

    def get_non_empty_fragments(self) -> List[Fragment]:
        """获取有内容的碎片"""
        return [f for f in self.fragments if f.content and f.content.strip()]

    def has_content(self) -> bool:
        """是否有有内容的碎片"""
        return len(self.get_non_empty_fragments()) > 0


# 常量定义 / Constants

# 来源显示文本
ORIGIN_DISPLAY = {
    "user": "用户",
    "crush": "Crush",
    "ambient": "环境"
}

# 情绪 Emoji 映射
MOOD_EMOJI = {
    "positive": "😊",
    "negative": "😢",
    "neutral": "😐",
    "mixed": "😶",
    None: "⬜"
}

# 情绪显示文本
MOOD_DISPLAY = {
    "positive": "开心",
    "negative": "在意",
    "neutral": "平静",
    "mixed": "复杂",
    None: "未选择"
}

# 写作模式显示文本
WRITING_MODE_DISPLAY = {
    "raw": "Raw",
    "guided": "Guided",
    "themed": "Themed",
    "blind": "Blind"
}

# Guided 模式方向选项
DIRECTION_OPTIONS = [
    {"id": "casual", "name": "轻松的", "description": "记录一些日常小事"},
    {"id": "concerned", "name": "有些在意的", "description": "说说那些让你在意的事"},
    {"id": "deep", "name": "想深入的", "description": "展开聊聊这个话题"}
]

# Themed 模式主题选项
THEME_OPTIONS = [
    {"id": "work_study", "name": "工作/学习", "description": "与工作、学习相关的互动"},
    {"id": "daily_life", "name": "生活日常", "description": "日常生活中的小事"},
    {"id": "date_outing", "name": "约会/出行", "description": "约会、外出相关的场景"},
    {"id": "emotional", "name": "情感交流", "description": "深入的情感对话"},
    {"id": "hobby", "name": "兴趣爱好", "description": "与兴趣、爱好相关"},
    {"id": "holiday", "name": "节日/纪念日", "description": "节日、纪念日相关"},
    {"id": "conflict", "name": "争吵/误会", "description": "冲突、误会相关"},
    {"id": "reconcile", "name": "和好/道歉", "description": "和好、道歉相关"}
]

# 方向→情绪推荐映射
DIRECTION_MOOD_MAP = {
    "轻松的": "positive",
    "有些在意的": "negative",
    "想深入的": "mixed"
}


if __name__ == "__main__":
    # 测试数据模型
    print("=== 数据模型测试 ===")

    # 测试 Fragment 创建
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
        writing_mode="guided",
        theme=None,
        crush_slug="example",
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )
    print(f"Fragment: {fragment}")
    print(f"Fragment dict: {fragment.to_dict()}")

    # 测试 FragmentDay 创建
    day = FragmentDay(
        date="2026-05-30",
        crush_slug="example",
        fragments=[fragment],
        completed=False,
        direction="轻松的",
        writing_context=None,
        version=1,
        integration_date=None,
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )
    print(f"\nFragmentDay: {day}")
    print(f"FragmentDay dict: {day.to_dict()}")
    print(f"Fragment count: {day.get_fragment_count()}")
    print(f"Has content: {day.has_content()}")

    # 测试枚举
    print(f"\n状态枚举: {FragmentStatus.IN_PROGRESS.value}")
    print(f"写作模式: {WritingMode.GUIDED.value}")
    print(f"来源: {Origin.USER.value}")
    print(f"情绪: {Mood.POSITIVE.value}")
    print(f"编辑状态: {EditState.EDITABLE.value}")

    # 测试序列化/反序列化
    day_dict = day.to_dict()
    day_restored = FragmentDay.from_dict(day_dict)
    print(f"\n反序列化测试: {day_restored.date}")
    print(f"反序列化后方向: {day_restored.direction}")

    print("\n=== 测试完成 ===")
