#!/usr/bin/env python3
"""
manager.py - 碎片管理器（外观模式）

功能 / Functions:
    - 作为 Fragment 模块的统一入口
    - 委托给子模块处理具体逻辑
    - 保持向后兼容的 API
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .backup import FragmentBackup
from .crud import FragmentCRUD
from .integrator import FragmentIntegrator
from .locker import FragmentLocker
from .models import EditState, Fragment, FragmentDay, FragmentStatus
from .prompt_generator import FragmentPromptGenerator
from .storage import FragmentStorage
from .tag_recommender import TagRecommender


class FragmentManager:
    """
    碎片管理器（外观模式）

    作为 Fragment 模块的统一入口，委托给子模块处理具体逻辑。
    保持向后兼容的 API，所有现有调用者不需要修改。
    """

    def __init__(
        self,
        base_dir: Optional[Path] = None,
        storage: Optional[FragmentStorage] = None,
        prompt_generator: Optional[FragmentPromptGenerator] = None,
        tag_recommender: Optional[TagRecommender] = None,
    ):
        """
        初始化碎片管理器

        Args:
            base_dir: 项目根目录
            storage: 存储模块（可选，用于测试时注入 mock）
            prompt_generator: Prompt 生成器（可选，用于测试时注入 mock）
            tag_recommender: 标签推荐器（可选，用于测试时注入 mock）
        """
        if base_dir is None:
            # src/scripts/fragment/ -> 项目根目录
            base_dir = Path(__file__).parent.parent.parent.parent

        self.base_dir = base_dir

        # 初始化子模块（支持依赖注入）
        self.storage = storage or FragmentStorage(base_dir)
        self.prompt_generator = prompt_generator or FragmentPromptGenerator()
        self.tag_recommender = tag_recommender or TagRecommender(base_dir)
        self.crud = FragmentCRUD(self.storage)
        self.locker = FragmentLocker(self.storage)
        self.integrator = FragmentIntegrator(self.storage, self.prompt_generator)
        self.backup = FragmentBackup(self.storage, self.crud)

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
        """
        return self.crud.record_fragment(crush_slug, fragment_data, current_date)

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
        """
        return self.crud.update_fragment(fragment_id, updates, expected_version)

    def delete_fragment(self, fragment_id: str,
                        expected_version: int) -> Tuple[bool, str]:
        """
        删除碎片（需二次确认）

        Args:
            fragment_id: 碎片 ID
            expected_version: 期望的版本号（乐观锁）

        Returns:
            Tuple[bool, str]: (是否成功, 错误信息)
        """
        return self.crud.delete_fragment(fragment_id, expected_version)

    def get_fragment(self, fragment_id: str) -> Optional[Fragment]:
        """
        获取单个碎片

        Args:
            fragment_id: 碎片 ID

        Returns:
            Optional[Fragment]: 碎片对象
        """
        return self.crud.get_fragment(fragment_id)

    def get_fragments_by_date(self, crush_slug: str, date: str) -> List[Fragment]:
        """
        获取指定日期的所有碎片

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            List[Fragment]: 碎片列表
        """
        return self.crud.get_fragments_by_date(crush_slug, date)

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
        return self.locker.get_fragment_day(crush_slug, date)

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
        """
        return self.locker.complete_day(
            crush_slug, date, writing_context, expected_version, integration_date
        )

    def get_status(self, crush_slug: str, date: str) -> FragmentStatus:
        """
        获取日期状态

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            FragmentStatus: 状态
        """
        return self.locker.get_status(crush_slug, date)

    def get_edit_state(self, crush_slug: str, date: str) -> EditState:
        """
        获取编辑状态

        Args:
            crush_slug: crush 角色标识
            date: 日期（YYYY-MM-DD）

        Returns:
            EditState: 编辑状态
        """
        return self.locker.get_edit_state(crush_slug, date)

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
        return self.integrator.integrate_fragments(crush_slug, date)

    def preview_cross_day_integration(self, crush_slug: str,
                                       dates: List[str]) -> dict:
        """
        预览跨天整合（确认前）

        Args:
            crush_slug: crush 角色标识
            dates: 日期列表

        Returns:
            dict: 预览信息
        """
        return self.integrator.preview_cross_day_integration(crush_slug, dates)

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
        """
        return self.integrator.confirm_cross_day_integration(
            crush_slug, dates, expected_versions
        )

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
        """
        return self.integrator.regenerate_narrative(crush_slug, date, expected_version)

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
        """
        return self.backup.retroactively_record(crush_slug, date, fragment_data)

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
        """
        return self.backup.undo_cross_day_integration(crush_slug, dates)


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
    from .utils import get_current_date
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
