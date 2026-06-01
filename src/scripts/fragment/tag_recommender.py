#!/usr/bin/env python3
"""
tag_recommender.py - 标签推荐器

功能 / Functions:
    - 标签推荐（环境标签、行为标签）
    - 降频策略（连续跳过 3 次 → 阈值提高到 70%）
    - 标签库加载和管理
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class TagRecommender:
    """
    标签推荐器（含降频策略）

    降频策略：
    - 连续跳过 3 次 → 阈值从 50% 提高到 70%
    - 连续接受 3 次 → 恢复到 50%
    - 统计范围：单次碎片输入会话（session_id）
    """

    # 默认推荐阈值
    DEFAULT_THRESHOLD = 0.5  # 50%
    REDUCED_THRESHOLD = 0.7  # 70%

    # 降频触发次数
    SKIP_THRESHOLD = 3  # 连续跳过 3 次触发降频
    ACCEPT_THRESHOLD = 3  # 连续接受 3 次恢复

    def __init__(self, base_dir: Optional[Path] = None):
        """
        初始化标签推荐器

        Args:
            base_dir: 项目根目录（用于加载标签库）
        """
        if base_dir is None:
            # src/scripts/fragment/ -> 项目根目录
            base_dir = Path(__file__).parent.parent.parent.parent

        self.base_dir = base_dir
        self.tag_library = self._load_tag_library()
        self.session_stats: Dict[str, dict] = {}  # 会话统计

    def recommend(self, content: str, crush_slug: str, session_id: str,
                  crush_persona: Optional[dict] = None) -> dict:
        """
        推荐标签

        Args:
            content: 用户输入内容
            crush_slug: crush 角色标识
            session_id: 会话 ID（用于降频统计）
            crush_persona: crush 角色档案（可选）

        Returns:
            dict: 推荐结果
                - env_tags: 推荐的环境标签列表
                - behavior_tags: 推荐的行为标签列表

        降频策略：
        - 连续跳过 3 次 → 阈值从 50% 提高到 70%
        - 连续接受 3 次 → 恢复到 50%
        - 统计范围：单次碎片输入会话（session_id）
        """
        if not content or not content.strip():
            return {"env_tags": [], "behavior_tags": []}

        # 获取当前阈值
        threshold = self._get_current_threshold(session_id)

        # 推荐环境标签
        env_tags = self._recommend_tags(content, threshold, "env_tags", crush_persona)

        # 推荐行为标签
        behavior_tags = self._recommend_tags(content, threshold, "behavior_tags", crush_persona)

        return {
            "env_tags": env_tags,
            "behavior_tags": behavior_tags
        }

    def record_skip(self, session_id: str, tag_type: str = "all"):
        """
        记录用户跳过推荐

        Args:
            session_id: 会话 ID
            tag_type: 标签类型（env/behavior/all）
        """
        if session_id not in self.session_stats:
            self.session_stats[session_id] = {
                "skip_count": 0,
                "accept_count": 0,
                "threshold": self.DEFAULT_THRESHOLD
            }

        stats = self.session_stats[session_id]
        stats["skip_count"] += 1
        stats["accept_count"] = 0  # 重置接受计数

        # 检查是否触发降频
        if stats["skip_count"] >= self.SKIP_THRESHOLD:
            stats["threshold"] = self.REDUCED_THRESHOLD

    def record_accept(self, session_id: str, tag_type: str = "all"):
        """
        记录用户接受推荐

        Args:
            session_id: 会话 ID
            tag_type: 标签类型（env/behavior/all）
        """
        if session_id not in self.session_stats:
            self.session_stats[session_id] = {
                "skip_count": 0,
                "accept_count": 0,
                "threshold": self.DEFAULT_THRESHOLD
            }

        stats = self.session_stats[session_id]
        stats["accept_count"] += 1
        stats["skip_count"] = 0  # 重置跳过计数

        # 检查是否恢复频率
        if stats["accept_count"] >= self.ACCEPT_THRESHOLD:
            stats["threshold"] = self.DEFAULT_THRESHOLD

    def _get_current_threshold(self, session_id: str) -> float:
        """
        获取当前推荐阈值

        Args:
            session_id: 会话 ID

        Returns:
            float: 当前阈值（50% 或 70%）
        """
        if session_id not in self.session_stats:
            return self.DEFAULT_THRESHOLD

        return self.session_stats[session_id]["threshold"]

    def _recommend_tags(self, content: str, threshold: float,
                        tag_type: str, crush_persona: Optional[dict] = None) -> List[dict]:
        """
        推荐标签（通用方法）

        Args:
            content: 用户输入内容
            threshold: 推荐阈值
            tag_type: 标签类型（"env_tags" 或 "behavior_tags"）
            crush_persona: crush 角色档案

        Returns:
            List[dict]: 推荐的标签列表
        """
        if not self.tag_library or tag_type not in self.tag_library:
            return []

        candidates = []
        for tag in self.tag_library[tag_type]:
            relevance = self._calculate_relevance(content, tag)
            if relevance >= threshold:
                candidates.append({
                    "id": tag["id"],
                    "name": tag["name"],
                    "relevance": relevance
                })

        # 按相关度排序
        candidates.sort(key=lambda x: x["relevance"], reverse=True)

        # 最多返回 3 个推荐
        return candidates[:3]

    def _calculate_relevance(self, content: str, tag: dict) -> float:
        """
        计算标签与内容的相关度

        Args:
            content: 用户输入内容
            tag: 标签数据

        Returns:
            float: 相关度（0.0 - 1.0）
        """
        content_lower = content.lower()
        score = 0.0

        # 检查关键词匹配
        keywords = tag.get("keywords", [])
        for keyword in keywords:
            if keyword.lower() in content_lower:
                score += 0.3

        # 检查别名匹配
        aliases = tag.get("aliases", [])
        for alias in aliases:
            if alias.lower() in content_lower:
                score += 0.2

        # 检查名称匹配
        name = tag.get("name", "")
        if name.lower() in content_lower:
            score += 0.5

        # 限制最大分数
        return min(score, 1.0)

    def _load_tag_library(self) -> dict:
        """
        加载标签库

        Returns:
            dict: 标签库数据
        """
        tag_library_path = self.base_dir / "tags" / "tag_library.json"

        if not tag_library_path.exists():
            # 返回默认标签库
            return self._get_default_tag_library()

        try:
            with open(tag_library_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return self._get_default_tag_library()

    def _get_default_tag_library(self) -> dict:
        """
        获取默认标签库

        Returns:
            dict: 默认标签库
        """
        return {
            "version": "1.0.0",
            "env_tags": [
                {"id": "work", "name": "工作", "aliases": ["上班", "公司", "办公室"], "keywords": ["工作", "上班", "公司"]},
                {"id": "home", "name": "家", "aliases": ["家里", "房间"], "keywords": ["家", "房间", "卧室"]},
                {"id": "school", "name": "学校", "aliases": ["教室", "图书馆"], "keywords": ["学校", "教室", "图书馆"]},
                {"id": "cafe", "name": "咖啡厅", "aliases": ["咖啡店", "星巴克"], "keywords": ["咖啡", "星巴克"]},
                {"id": "park", "name": "公园", "aliases": ["花园", "绿地"], "keywords": ["公园", "花园"]}
            ],
            "behavior_tags": [
                {"id": "cute", "name": "可爱", "aliases": ["萌", "软萌"], "keywords": ["可爱", "萌", "表情包"]},
                {"id": "cool", "name": "酷", "aliases": ["帅气", "高冷"], "keywords": ["酷", "帅", "高冷"]},
                {"id": "shy", "name": "害羞", "aliases": ["腼腆", "不好意思"], "keywords": ["害羞", "腼腆", "脸红"]},
                {"id": "happy", "name": "开心", "aliases": ["高兴", "快乐"], "keywords": ["开心", "高兴", "笑"]},
                {"id": "sad", "name": "难过", "aliases": ["伤心", "失落"], "keywords": ["难过", "伤心", "失落"]}
            ]
        }

    def get_session_stats(self, session_id: str) -> dict:
        """
        获取会话统计信息

        Args:
            session_id: 会话 ID

        Returns:
            dict: 统计信息
        """
        if session_id not in self.session_stats:
            return {
                "skip_count": 0,
                "accept_count": 0,
                "threshold": self.DEFAULT_THRESHOLD
            }

        return self.session_stats[session_id].copy()

    def reset_session(self, session_id: str):
        """
        重置会话统计

        Args:
            session_id: 会话 ID
        """
        if session_id in self.session_stats:
            del self.session_stats[session_id]


if __name__ == "__main__":
    # 测试标签推荐器
    print("=== 标签推荐器测试 ===")

    recommender = TagRecommender()
    session_id = "test_session_001"

    # 测试推荐
    content = "ta今天在公司发了一个可爱的表情包"
    print(f"\n输入内容: {content}")

    result = recommender.recommend(content, "example", session_id)
    print(f"推荐结果: {result}")

    # 测试降频策略
    print(f"\n--- 降频策略测试 ---")

    # 连续跳过 3 次
    for i in range(3):
        recommender.record_skip(session_id)
        stats = recommender.get_session_stats(session_id)
        print(f"跳过 {i+1} 次后: {stats}")

    # 阈值应该提高到 70%
    result_after_skip = recommender.recommend(content, "example", session_id)
    print(f"降频后推荐结果: {result_after_skip}")

    # 连续接受 3 次
    for i in range(3):
        recommender.record_accept(session_id)
        stats = recommender.get_session_stats(session_id)
        print(f"接受 {i+1} 次后: {stats}")

    # 阈值应该恢复到 50%
    result_after_accept = recommender.recommend(content, "example", session_id)
    print(f"恢复后推荐结果: {result_after_accept}")

    # 测试空内容
    print(f"\n--- 空内容测试 ---")
    result_empty = recommender.recommend("", "example", session_id)
    print(f"空内容推荐: {result_empty}")

    # 测试无匹配内容
    print(f"\n--- 无匹配内容测试 ---")
    result_no_match = recommender.recommend("今天天气真好", "example", session_id)
    print(f"无匹配推荐: {result_no_match}")

    print("\n=== 测试完成 ===")
