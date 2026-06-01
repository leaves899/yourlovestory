#!/usr/bin/env python3
"""
fragment_manager.py - 碎片管理器

功能 / Functions:
    - 碎片 CRUD 操作（创建、读取、更新、删除）
    - 日期级别操作（获取、完成、状态查询）
    - 碎片整合（单日、跨天）
    - 乐观锁机制（版本号校验）
    - 备份/回滚机制（重新生成叙事）
    - 内容验证
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .models import (
    EditState,
    Fragment,
    FragmentDay,
    FragmentStatus,
)
from .state_machine import FragmentStateMachine
from .utils import (
    MAX_FRAGMENTS_PER_DAY,
    ensure_fragment_dir,
    generate_fragment_id,
    get_current_date,
    get_current_datetime,
    get_current_time,
    get_fragment_date_dir,
    is_expired,
    is_today,
    validate_content,
)
from .prompt_generator import FragmentPromptGenerator
from .tag_recommender import TagRecommender


class FragmentManager:
    """
    碎片管理器

    核心功能：
    - 碎片 CRUD 操作
    - 日期级别操作
    - 碎片整合
    - 乐观锁机制
    - 备份/回滚机制
    """

    def __init__(self, base_dir: Optional[Path] = None):
        """
        初始化碎片管理器

        Args:
            base_dir: 项目根目录
        """
        if base_dir is None:
            # src/scripts/fragment/ -> 项目根目录
            base_dir = Path(__file__).parent.parent.parent.parent

        self.base_dir = base_dir
        self.prompt_generator = FragmentPromptGenerator()
        self.tag_recommender = TagRecommender(base_dir)

    # ==================== 标签推荐 ====================

    def recommend_tags(self, crush_slug: str, content: str,
                       session_id: str) -> dict:
        """
        推荐标签

        Args:
            crush_slug: crush 角色标识
            content: 用户输入内容
            session_id: 会话 ID（用于降频统计）

        Returns:
            dict: 推荐结果
                - env_tags: 推荐的环境标签列表
                - behavior_tags: 推荐的行为标签列表
        """
        return self.tag_recommender.recommend(content, crush_slug, session_id)

    def record_tag_skip(self, session_id: str):
        """记录用户跳过标签推荐"""
        self.tag_recommender.record_skip(session_id)

    def record_tag_accept(self, session_id: str):
        """记录用户接受标签推荐"""
        self.tag_recommender.record_accept(session_id)

    # ==================== 碎片 CRUD 操作 ====================

    def record_fragment(self, crush_slug: str, fragment_data: dict,
                        current_date: Optional[str] = None) -> Tuple[Optional[Fragment], str]:
        """
        记录用户输入的碎片

        Args:
            crush_slug: crush 角色标识
            fragment_data: 碎片数据
            current_date: 当前日期（YYYY-MM-DD），为空时使用今天

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
        day = self.get_fragment_day(crush_slug, current_date)

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
            updated_at=now
        )

        # 添加到日期数据
        day.fragments.append(fragment)
        day.updated_at = now
        day.version += 1

        # 保存
        success, error = self._save_fragment_day(day)
        if not success:
            # 回滚版本号
            day.fragments.pop()
            day.version -= 1
            return None, error

        return fragment, ""

    def update_fragment(self, fragment_id: str, updates: dict,
                        expected_version: int) -> Tuple[Optional[Fragment], str]:
        """
        更新碎片内容

        Args:
            fragment_id: 碎片 ID
            updates: 更新数据
            expected_version: 期望的版本号（乐观锁）

        Returns:
            Tuple[Optional[Fragment], str]: (碎片对象, 错误信息)

        乐观锁机制：
        - 传入 expected_version（客户端读取时的版本号）
        - 写入前校验 expected_version == current_version
        - 版本冲突则提示"碎片已被其他客户端修改"
        - 写入成功后 version + 1
        """
        # 查找碎片
        fragment, day = self._find_fragment(fragment_id)
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
        success, error = self._save_fragment_day(day)
        if not success:
            # 回滚
            for key, value in old_values.items():
                setattr(fragment, key, value)
            day.version -= 1
            return None, error

        return fragment, ""

    def delete_fragment(self, fragment_id: str,
                        expected_version: int) -> Tuple[bool, str]:
        """
        删除碎片（需二次确认）

        Args:
            fragment_id: 碎片 ID
            expected_version: 期望的版本号（乐观锁）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        删除权限优先级：
        1. 已完成状态（completed=true）→ 不可删除（无论是否超过 7 天）
        2. 已过期/超过 7 天（completed=false 且 >7天）→ 可删除（需二次确认）
        3. 其他状态（进行中/未完成）→ 可删除（需二次确认）
        """
        # 查找碎片
        fragment, day = self._find_fragment(fragment_id)
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
        success, error = self._save_fragment_day(day)
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
        fragment, _ = self._find_fragment(fragment_id)
        return fragment

    def get_fragments_by_date(self, crush_slug: str, date: str) -> List[Fragment]:
        """
        获取指定日期的所有碎片

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            List[Fragment]: 碎片列表
        """
        day = self.get_fragment_day(crush_slug, date)
        return day.fragments

    # ==================== 日期级别操作 ====================

    def get_fragment_day(self, crush_slug: str, date: str) -> FragmentDay:
        """
        获取日期级别碎片数据

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

    def complete_day(self, crush_slug: str, date: str,
                     writing_context: str,
                     expected_version: int,
                     integration_date: Optional[str] = None) -> Tuple[bool, str]:
        """
        标记日期为已完成

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）
            writing_context: 写作上下文
            expected_version: 期望的版本号（乐观锁）
            integration_date: 跨天整合的物理日期（用于撤销判断）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)

        流程：
        1. 校验版本号（乐观锁）
        2. 设置 completed=true
        3. 填充 writing_context
        4. version + 1
        """
        day = self.get_fragment_day(crush_slug, date)

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
        success, error = self._save_fragment_day(day)
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
        day = self.get_fragment_day(crush_slug, date)
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
        day = self.get_fragment_day(crush_slug, date)
        return FragmentStateMachine.get_edit_state(day.completed, day.writing_context)

    # ==================== 碎片整合 ====================

    def integrate_fragments(self, crush_slug: str, date: str) -> str:
        """
        整合当天的所有碎片为写作上下文

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            str: 整合后的内容
        """
        day = self.get_fragment_day(crush_slug, date)
        fragments = day.get_non_empty_fragments()

        if not fragments:
            return ""

        return self.prompt_generator.generate_multi_fragment_prompt(fragments, day.direction)

    def preview_cross_day_integration(self, crush_slug: str,
                                       dates: List[str]) -> dict:
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
            day = self.get_fragment_day(crush_slug, date)
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
            "prompt": prompt
        }

    def confirm_cross_day_integration(self, crush_slug: str,
                                       dates: List[str],
                                       expected_versions: Dict[str, int]) -> Tuple[bool, str]:
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
            day = self.get_fragment_day(crush_slug, date)
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
            success, error_msg = self.complete_day(
                crush_slug, date, writing_context,
                expected_version, integration_date=current_date
            )
            if not success:
                return False, f"日期 {date} 完成失败：{error_msg}"

        return True, ""

    def regenerate_narrative(self, crush_slug: str, date: str,
                              expected_version: int) -> Tuple[bool, str]:
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
        day = self.get_fragment_day(crush_slug, date)

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
            success, error = self._save_fragment_day(day)
            if not success:
                # 回滚
                day.writing_context = backup_context
                day.version -= 1
                return False, error

            return True, ""

        except Exception as e:
            # 恢复原内容
            day.writing_context = backup_context
            self._save_fragment_day(day)

            return False, f"生成失败：{str(e)}，请重试"

    # ==================== 补录功能 ====================

    def retroactively_record(self, crush_slug: str, date: str,
                              fragment_data: dict) -> Tuple[Optional[Fragment], str]:
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
        from .utils import is_within_retroactive_range, is_expired
        if not is_within_retroactive_range(date, current_date):
            return None, "只能补录最近 30 天的碎片"

        # 检查是否已过期
        if is_expired(date, current_date):
            return None, "该日期碎片已归档，无法补录"

        # 检查是否可添加碎片
        day = self.get_fragment_day(crush_slug, date)
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
        return self.record_fragment(crush_slug, fragment_data, date)

    # ==================== 跨天整合撤销 ====================

    def undo_cross_day_integration(self, crush_slug: str,
                                    dates: List[str]) -> Tuple[bool, str]:
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
            day = self.get_fragment_day(crush_slug, date)

            # 检查是否可撤销
            if not FragmentStateMachine.can_undo_integration(day, current_date):
                return False, f"日期 {date} 不可撤销（可能已跨天或非整合状态）"

        # 执行撤销
        for date in dates:
            day = self.get_fragment_day(crush_slug, date)
            day = FragmentStateMachine.undo_integration(day)
            success, error = self._save_fragment_day(day)
            if not success:
                return False, error

        return True, ""

    # ==================== 内部方法 ====================

    def _find_fragment(self, fragment_id: str) -> Tuple[Optional[Fragment], Optional[FragmentDay]]:
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
        # 这里简化处理，假设 crush_slug 已知
        # 实际实现中可以通过索引或缓存优化
        crushes_dir = self.base_dir / "crushes"
        if not crushes_dir.exists():
            return None, None

        for crush_dir in crushes_dir.iterdir():
            if crush_dir.is_dir():
                crush_slug = crush_dir.name
                day = self.get_fragment_day(crush_slug, date)
                for fragment in day.fragments:
                    if fragment.id == fragment_id:
                        return fragment, day

        return None, None

    def _save_fragment_day(self, day: FragmentDay) -> Tuple[bool, str]:
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


if __name__ == "__main__":
    # 测试碎片管理器
    print("=== 碎片管理器测试 ===")

    manager = FragmentManager()

    # 测试记录碎片
    print("\n--- 记录碎片测试 ---")
    fragment_data = {
        "origin": "crush",
        "mood": "positive",
        "content": "ta发了一个可爱的表情包",
        "writing_mode": "raw",
        "env_tags": ["工作"],
        "behavior_tags": []
    }

    fragment, error = manager.record_fragment("example", fragment_data)
    if fragment:
        print(f"记录成功: {fragment.id}")
    else:
        print(f"记录失败: {error}")

    # 测试获取碎片
    print("\n--- 获取碎片测试 ---")
    current_date = get_current_date()
    fragments = manager.get_fragments_by_date("example", current_date)
    print(f"当日碎片数量: {len(fragments)}")

    # 测试更新碎片
    if fragment:
        print("\n--- 更新碎片测试 ---")
        updated, error = manager.update_fragment(
            fragment.id,
            {"content": "ta发了一个超级可爱的表情包"},
            1  # expected_version
        )
        if updated:
            print(f"更新成功: {updated.content}")
        else:
            print(f"更新失败: {error}")

    # 测试删除碎片
    if fragment:
        print("\n--- 删除碎片测试 ---")
        success, error = manager.delete_fragment(fragment.id, 2)
        if success:
            print("删除成功")
        else:
            print(f"删除失败: {error}")

    print("\n=== 测试完成 ===")
