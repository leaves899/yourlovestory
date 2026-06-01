#!/usr/bin/env python3
"""
fragment_state_machine.py - 碎片状态机

功能 / Functions:
    - 状态判断（get_status、get_edit_state）
    - 权限检查（can_edit、can_delete、can_integrate、can_add_fragment、can_regenerate）
    - 状态转换（transition_to_completed、transition_to_expired）
"""

from datetime import datetime
from typing import Optional

from .models import (
    EditState,
    FragmentDay,
    FragmentStatus,
)
from .utils import (
    ARCHIVE_DAYS,
    calculate_days_between,
    get_current_date,
)


class FragmentStateMachine:
    """
    碎片状态机

    状态转换规则：
    - 进行中 → 已完成（用户触发写作）
    - 未完成 → 已过期（超过7天自动转换）
    - 已完成 → 不可逆
    """

    @staticmethod
    def get_status(date: str, completed: bool, current_date: Optional[str] = None) -> FragmentStatus:
        """
        根据日期和完成状态判断当前状态

        Args:
            date: 碎片日期（YYYY-MM-DD）
            completed: 是否已完成
            current_date: 当前日期（YYYY-MM-DD），为空时使用今天

        Returns:
            FragmentStatus: 状态枚举

        状态判断规则：
        - 已完成（completed=true）→ COMPLETED
        - 当前日期 → IN_PROGRESS
        - 当前日期 - 日期 <= 7 天 → UNFINISHED
        - 当前日期 - 日期 > 7 天 → EXPIRED
        """
        if completed:
            return FragmentStatus.COMPLETED

        if current_date is None:
            current_date = get_current_date()

        if date == current_date:
            return FragmentStatus.IN_PROGRESS

        days = calculate_days_between(date, current_date)

        if days > ARCHIVE_DAYS:
            return FragmentStatus.EXPIRED
        else:
            return FragmentStatus.UNFINISHED

    @staticmethod
    def get_edit_state(completed: bool, writing_context: Optional[str]) -> EditState:
        """
        获取编辑状态

        Args:
            completed: 是否已完成
            writing_context: 写作上下文

        Returns:
            EditState: 编辑状态枚举

        三种状态：
        - EDITABLE：未触发写作（completed=false，writing_context 为空或 None）
        - READONLY_REGENERABLE：已触发但未确认（completed=false，writing_context 已有内容）
        - READONLY_FINAL：已完成（completed=true）
        """
        if completed:
            return EditState.READONLY_FINAL

        # 检查 writing_context 是否有实际内容
        if writing_context is not None and writing_context.strip():
            return EditState.READONLY_REGENERABLE

        return EditState.EDITABLE

    @staticmethod
    def can_edit(edit_state: EditState) -> bool:
        """
        判断是否可编辑

        Args:
            edit_state: 编辑状态

        Returns:
            bool: 是否可编辑（仅 EDITABLE 状态可编辑）
        """
        return edit_state == EditState.EDITABLE

    @staticmethod
    def can_generate(edit_state: EditState) -> bool:
        """
        判断是否可生成叙事（首次生成）

        Args:
            edit_state: 编辑状态

        Returns:
            bool: 是否可生成

        规则：
        - EDITABLE：可生成（未触发过写作）
        - READONLY_REGENERABLE：不可生成（已有内容，应使用重新生成）
        - READONLY_FINAL：不可生成（已完成状态）
        """
        return edit_state == EditState.EDITABLE

    @staticmethod
    def can_regenerate(edit_state: EditState) -> bool:
        """
        判断是否可重新生成叙事

        Args:
            edit_state: 编辑状态

        Returns:
            bool: 是否可重新生成

        规则：
        - EDITABLE：不可重新生成（还没有生成过，应使用生成）
        - READONLY_REGENERABLE：可重新生成（已生成但未确认）
        - READONLY_FINAL：不可重新生成（已完成状态意味着写作已闭环）
        """
        return edit_state == EditState.READONLY_REGENERABLE

    @staticmethod
    def can_delete(status: FragmentStatus, completed: bool) -> bool:
        """
        判断是否可删除

        Args:
            status: 碎片状态
            completed: 是否已完成

        Returns:
            bool: 是否可删除

        删除权限优先级：
        1. 已完成状态（completed=true）→ 不可删除（无论是否超过 7 天）
        2. 已过期/超过 7 天（completed=false 且 EXPIRED）→ 可删除（需二次确认）
        3. 其他状态（进行中/未完成）→ 可删除（需二次确认）
        """
        # 第一优先级：已完成状态不可删除
        if completed:
            return False

        # 第二优先级：已过期状态可删除（需二次确认）
        if status == FragmentStatus.EXPIRED:
            return True

        # 第三优先级：其他状态可删除（需二次确认）
        return True

    @staticmethod
    def can_integrate(status: FragmentStatus) -> bool:
        """
        判断是否可整合

        Args:
            status: 碎片状态

        Returns:
            bool: 是否可整合（IN_PROGRESS 和 UNFINISHED 可整合）
        """
        return status in (FragmentStatus.IN_PROGRESS, FragmentStatus.UNFINISHED)

    @staticmethod
    def can_add_fragment(status: FragmentStatus) -> bool:
        """
        判断是否可添加新碎片

        Args:
            status: 碎片状态

        Returns:
            bool: 是否可添加（仅 IN_PROGRESS 可添加）

        规则：
        - IN_PROGRESS：可添加
        - UNFINISHED：不可添加（历史碎片只能查看和整合）
        - EXPIRED：不可添加（只读归档）
        - COMPLETED：不可添加（已完成状态意味着写作已闭环）
        """
        return status == FragmentStatus.IN_PROGRESS

    @staticmethod
    def transition_to_completed(day: FragmentDay, writing_context: str, current_date: Optional[str] = None) -> FragmentDay:
        """
        转换为已完成状态

        Args:
            day: 日期级别碎片数据
            writing_context: 写作上下文
            current_date: 当前日期（YYYY-MM-DD），为空时使用今天

        Returns:
            FragmentDay: 更新后的数据
        """
        from .utils import get_current_datetime

        day.completed = True
        day.writing_context = writing_context
        day.updated_at = get_current_datetime()
        day.version += 1

        return day

    @staticmethod
    def transition_to_expired(day: FragmentDay) -> FragmentDay:
        """
        转换为已过期状态

        注意：已过期状态由 get_status 根据日期自动计算
        此方法主要用于标记过期时间和更新元数据

        Args:
            day: 日期级别碎片数据

        Returns:
            FragmentDay: 更新后的数据
        """
        from .utils import get_current_datetime

        # 更新元数据（状态由 get_status 自动计算）
        day.updated_at = get_current_datetime()
        day.version += 1

        return day

    @staticmethod
    def can_undo_integration(day: FragmentDay, current_date: Optional[str] = None) -> bool:
        """
        判断是否可撤销跨天整合

        Args:
            day: 日期级别碎片数据
            current_date: 当前日期（YYYY-MM-DD），为空时使用今天

        Returns:
            bool: 是否可撤销

        规则：
        1. 必须是已完成状态
        2. 必须有 integration_date（表示是跨天整合的）
        3. integration_date 必须是物理日期（今天）
        """
        if not day.completed:
            return False

        if not day.integration_date:
            return False

        if current_date is None:
            current_date = get_current_date()

        return day.integration_date == current_date

    @staticmethod
    def undo_integration(day: FragmentDay) -> FragmentDay:
        """
        撤销跨天整合

        Args:
            day: 日期级别碎片数据

        Returns:
            FragmentDay: 更新后的数据

        规则：
        1. completed 重置为 false
        2. writing_context 清空
        3. integration_date 清空
        4. version + 1
        """
        from .utils import get_current_datetime

        day.completed = False
        day.writing_context = None
        day.integration_date = None
        day.updated_at = get_current_datetime()
        day.version += 1

        return day


if __name__ == "__main__":
    # 测试状态机
    print("=== 状态机测试 ===")

    # 测试状态判断
    print(f"状态（今天，未完成）: {FragmentStateMachine.get_status('2026-05-30', False, '2026-05-30')}")
    print(f"状态（3天前，未完成）: {FragmentStateMachine.get_status('2026-05-27', False, '2026-05-30')}")
    print(f"状态（10天前，未完成）: {FragmentStateMachine.get_status('2026-05-20', False, '2026-05-30')}")
    print(f"状态（任意日期，已完成）: {FragmentStateMachine.get_status('2026-05-20', True)}")

    # 测试编辑状态
    print(f"\n编辑状态（未触发）: {FragmentStateMachine.get_edit_state(False, None)}")
    print(f"编辑状态（已触发未确认）: {FragmentStateMachine.get_edit_state(False, 'some content')}")
    print(f"编辑状态（已完成）: {FragmentStateMachine.get_edit_state(True, 'some content')}")

    # 测试权限检查
    editable = EditState.EDITABLE
    readonly_regenerable = EditState.READONLY_REGENERABLE
    readonly_final = EditState.READONLY_FINAL

    print(f"\n可编辑（EDITABLE）: {FragmentStateMachine.can_edit(editable)}")
    print(f"可编辑（READONLY_REGENERABLE）: {FragmentStateMachine.can_edit(readonly_regenerable)}")
    print(f"可编辑（READONLY_FINAL）: {FragmentStateMachine.can_edit(readonly_final)}")

    print(f"\n可重新生成（EDITABLE）: {FragmentStateMachine.can_regenerate(editable)}")
    print(f"可重新生成（READONLY_REGENERABLE）: {FragmentStateMachine.can_regenerate(readonly_regenerable)}")
    print(f"可重新生成（READONLY_FINAL）: {FragmentStateMachine.can_regenerate(readonly_final)}")

    print(f"\n可删除（IN_PROGRESS，未完成）: {FragmentStateMachine.can_delete(FragmentStatus.IN_PROGRESS, False)}")
    print(f"可删除（EXPIRED，未完成）: {FragmentStateMachine.can_delete(FragmentStatus.EXPIRED, False)}")
    print(f"可删除（COMPLETED，已完成）: {FragmentStateMachine.can_delete(FragmentStatus.COMPLETED, True)}")

    print(f"\n可整合（IN_PROGRESS）: {FragmentStateMachine.can_integrate(FragmentStatus.IN_PROGRESS)}")
    print(f"可整合（UNFINISHED）: {FragmentStateMachine.can_integrate(FragmentStatus.UNFINISHED)}")
    print(f"可整合（EXPIRED）: {FragmentStateMachine.can_integrate(FragmentStatus.EXPIRED)}")

    print(f"\n可添加碎片（IN_PROGRESS）: {FragmentStateMachine.can_add_fragment(FragmentStatus.IN_PROGRESS)}")
    print(f"可添加碎片（UNFINISHED）: {FragmentStateMachine.can_add_fragment(FragmentStatus.UNFINISHED)}")
    print(f"可添加碎片（COMPLETED）: {FragmentStateMachine.can_add_fragment(FragmentStatus.COMPLETED)}")

    # 测试状态转换
    print("\n=== 状态转换测试 ===")

    day = FragmentDay(
        date="2026-05-30",
        crush_slug="example",
        fragments=[],
        completed=False,
        direction="轻松的",
        writing_context=None,
        version=1,
        integration_date=None,
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )

    print(f"转换前: completed={day.completed}, version={day.version}")

    day = FragmentStateMachine.transition_to_completed(day, "生成的叙事内容")
    print(f"转换后: completed={day.completed}, version={day.version}")

    # 测试撤销判断
    print(f"\n可撤销（无 integration_date）: {FragmentStateMachine.can_undo_integration(day, '2026-05-30')}")

    day.integration_date = "2026-05-30"
    print(f"可撤销（今天整合）: {FragmentStateMachine.can_undo_integration(day, '2026-05-30')}")
    print(f"可撤销（昨天整合）: {FragmentStateMachine.can_undo_integration(day, '2026-05-31')}")

    # 测试撤销
    day = FragmentStateMachine.undo_integration(day)
    print(f"\n撤销后: completed={day.completed}, version={day.version}")

    print("\n=== 测试完成 ===")
