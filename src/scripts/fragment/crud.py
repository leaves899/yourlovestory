#!/usr/bin/env python3
"""
crud.py - 碎片 CRUD 模块

功能 / Functions:
    - 碎片创建、读取、更新、删除
    - 内容验证
"""

from typing import List, Optional, Tuple

from .models import EditState, Fragment, FragmentDay, FragmentStatus
from .state_machine import FragmentStateMachine
from .storage import FragmentStorage
from .utils import (
    MAX_FRAGMENTS_PER_DAY,
    generate_fragment_id,
    get_current_date,
    get_current_datetime,
    get_current_time,
    validate_content,
)


class FragmentCRUD:
    """
    碎片 CRUD 模块

    职责：
    - 碎片创建、读取、更新、删除
    - 内容验证
    """

    def __init__(self, storage: FragmentStorage):
        """
        初始化 CRUD 模块

        Args:
            storage: 存储模块
        """
        self.storage = storage

    def record_fragment(
        self,
        crush_slug: str,
        fragment_data: dict,
        current_date: Optional[str] = None,
        day: Optional[FragmentDay] = None,
    ) -> Tuple[Optional[Fragment], str]:
        """
        记录用户输入的碎片

        Args:
            crush_slug: crush 角色标识
            fragment_data: 碎片数据
            current_date: 当前日期（YYYY-MM-DD），为空时使用今天
            day: 日期级别数据（可选，避免重复读取）

        Returns:
            Tuple[Optional[Fragment], str]: (碎片对象, 错误信息)

        验证规则：
        - Raw/Guided/Themed：内容 5-500 字（空内容允许，但计入上限）
        - Blind：内容 10-500 字（最低 10 字确保匹配效果）
        - 纯表情/符号：提示"请补充文字描述"
        - 单日上限 10 个碎片（空内容也计入）
        """
        if current_date is None:
            current_date = get_current_date()

        # 获取或创建日期数据
        if day is None:
            day = self.storage.load_fragment_day(crush_slug, current_date)

        # 检查是否可添加碎片
        status = FragmentStateMachine.get_status(current_date, day.completed, current_date)
        if not FragmentStateMachine.can_add_fragment(status):
            return None, "该日期已完成写作，无法添加新碎片"

        # 检查碎片数量上限
        if day.get_fragment_count() >= MAX_FRAGMENTS_PER_DAY:
            return None, f"今天的碎片已达上限（{MAX_FRAGMENTS_PER_DAY}个），建议先完成写作"

        # 验证内容
        writing_mode = fragment_data.get("writing_mode", "raw")
        content = fragment_data.get("content", "")
        is_valid, error_msg = validate_content(content, writing_mode)
        if not is_valid:
            return None, error_msg

        # 生成碎片 ID
        date = fragment_data.get("date", current_date)
        time = fragment_data.get("time")
        fragment_id = generate_fragment_id(date, time)

        # 创建碎片对象
        now = get_current_datetime()
        fragment = Fragment(
            id=fragment_id,
            date=date,
            time=time or get_current_time(),
            origin=fragment_data.get("origin", "user"),
            mood=fragment_data.get("mood"),
            content=content,
            env_tags=fragment_data.get("env_tags", []),
            behavior_tags=fragment_data.get("behavior_tags", []),
            custom_tags=fragment_data.get("custom_tags", []),
            writing_mode=writing_mode,
            theme=fragment_data.get("theme"),
            crush_slug=crush_slug,
            created_at=now,
            updated_at=now,
        )

        # 添加到日期数据
        day.fragments.append(fragment)
        day.updated_at = now
        day.version += 1

        # 保存
        success, error = self.storage.save_fragment_day(day)
        if not success:
            # 回滚版本号
            day.fragments.pop()
            day.version -= 1
            return None, error

        return fragment, ""

    def update_fragment(
        self,
        fragment_id: str,
        updates: dict,
        expected_version: int,
        fragment: Optional[Fragment] = None,
        day: Optional[FragmentDay] = None,
    ) -> Tuple[Optional[Fragment], str]:
        """
        更新碎片内容

        Args:
            fragment_id: 碎片 ID
            updates: 更新数据
            expected_version: 期望的版本号（乐观锁）
            fragment: 碎片对象（可选，避免重复查找）
            day: 日期级别数据（可选，避免重复查找）

        Returns:
            Tuple[Optional[Fragment], str]: (碎片对象, 错误信息)

        乐观锁机制：
        - 传入 expected_version（客户端读取时的版本号）
        - 写入前校验 expected_version == current_version
        - 版本冲突则提示"碎片已被其他客户端修改"
        - 写入成功后 version + 1
        """
        # 查找碎片
        if fragment is None or day is None:
            fragment, day = self.storage.find_fragment(fragment_id)
        if fragment is None:
            return None, "碎片不存在或已被删除"

        # 检查编辑状态
        edit_state = FragmentStateMachine.get_edit_state(day.completed, day.writing_context)
        if not FragmentStateMachine.can_edit(edit_state):
            if edit_state == EditState.READONLY_FINAL:
                return None, "该日期已完成写作，碎片不可编辑"
            elif edit_state == EditState.READONLY_REGENERABLE:
                return None, "已触发写作，碎片内容只读，仅可重新生成叙事"

        # 乐观锁校验
        if expected_version != day.version:
            return None, "碎片已被其他客户端修改，请重新加载"

        # 可修改字段白名单
        UPDATABLE_FIELDS = {"content", "origin", "mood", "env_tags", "behavior_tags", "writing_mode"}
        invalid_fields = set(updates.keys()) - UPDATABLE_FIELDS
        if invalid_fields:
            return None, f"不允许修改字段: {', '.join(invalid_fields)}"

        # 验证内容（如果更新了内容）
        if "content" in updates:
            writing_mode = updates.get("writing_mode", fragment.writing_mode)
            is_valid, error_msg = validate_content(updates["content"], writing_mode)
            if not is_valid:
                return None, error_msg

        # 保存旧值用于回滚
        old_values = {}
        for key in updates:
            if hasattr(fragment, key):
                old_values[key] = getattr(fragment, key)

        # 更新碎片
        for key, value in updates.items():
            if hasattr(fragment, key):
                setattr(fragment, key, value)

        fragment.updated_at = get_current_datetime()

        # 更新日期数据
        day.updated_at = get_current_datetime()
        day.version += 1

        # 保存
        success, error = self.storage.save_fragment_day(day)
        if not success:
            # 回滚
            for key, value in old_values.items():
                setattr(fragment, key, value)
            day.version -= 1
            return None, error

        return fragment, ""

    def delete_fragment(
        self,
        fragment_id: str,
        expected_version: int,
        fragment: Optional[Fragment] = None,
        day: Optional[FragmentDay] = None,
    ) -> Tuple[bool, str]:
        """
        删除碎片（需二次确认）

        Args:
            fragment_id: 碎片 ID
            expected_version: 期望的版本号（乐观锁）
            fragment: 碎片对象（可选，避免重复查找）
            day: 日期级别数据（可选，避免重复查找）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        删除权限优先级：
        1. 已完成状态（completed=true）→ 不可删除（无论是否超过 7 天）
        2. 已过期/超过 7 天（completed=false 且 >7天）→ 可删除（需二次确认）
        3. 其他状态（进行中/未完成）→ 可删除（需二次确认）
        """
        # 查找碎片
        if fragment is None or day is None:
            fragment, day = self.storage.find_fragment(fragment_id)
        if fragment is None:
            return False, "碎片不存在或已被删除"

        # 检查删除权限
        status = FragmentStateMachine.get_status(day.date, day.completed)
        if not FragmentStateMachine.can_delete(status, day.completed):
            return False, "该日期已完成写作，碎片不可删除"

        # 乐观锁校验
        if expected_version != day.version:
            return False, "碎片已被其他客户端修改，请重新加载"

        # 保存引用以便回滚
        original_fragment = fragment

        # 删除碎片
        day.fragments = [f for f in day.fragments if f.id != fragment_id]
        day.updated_at = get_current_datetime()
        day.version += 1

        # 保存
        success, error = self.storage.save_fragment_day(day)
        if not success:
            # 完整回滚
            day.fragments.append(original_fragment)
            day.version -= 1
            return False, error

        return True, ""

    def get_fragment(self, fragment_id: str) -> Optional[Fragment]:
        """
        获取单个碎片

        Args:
            fragment_id: 碎片 ID

        Returns:
            Optional[Fragment]: 碎片对象
        """
        fragment, _ = self.storage.find_fragment(fragment_id)
        return fragment

    def get_fragments_by_date(
        self, crush_slug: str, date: str, day: Optional[FragmentDay] = None
    ) -> List[Fragment]:
        """
        获取指定日期的所有碎片

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）
            day: 日期级别数据（可选，避免重复读取）

        Returns:
            List[Fragment]: 碎片列表
        """
        if day is None:
            day = self.storage.load_fragment_day(crush_slug, date)
        return day.fragments
