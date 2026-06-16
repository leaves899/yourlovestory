#!/usr/bin/env python3
"""
storage.py - 碎片存储模块

功能 / Functions:
    - 文件系统操作（读写 JSON）
    - 碎片查找（遍历目录）
    - 目录管理
"""

import json
from pathlib import Path
from typing import Optional, Tuple

from .models import Fragment, FragmentDay
from .utils import ensure_fragment_dir, get_fragment_date_dir


class FragmentStorage:
    """
    碎片存储模块

    职责：
    - 文件系统操作（读写 JSON）
    - 碎片查找（遍历目录）
    - 目录管理
    """

    def __init__(self, base_dir: Path):
        """
        初始化存储模块

        Args:
            base_dir: 项目根目录
        """
        self.base_dir = base_dir

    def load_fragment_day(self, crush_slug: str, date: str) -> FragmentDay:
        """
        加载日期级别碎片数据

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            FragmentDay: 日期级别数据
        """
        file_path = get_fragment_date_dir(self.base_dir, crush_slug, date)

        if file_path.exists():
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return FragmentDay.from_dict(data)
            except (json.JSONDecodeError, IOError):
                pass

        # 创建新的日期数据
        from .utils import get_current_datetime
        now = get_current_datetime()
        return FragmentDay(
            date=date,
            crush_slug=crush_slug,
            fragments=[],
            completed=False,
            direction=None,
            writing_context=None,
            version=1,
            integration_date=None,
            created_at=now,
            updated_at=now
        )

    def save_fragment_day(self, day: FragmentDay) -> Tuple[bool, str]:
        """
        保存日期级别碎片数据

        Args:
            day: 日期级别数据

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)
        """
        file_path = get_fragment_date_dir(self.base_dir, day.crush_slug, day.date)

        # 确保目录存在
        ensure_fragment_dir(self.base_dir, day.crush_slug)

        # 保存
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(day.to_dict(), f, ensure_ascii=False, indent=2)
            return True, ""
        except (IOError, OSError) as e:
            return False, f"保存碎片数据失败: {e}"

    def find_fragment(self, fragment_id: str) -> Tuple[Optional[Fragment], Optional[FragmentDay]]:
        """
        查找碎片

        Args:
            fragment_id: 碎片 ID

        Returns:
            Tuple[Optional[Fragment], Optional[FragmentDay]]: (碎片, 日期数据)
        """
        # 从 ID 中提取日期
        # ID 格式：frag_{YYYYMMDD}_{HHMMSS}_{4位随机}
        parts = fragment_id.split("_")
        if len(parts) < 4:
            return None, None

        date_str = parts[1]
        if len(date_str) == 8:
            date = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        else:
            return None, None

        # 从 ID 中提取 crush_slug（需要遍历所有 crush）
        crushes_dir = self.base_dir / "crushes"
        if not crushes_dir.exists():
            return None, None

        for crush_dir in crushes_dir.iterdir():
            if crush_dir.is_dir():
                crush_slug = crush_dir.name
                day = self.load_fragment_day(crush_slug, date)
                for fragment in day.fragments:
                    if fragment.id == fragment_id:
                        return fragment, day

        return None, None
