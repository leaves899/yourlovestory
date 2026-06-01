"""
日期工具函数
"""

from datetime import datetime, timedelta
from typing import Optional


def get_current_date() -> str:
    """
    获取当前日期

    Returns:
        str: 当前日期（YYYY-MM-DD 格式）
    """
    return datetime.now().strftime('%Y-%m-%d')


def get_current_datetime() -> str:
    """
    获取当前日期时间

    Returns:
        str: 当前日期时间（ISO 格式）
    """
    return datetime.now().isoformat()


def parse_date(date_str: str) -> Optional[datetime]:
    """
    解析日期字符串

    Args:
        date_str: 日期字符串

    Returns:
        datetime: 解析后的日期
    """
    try:
        return datetime.fromisoformat(date_str)
    except Exception:
        return None


def format_date(date: datetime, format_str: str = '%Y-%m-%d') -> str:
    """
    格式化日期

    Args:
        date: 日期对象
        format_str: 格式化字符串

    Returns:
        str: 格式化后的日期
    """
    return date.strftime(format_str)


def get_relative_date(days: int) -> str:
    """
    获取相对日期

    Args:
        days: 天数（正数为未来，负数为过去）

    Returns:
        str: 相对日期（YYYY-MM-DD 格式）
    """
    target_date = datetime.now() + timedelta(days=days)
    return target_date.strftime('%Y-%m-%d')
