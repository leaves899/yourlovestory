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


def _serialize(obj):
    """将 Fragment / FragmentDay / Enum 等对象序列化为 JSON 安全的字典。"""
    if obj is None:
        return None
    if isinstance(obj, list):
        return [_serialize(item) for item in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if hasattr(obj, "value"):
        # Enum → 取字符串值
        return obj.value
    if hasattr(obj, "__dict__"):
        # dataclass / attrs / 普通对象 → 取所有字段
        result = {}
        for key, val in obj.__dict__.items():
            result[key] = _serialize(val)
        return result
    return obj


def _main() -> int:
    """CLI 入口：解析参数并调用 FragmentManager 对应方法，输出 JSON。"""
    import argparse
    import json
    import sys

    # 尝试相对导入；当 python manager.py 直接运行时回退到绝对导入
    try:
        from .crud import FragmentCRUD
        from .locker import FragmentLocker
        from .integrator import FragmentIntegrator
        from .backup import FragmentBackup
        from .models import EditState, Fragment, FragmentDay, FragmentStatus
        from .prompt_generator import FragmentPromptGenerator
        from .storage import FragmentStorage
        from .tag_recommender import TagRecommender
    except ImportError:
        # 兜底：把项目根目录加入 sys.path 后用绝对导入
        _root = str(Path(__file__).resolve().parent.parent.parent.parent)
        if _root not in sys.path:
            sys.path.insert(0, _root)
        from src.scripts.fragment.crud import FragmentCRUD
        from src.scripts.fragment.locker import FragmentLocker
        from src.scripts.fragment.integrator import FragmentIntegrator
        from src.scripts.fragment.backup import FragmentBackup
        from src.scripts.fragment.models import EditState, Fragment, FragmentDay, FragmentStatus
        from src.scripts.fragment.prompt_generator import FragmentPromptGenerator
        from src.scripts.fragment.storage import FragmentStorage
        from src.scripts.fragment.tag_recommender import TagRecommender

    parser = argparse.ArgumentParser(description="碎片管理器 CLI")
    parser.add_argument("--action", required=True,
                        choices=["record", "list", "get", "update", "delete", "integrate"],
                        help="操作类型")
    parser.add_argument("--slug", required=True, help="角色标识")
    parser.add_argument("--fragment-id", default=None, help="碎片 ID（get/update/delete 需要）")
    parser.add_argument("--origin", default=None,
                        choices=["user", "crush", "ambient"],
                        help="来源（record 需要）")
    parser.add_argument("--mood", default=None,
                        choices=["positive", "negative", "neutral", "mixed"],
                        help="情绪（record 需要）")
    parser.add_argument("--content", default=None, help="碎片内容（record/update 需要）")
    parser.add_argument("--env-tags", default=None,
                        help="环境标签 JSON 数组，例: '[\"工作\",\"咖啡厅\"]'")
    parser.add_argument("--behavior-tags", default=None,
                        help="行为标签 JSON 数组，例: '[\"聊天\",\"约会\"]'")
    parser.add_argument("--date", default=None, help="日期 YYYY-MM-DD")
    parser.add_argument("--expected-version", type=int, default=None,
                        help="乐观锁版本号（update/delete 需要）")
    parser.add_argument("--writing-context", default=None,
                        help="写作上下文（integrate/complete_day 需要）")
    parser.add_argument("--dates", default=None,
                        help="日期列表 JSON 数组（cross_day_integrate 需要）")
    parser.add_argument("--expected-versions", default=None,
                        help="版本映射 JSON 对象（cross_day_integrate 需要）")

    args = parser.parse_args()
    manager = FragmentManager()

    try:
        if args.action == "record":
            fragment_data = {}
            if args.origin:
                fragment_data["origin"] = args.origin
            if args.mood:
                fragment_data["mood"] = args.mood
            if args.content:
                fragment_data["content"] = args.content
            if args.env_tags:
                fragment_data["env_tags"] = json.loads(args.env_tags)
            if args.behavior_tags:
                fragment_data["behavior_tags"] = json.loads(args.behavior_tags)
            if args.writing_context:
                fragment_data["writing_context"] = args.writing_context
            # 默认 writing_mode = raw
            fragment_data.setdefault("writing_mode", "raw")

            fragment, error = manager.record_fragment(
                crush_slug=args.slug,
                fragment_data=fragment_data,
                current_date=args.date,
            )
            if fragment:
                print(json.dumps({"success": True, "data": _serialize(fragment)},
                                 ensure_ascii=False))
            else:
                print(json.dumps({"success": False, "errors": [error]},
                                 ensure_ascii=False))

        elif args.action == "list":
            if args.date:
                fragments = manager.get_fragments_by_date(args.slug, args.date)
            else:
                # 无日期时返回空列表
                fragments = []
            print(json.dumps({"success": True, "data": _serialize(fragments)},
                             ensure_ascii=False))

        elif args.action == "get":
            if not args.fragment_id:
                print(json.dumps({"success": False, "errors": ["--fragment-id is required for get"]},
                                 ensure_ascii=False))
                return 1
            fragment = manager.get_fragment(args.fragment_id)
            if fragment:
                print(json.dumps({"success": True, "data": _serialize(fragment)},
                                 ensure_ascii=False))
            else:
                print(json.dumps({"success": False, "errors": ["Fragment not found"]},
                                 ensure_ascii=False))

        elif args.action == "update":
            if not args.fragment_id:
                print(json.dumps({"success": False, "errors": ["--fragment-id is required for update"]},
                                 ensure_ascii=False))
                return 1
            updates = {}
            if args.content:
                updates["content"] = args.content
            if args.origin:
                updates["origin"] = args.origin
            if args.mood:
                updates["mood"] = args.mood
            if args.env_tags:
                updates["env_tags"] = json.loads(args.env_tags)
            if args.behavior_tags:
                updates["behavior_tags"] = json.loads(args.behavior_tags)

            fragment, error = manager.update_fragment(
                fragment_id=args.fragment_id,
                updates=updates,
                expected_version=args.expected_version or 1,
            )
            if fragment:
                print(json.dumps({"success": True, "data": _serialize(fragment)},
                                 ensure_ascii=False))
            else:
                print(json.dumps({"success": False, "errors": [error]},
                                 ensure_ascii=False))

        elif args.action == "delete":
            if not args.fragment_id:
                print(json.dumps({"success": False, "errors": ["--fragment-id is required for delete"]},
                                 ensure_ascii=False))
                return 1
            success, error = manager.delete_fragment(
                fragment_id=args.fragment_id,
                expected_version=args.expected_version or 1,
            )
            if success:
                print(json.dumps({"success": True}, ensure_ascii=False))
            else:
                print(json.dumps({"success": False, "errors": [error]},
                                 ensure_ascii=False))

        elif args.action == "integrate":
            if args.date:
                result = manager.integrate_fragments(args.slug, args.date)
                print(json.dumps({"success": True, "data": result},
                                 ensure_ascii=False))
            elif args.dates:
                # 跨天整合预览
                dates = json.loads(args.dates)
                result = manager.preview_cross_day_integration(args.slug, dates)
                print(json.dumps({"success": True, "data": result},
                                 ensure_ascii=False))
            else:
                print(json.dumps({"success": False, "errors": ["--date or --dates is required for integrate"]},
                                 ensure_ascii=False))
                return 1

        return 0

    except Exception as e:
        print(json.dumps({"success": False, "errors": [str(e)]}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(_main())
