#!/usr/bin/env python3
"""
fragment_utils.py - 碎片日记工具函数

功能 / Functions:
    - ID 生成（frag_{YYYYMMDD}_{HHMMSS}_{4位随机十六进制}）
    - 时间处理（当前时间、日期判断）
    - 内容验证（长度、纯表情检测）
    - 文件路径处理
"""

import hashlib
import os
import random
import re
import string
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple


# 常量 / Constants
FRAGMENT_ID_PREFIX = "frag_"
FRAGMENT_ID_RANDOM_LENGTH = 4  # 4位随机十六进制

# 内容长度限制 / Content length limits
MIN_CONTENT_LENGTH_DEFAULT = 5   # Raw/Guided/Themed 最小长度
MIN_CONTENT_LENGTH_BLIND = 10    # Blind 模式最小长度
MAX_CONTENT_LENGTH = 500         # 最大长度

# 碎片数量限制 / Fragment count limits
MAX_FRAGMENTS_PER_DAY = 10       # 单日上限

# 归档天数 / Archive days
ARCHIVE_DAYS = 7                 # 7天归档限制
RETROACTIVE_DAYS = 30            # 30天补录范围

# 纯表情/符号正则 / Emoji/symbol regex (standard ranges)
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # flags (iOS)
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed characters
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "]+",
    flags=re.UNICODE
)


def generate_fragment_id(date: str, time: Optional[str] = None) -> str:
    """
    生成碎片唯一标识

    格式：frag_{YYYYMMDD}_{HHMMSS}_{4位随机十六进制}

    Args:
        date: 碎片日期（YYYY-MM-DD）
        time: 碎片时间（HH:MM），为空时使用当前时间

    Returns:
        str: 碎片 ID

    示例:
        >>> generate_fragment_id("2026-05-30", "14:30")
        'frag_20260530_143000_a1b2'
    """
    # 解析日期
    date_obj = datetime.strptime(date, "%Y-%m-%d")
    date_str = date_obj.strftime("%Y%m%d")

    # 解析时间
    if time:
        time_obj = datetime.strptime(time, "%H:%M")
        time_str = time_obj.strftime("%H%M%S")
    else:
        time_str = datetime.now().strftime("%H%M%S")

    # 生成 4 位随机十六进制
    random_hex = ''.join(random.choices(string.hexdigits[:16], k=FRAGMENT_ID_RANDOM_LENGTH))

    return f"{FRAGMENT_ID_PREFIX}{date_str}_{time_str}_{random_hex}"


def get_current_datetime() -> str:
    """
    获取当前时间（ISO 8601 格式）

    Returns:
        str: 当前时间字符串

    示例:
        >>> get_current_datetime()
        '2026-05-30T14:30:00'
    """
    return datetime.now().isoformat(timespec='seconds')


def get_current_date() -> str:
    """
    获取当前日期

    Returns:
        str: 当前日期字符串（YYYY-MM-DD）

    示例:
        >>> get_current_date()
        '2026-05-30'
    """
    return datetime.now().strftime("%Y-%m-%d")


def get_current_time() -> str:
    """
    获取当前时间

    Returns:
        str: 当前时间字符串（HH:MM）

    示例:
        >>> get_current_time()
        '14:30'
    """
    return datetime.now().strftime("%H:%M")


def parse_date(date_str: str) -> datetime:
    """
    解析日期字符串

    Args:
        date_str: 日期字符串（YYYY-MM-DD）

    Returns:
        datetime: 日期对象
    """
    return datetime.strptime(date_str, "%Y-%m-%d")


def parse_time(time_str: str) -> datetime:
    """
    解析时间字符串

    Args:
        time_str: 时间字符串（HH:MM）

    Returns:
        datetime: 时间对象
    """
    return datetime.strptime(time_str, "%H:%M")


def calculate_days_between(date1: str, date2: str) -> int:
    """
    计算两个日期之间的天数

    Args:
        date1: 日期1（YYYY-MM-DD）
        date2: 日期2（YYYY-MM-DD）

    Returns:
        int: 天数差（date2 - date1）

    示例:
        >>> calculate_days_between("2026-05-25", "2026-05-30")
        5
    """
    d1 = parse_date(date1)
    d2 = parse_date(date2)
    return (d2 - d1).days


def is_expired(date: str, current_date: Optional[str] = None) -> bool:
    """
    判断碎片是否已过期（超过 7 天）

    Args:
        date: 碎片日期（YYYY-MM-DD）
        current_date: 当前日期（YYYY-MM-DD），为空时使用今天

    Returns:
        bool: 是否已过期

    规则:
        当前日期 - 碎片所属日期 > 7 天（严格大于，第 7 天仍可操作，第 8 天起归档）
    """
    if current_date is None:
        current_date = get_current_date()

    days = calculate_days_between(date, current_date)
    return days > ARCHIVE_DAYS


def is_today(date: str, current_date: Optional[str] = None) -> bool:
    """
    判断是否是今天

    Args:
        date: 日期（YYYY-MM-DD）
        current_date: 当前日期（YYYY-MM-DD），为空时使用今天

    Returns:
        bool: 是否是今天
    """
    if current_date is None:
        current_date = get_current_date()

    return date == current_date


def is_within_retroactive_range(date: str, current_date: Optional[str] = None) -> bool:
    """
    判断是否在补录范围内（30 天内）

    Args:
        date: 目标日期（YYYY-MM-DD）
        current_date: 当前日期（YYYY-MM-DD），为空时使用今天

    Returns:
        bool: 是否在补录范围内
    """
    if current_date is None:
        current_date = get_current_date()

    days = calculate_days_between(date, current_date)
    return 0 <= days <= RETROACTIVE_DAYS


def validate_content(content: str, writing_mode: str) -> Tuple[bool, str]:
    """
    验证碎片内容

    Args:
        content: 碎片内容
        writing_mode: 写作模式（raw/guided/themed/blind）

    Returns:
        Tuple[bool, str]: (是否有效, 错误信息/提示信息)

    规则:
        - Raw/Guided/Themed：5-500 字（空内容允许，会提示）
        - Blind：10-500 字（最低 10 字）
        - 纯表情/符号：返回 False
    """
    # 校验 writing_mode 参数
    valid_modes = {"raw", "guided", "themed", "blind"}
    if writing_mode not in valid_modes:
        return False, f"无效的写作模式: {writing_mode}，有效值: {valid_modes}"

    # 空内容允许（会提示建议补充）
    if not content or content.strip() == "":
        return True, "建议补充一些描述，让叙事更丰富"

    # 纯表情/符号检测
    if is_emoji_only(content):
        return False, "请补充文字描述，表情符号无法单独生成叙事"

    # 长度检查
    content_length = len(content.strip())

    if writing_mode == "blind":
        if content_length < MIN_CONTENT_LENGTH_BLIND:
            return False, f"盲写模式至少需要 {MIN_CONTENT_LENGTH_BLIND} 字"
    else:
        # Raw/Guided/Themed
        if content_length < MIN_CONTENT_LENGTH_DEFAULT:
            return False, f"内容太短，请补充描述（至少 {MIN_CONTENT_LENGTH_DEFAULT} 字）"

    if content_length > MAX_CONTENT_LENGTH:
        return False, f"内容过长，请精简到 {MAX_CONTENT_LENGTH} 字以内"

    return True, ""


def is_emoji_only(content: str) -> bool:
    """
    判断是否只有表情/符号

    Args:
        content: 内容

    Returns:
        bool: 是否只有表情/符号
    """
    if not content:
        return False

    import unicodedata

    # 检查每个字符
    has_text = False
    for char in content:
        category = unicodedata.category(char)
        # 如果有字母或数字字符，则不是纯表情
        if category.startswith('L') or category.startswith('N'):
            has_text = True
            break

    return not has_text


def get_fragment_date_dir(base_dir: Path, crush_slug: str, date: str) -> Path:
    """
    获取碎片日期文件路径

    Args:
        base_dir: 项目根目录
        crush_slug: crush 角色标识
        date: 日期（YYYY-MM-DD）

    Returns:
        Path: 碎片日期文件路径
    """
    return base_dir / "crushes" / crush_slug / "fragments" / f"{date}.json"


def ensure_fragment_dir(base_dir: Path, crush_slug: str) -> Path:
    """
    确保碎片目录存在

    Args:
        base_dir: 项目根目录
        crush_slug: crush 角色标识

    Returns:
        Path: 碎片目录路径
    """
    fragment_dir = base_dir / "crushes" / crush_slug / "fragments"
    fragment_dir.mkdir(parents=True, exist_ok=True)
    return fragment_dir


def format_fragment_summary(content: str, max_length: int = 50) -> str:
    """
    格式化碎片内容摘要

    Args:
        content: 碎片内容
        max_length: 最大长度

    Returns:
        str: 摘要内容
    """
    if not content:
        return "（空内容）"

    if len(content) <= max_length:
        return content

    return content[:max_length] + "..."


def get_origin_display(origin: str) -> str:
    """
    获取来源显示文本

    Args:
        origin: 来源标识（user/crush/ambient）

    Returns:
        str: 显示文本
    """
    origin_map = {
        "user": "用户",
        "crush": "Crush",
        "ambient": "环境"
    }
    return origin_map.get(origin, origin)


def get_mood_emoji(mood: Optional[str]) -> str:
    """
    获取情绪 Emoji

    Args:
        mood: 情绪标识（positive/negative/neutral/mixed/None）

    Returns:
        str: Emoji
    """
    mood_emoji_map = {
        "positive": "😊",
        "negative": "😢",
        "neutral": "😐",
        "mixed": "😶",
        None: "⬜"
    }
    return mood_emoji_map.get(mood, "⬜")


def get_mood_display(mood: Optional[str]) -> str:
    """
    获取情绪显示文本

    Args:
        mood: 情绪标识

    Returns:
        str: 显示文本
    """
    mood_display_map = {
        "positive": "开心",
        "negative": "在意",
        "neutral": "平静",
        "mixed": "复杂",
        None: "未选择"
    }
    return mood_display_map.get(mood, "未选择")


def get_writing_mode_display(mode: str) -> str:
    """
    获取写作模式显示文本

    Args:
        mode: 写作模式

    Returns:
        str: 显示文本
    """
    mode_display_map = {
        "raw": "Raw",
        "guided": "Guided",
        "themed": "Themed",
        "blind": "Blind"
    }
    return mode_display_map.get(mode, mode)


def sort_fragments_by_time(fragments: list) -> list:
    """
    按时间排序碎片

    Args:
        fragments: 碎片列表

    Returns:
        list: 排序后的碎片列表
    """
    def parse_time(t):
        try:
            return datetime.strptime(t, "%H:%M")
        except (TypeError, ValueError):
            return datetime.strptime("00:00", "%H:%M")

    return sorted(fragments, key=lambda f: parse_time(f.get("time", "00:00")))


if __name__ == "__main__":
    # 测试工具函数
    print("=== 碎片工具函数测试 ===")

    # 测试 ID 生成
    test_id = generate_fragment_id("2026-05-30", "14:30")
    print(f"生成 ID: {test_id}")
    assert test_id.startswith("frag_20260530_143000_")

    # 测试时间函数
    print(f"当前日期: {get_current_date()}")
    print(f"当前时间: {get_current_time()}")
    print(f"当前日期时间: {get_current_datetime()}")

    # 测试日期判断
    print(f"是否过期（2026-05-25）: {is_expired('2026-05-25')}")
    print(f"是否今天: {is_today(get_current_date())}")

    # 测试内容验证
    print(f"内容验证（空内容）: {validate_content('', 'raw')}")
    print(f"内容验证（3字）: {validate_content('你好', 'raw')}")
    print(f"内容验证（正常）: {validate_content('今天天气真好', 'raw')}")
    print(f"内容验证（Blind 5字）: {validate_content('今天天气', 'blind')}")
    print(f"内容验证（纯表情）: {validate_content('😊😊😊', 'raw')}")

    # 测试 Emoji 检测
    print(f"纯表情检测（😊）: {is_emoji_only('😊')}")
    print(f"纯表情检测（你好😊）: {is_emoji_only('你好😊')}")

    # 测试情绪 Emoji
    print(f"情绪 Emoji（positive）: {get_mood_emoji('positive')}")
    print(f"情绪 Emoji（None）: {get_mood_emoji(None)}")

    print("\n=== 测试完成 ===")
