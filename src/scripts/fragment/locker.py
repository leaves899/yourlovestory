#!/usr/bin/env python3
"""
locker.py - 乐观锁与状态查询模块

功能 / Functions:
    - 日期级别操作（获取、完成、状态查询）
    - 乐观锁校验
"""

from typing import Optional, Tuple

from .models import EditState, FragmentDay, FragmentStatus
from .state_machine import FragmentStateMachine
from .storage import FragmentStorage
from .utils import get_current_date


class FragmentLocker:
    """
    乐观锁与状态查询模块

    职责：
    - 日期级别操作（获取、完成、状态查询）
    - 乐观锁校验
    """

    def __init__(self, storage: FragmentStorage):
        """
        初始化乐观锁模块

        Args:
            storage: 存储模块
        """
        self.storage = storage

    def get_fragment_day(self, crush_slug: str, date: str) -> FragmentDay:
        """
        获取日期级别碎片数据

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            FragmentDay: 日期级别数据
        """
        return self.storage.load_fragment_day(crush_slug, date)

    def complete_day(
        self,
        crush_slug: str,
        date: str,
        writing_context: str,
        expected_version: int,
        integration_date: Optional[str] = None,
        day: Optional[FragmentDay] = None,
    ) -> Tuple[bool, str]:
        """
        标记日期为已完成

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）
            writing_context: 写作上下文
            expected_version: 期望的版本号（乐观锁）
            integration_date: 跨天整合的物理日期（用于撤销判断）
            day: 日期级别数据（可选，避免重复读取）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        流程：
        1. 校验版本号（乐观锁）
        2. 设置 completed=true
        3. 填充 writing_context
        4. version + 1
        """
        if day is None:
            day = self.storage.load_fragment_day(crush_slug, date)

        # 乐观锁校验
        if expected_version != day.version:
            return False, "数据已被其他客户端修改，请重新加载"

        # 检查是否有有效内容
        if not day.has_content():
            return False, "所有碎片均为空内容，无法生成叙事"

        # 转换为已完成状态
        day = FragmentStateMachine.transition_to_completed(day, writing_context, get_current_date())
        day.integration_date = integration_date

        # 保存
        success, error = self.storage.save_fragment_day(day)
        if not success:
            return False, error

        return True, ""

    def get_status(self, crush_slug: str, date: str) -> FragmentStatus:
        """
        获取日期状态

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            FragmentStatus: 状态
        """
        day = self.storage.load_fragment_day(crush_slug, date)
        return FragmentStateMachine.get_status(date, day.completed)

    def get_edit_state(self, crush_slug: str, date: str) -> EditState:
        """
        获取编辑状态

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            EditState: 编辑状态
        """
        day = self.storage.load_fragment_day(crush_slug, date)
        return FragmentStateMachine.get_edit_state(day.completed, day.writing_context)
