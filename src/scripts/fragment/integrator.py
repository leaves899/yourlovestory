#!/usr/bin/env python3
"""
integrator.py - 碎片整合模块

功能 / Functions:
    - 单日碎片整合
    - 跨天整合（预览、确认）
    - 重新生成叙事
"""

from typing import Dict, List, Optional, Tuple

from .models import FragmentDay
from .prompt_generator import FragmentPromptGenerator
from .state_machine import FragmentStateMachine
from .storage import FragmentStorage
from .utils import get_current_date, get_current_datetime


class FragmentIntegrator:
    """
    碎片整合模块

    职责：
    - 单日碎片整合
    - 跨天整合（预览、确认）
    - 重新生成叙事
    """

    def __init__(self, storage: FragmentStorage, prompt_generator: FragmentPromptGenerator):
        """
        初始化整合模块

        Args:
            storage: 存储模块
            prompt_generator: Prompt 生成器
        """
        self.storage = storage
        self.prompt_generator = prompt_generator

    def integrate_fragments(self, crush_slug: str, date: str) -> str:
        """
        整合当天的所有碎片为写作上下文

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            str: 整合后的内容
        """
        day = self.storage.load_fragment_day(crush_slug, date)
        fragments = day.get_non_empty_fragments()

        if not fragments:
            return ""

        return self.prompt_generator.generate_multi_fragment_prompt(fragments, day.direction)

    def preview_cross_day_integration(self, crush_slug: str, dates: List[str]) -> dict:
        """
        预览跨天整合（确认前）

        Args:
            crush_slug: crush 角色标识
            dates: 日期列表

        Returns:
            dict: 预览信息
                - dates: 参与的日期列表
                - fragment_counts: 每个日期的碎片数量
                - total_length: 预计内容长度
                - prompt: 预计生成的 Prompt
        """
        all_fragments = []
        fragment_counts = {}

        for date in dates:
            day = self.storage.load_fragment_day(crush_slug, date)
            fragments = day.get_non_empty_fragments()
            all_fragments.extend(fragments)
            fragment_counts[date] = len(fragments)

        # 按时间排序
        all_fragments.sort(key=lambda f: f.time or "00:00")

        # 生成 Prompt
        prompt = self.prompt_generator.generate_multi_fragment_prompt(all_fragments)

        return {
            "dates": dates,
            "fragment_counts": fragment_counts,
            "total_length": len(prompt),
            "prompt": prompt,
        }

    def confirm_cross_day_integration(
        self,
        crush_slug: str,
        dates: List[str],
        expected_versions: Dict[str, int],
    ) -> Tuple[bool, str]:
        """
        确认执行跨天整合

        Args:
            crush_slug: crush 角色标识
            dates: 日期列表
            expected_versions: 每个日期的期望版本号

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        流程：
        1. 校验所有日期的版本号（乐观锁）
        2. 执行整合
        3. 标记所有参与日期为已完成
        4. 记录 integration_date（用于撤销判断）
        """
        current_date = get_current_date()

        # 缓存 day 对象，避免重复读取磁盘
        day_cache: Dict[str, FragmentDay] = {}

        # 校验所有日期
        for date in dates:
            day = self.storage.load_fragment_day(crush_slug, date)
            day_cache[date] = day

            # 检查版本号
            if date in expected_versions:
                if expected_versions[date] != day.version:
                    return False, f"日期 {date} 的数据已被其他客户端修改，请重新加载"

            # 检查状态
            status = FragmentStateMachine.get_status(date, day.completed, current_date)
            if not FragmentStateMachine.can_integrate(status):
                return False, f"日期 {date} 不可整合（状态：{status.value}）"

        # 收集碎片
        all_fragments = []
        for date in dates:
            all_fragments.extend(day_cache[date].get_non_empty_fragments())

        if not all_fragments:
            return False, "没有有效内容的碎片"

        # 使用最新日期的 direction（跨天整合时取最晚的日期）
        latest_date = max(dates)
        direction = day_cache[latest_date].direction

        # 生成叙事内容
        writing_context = self.prompt_generator.generate_multi_fragment_prompt(all_fragments, direction)

        # 标记所有日期为已完成（使用缓存的 day 对象）
        for date in dates:
            day = day_cache[date]
            expected_version = expected_versions.get(date, day.version)

            # 检查是否有有效内容
            if not day.has_content():
                return False, f"日期 {date} 所有碎片均为空内容，无法生成叙事"

            # 转换为已完成状态
            day = FragmentStateMachine.transition_to_completed(day, writing_context, current_date)
            day.integration_date = current_date

            # 保存
            success, error_msg = self.storage.save_fragment_day(day)
            if not success:
                return False, f"日期 {date} 完成失败：{error_msg}"

        return True, ""

    def regenerate_narrative(
        self,
        crush_slug: str,
        date: str,
        expected_version: int,
    ) -> Tuple[bool, str]:
        """
        重新生成叙事

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）
            expected_version: 期望的版本号（乐观锁）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        备份/回滚机制：
        1. 写入前备份原 writing_context
        2. 生成新叙事
        3. 若生成失败（API 错误、超时），恢复原内容
        4. 提示用户"生成失败，请重试"
        """
        day = self.storage.load_fragment_day(crush_slug, date)

        # 检查编辑状态
        edit_state = FragmentStateMachine.get_edit_state(day.completed, day.writing_context)
        if not FragmentStateMachine.can_regenerate(edit_state):
            return False, "该日期已完成写作，不可重新生成叙事"

        # 乐观锁校验
        if expected_version != day.version:
            return False, "数据已被其他客户端修改，请重新加载"

        # 备份原内容
        backup_context = day.writing_context

        try:
            # 生成新叙事
            new_context = self.integrate_fragments(crush_slug, date)

            if not new_context:
                return False, "所有碎片均为空内容，无法生成叙事"

            # 更新
            day.writing_context = new_context
            day.updated_at = get_current_datetime()
            day.version += 1

            # 保存
            success, error = self.storage.save_fragment_day(day)
            if not success:
                # 回滚
                day.writing_context = backup_context
                day.version -= 1
                return False, error

            return True, ""

        except Exception as e:
            # 恢复原内容
            day.writing_context = backup_context
            self.storage.save_fragment_day(day)

            return False, f"生成失败：{str(e)}，请重试"
