#!/usr/bin/env python3
"""
backup.py - 备份/回滚与撤销模块

功能 / Functions:
    - 补录历史碎片
    - 撤销跨天整合
"""

from typing import List, Optional, Tuple

from .crud import FragmentCRUD
from .models import Fragment, FragmentDay
from .state_machine import FragmentStateMachine
from .storage import FragmentStorage
from .utils import (
    MAX_FRAGMENTS_PER_DAY,
    get_current_date,
    is_expired,
    is_within_retroactive_range,
)


class FragmentBackup:
    """
    备份/回滚与撤销模块

    职责：
    - 补录历史碎片
    - 撤销跨天整合
    """

    def __init__(self, storage: FragmentStorage, crud: FragmentCRUD):
        """
        初始化备份模块

        Args:
            storage: 存储模块
            crud: CRUD 模块
        """
        self.storage = storage
        self.crud = crud

    def retroactively_record(
        self, crush_slug: str, date: str, fragment_data: dict
    ) -> Tuple[Optional[Fragment], str]:
        """
        补录历史碎片

        Args:
            crush_slug: crush 角色标识
            date: 目标日期（YYYY-MM-DD）
            fragment_data: 碎片数据

        Returns:
            Tuple[Optional[Fragment], str]: (碎片对象, 错误信息)

        direction 处理规则：
        - 补录 guided 模式碎片时，direction 使用补录当日的方向（日期级别属性）
        - 若补录当日未选择方向，系统提示用户先选择方向

        归档规则：
        - 归档时间 = 原始日期 + 7 天（非补录日期）
        - 若当前日期 - 原始日期 > 7 天，不允许补录
        """
        current_date = get_current_date()

        # 检查是否在补录范围内
        if not is_within_retroactive_range(date, current_date):
            return None, "只能补录最近 30 天的碎片"

        # 检查是否已过期
        if is_expired(date, current_date):
            return None, "该日期碎片已归档，无法补录"

        # 检查是否可添加碎片
        day = self.storage.load_fragment_day(crush_slug, date)
        status = FragmentStateMachine.get_status(date, day.completed, current_date)
        if not FragmentStateMachine.can_add_fragment(status):
            return None, "该日期已完成写作，无法补录碎片"

        # 检查碎片数量上限
        if day.get_fragment_count() >= MAX_FRAGMENTS_PER_DAY:
            return None, f"该日期碎片已达上限（{MAX_FRAGMENTS_PER_DAY}个），无法补录"

        # 处理 direction（guided 模式）
        if fragment_data.get("writing_mode") == "guided":
            if not day.direction:
                # 补录当日未选择方向，提示用户先选择
                return None, "请先选择今日方向（轻松的/有些在意的/想深入的）"
            fragment_data["direction"] = day.direction

        # 记录碎片
        fragment_data["date"] = date
        return self.crud.record_fragment(crush_slug, fragment_data, date, day=day)

    def undo_cross_day_integration(
        self, crush_slug: str, dates: List[str]
    ) -> Tuple[bool, str]:
        """
        撤销跨天整合（仅限当日内）

        Args:
            crush_slug: crush 角色标识
            dates: 日期列表

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        规则：
        1. 检查 integration_date 是否为物理日期（今天）
        2. 撤销后，参与的日期重置为 completed=false
        3. writing_context 清空
        4. 跨天后不可撤销（已完成状态不可逆）
        """
        current_date = get_current_date()

        for date in dates:
            day = self.storage.load_fragment_day(crush_slug, date)

            # 检查是否可撤销
            if not FragmentStateMachine.can_undo_integration(day, current_date):
                return False, f"日期 {date} 不可撤销（可能已跨天或非整合状态）"

        # 执行撤销
        for date in dates:
            day = self.storage.load_fragment_day(crush_slug, date)
            day = FragmentStateMachine.undo_integration(day)
            success, error = self.storage.save_fragment_day(day)
            if not success:
                return False, error

        return True, ""
