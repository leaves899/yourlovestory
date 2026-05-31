#!/usr/bin/env python3
"""
blind_matcher.py - Blind 模式匹配器

功能 / Functions:
    - 匹配回复（从 crush 角色档案中匹配）
    - 关键词匹配（30% 权重）
    - 语义相似度（70% 权重）
    - 匹配结果排序和筛选
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class BlindMatcher:
    """
    Blind 模式匹配器

    匹配字段优先级：
    1. 常见回复（crush_replies）：直接匹配相似内容
    2. 性格特征（personality）：根据性格调整匹配权重
    3. 行为模式（behavior_patterns）：匹配用户输入中的行为描述

    相似度计算：
    - 关键词匹配：30% 权重
    - 语义相似度：70% 权重
    - 阈值：>60%（可调整范围：50%-80%）
    """

    # 权重配置
    KEYWORD_WEIGHT = 0.3  # 关键词匹配权重
    SEMANTIC_WEIGHT = 0.7  # 语义相似度权重

    # 默认阈值
    DEFAULT_THRESHOLD = 0.6  # 60%

    # 阈值范围
    MIN_THRESHOLD = 0.5  # 50%
    MAX_THRESHOLD = 0.8  # 80%

    def __init__(self, crush_slug: str, base_dir: Optional[Path] = None):
        """
        初始化 Blind 匹配器

        Args:
            crush_slug: crush 角色标识
            base_dir: 项目根目录
        """
        self.crush_slug = crush_slug

        if base_dir is None:
            base_dir = Path(__file__).parent.parent

        self.base_dir = base_dir
        self.persona = self._load_persona()

        # 尝试加载 sentence-transformers（可选）
        self.semantic_model = None
        self._try_load_semantic_model()

    def match_replies(self, user_input: str, limit: int = 1,
                      threshold: float = DEFAULT_THRESHOLD) -> List[dict]:
        """
        匹配回复

        Args:
            user_input: 用户输入内容
            limit: 返回结果数量限制（默认 1，最多 3）
            threshold: 匹配阈值（默认 60%，可调整范围 50%-80%）

        Returns:
            List[dict]: 匹配结果列表
                - content: 回复内容
                - score: 匹配分数
                - source: 来源（crush_replies/personality/behavior_patterns）

        匹配字段优先级：
        1. 常见回复（crush_replies）
        2. 性格特征（personality）
        3. 行为模式（behavior_patterns）
        """
        if not user_input or not user_input.strip():
            return []

        # 限制阈值范围
        threshold = max(self.MIN_THRESHOLD, min(self.MAX_THRESHOLD, threshold))

        # 限制返回数量
        limit = min(limit, 3)

        # 获取候选回复
        candidates = self._get_candidates()

        if not candidates:
            return []

        # 计算匹配分数
        scored_candidates = []
        for candidate in candidates:
            score = self._calculate_total_score(user_input, candidate["content"])
            if score >= threshold:
                scored_candidates.append({
                    "content": candidate["content"],
                    "score": score,
                    "source": candidate["source"]
                })

        # 按分数排序
        scored_candidates.sort(key=lambda x: x["score"], reverse=True)

        # 返回 top N
        return scored_candidates[:limit]

    def _calculate_total_score(self, text1: str, text2: str) -> float:
        """
        计算总匹配分数

        Args:
            text1: 文本1
            text2: 文本2

        Returns:
            float: 总分数（0.0 - 1.0）

        公式：total = keyword_score * 0.3 + semantic_score * 0.7
        """
        keyword_score = self._keyword_match(text1, text2)
        semantic_score = self._semantic_similarity(text1, text2)

        return keyword_score * self.KEYWORD_WEIGHT + semantic_score * self.SEMANTIC_WEIGHT

    def _keyword_match(self, text1: str, text2: str) -> float:
        """
        关键词匹配（30% 权重）

        Args:
            text1: 文本1
            text2: 文本2

        Returns:
            float: 关键词匹配分数（0.0 - 1.0）

        实现：
        1. 简单分词（按字符和标点）
        2. 提取关键词
        3. 计算关键词重叠度（Jaccard 相似度）
        """
        if not text1 or not text2:
            return 0.0

        # 简单分词
        words1 = self._simple_tokenize(text1)
        words2 = self._simple_tokenize(text2)

        if not words1 or not words2:
            return 0.0

        # 计算 Jaccard 相似度
        set1 = set(words1)
        set2 = set(words2)

        intersection = len(set1 & set2)
        union = len(set1 | set2)

        if union == 0:
            return 0.0

        return intersection / union

    def _semantic_similarity(self, text1: str, text2: str) -> float:
        """
        语义相似度（70% 权重）

        Args:
            text1: 文本1
            text2: 文本2

        Returns:
            float: 语义相似度分数（0.0 - 1.0）

        实现方案：
        - 优先使用 sentence-transformers 库（本地模型）
        - 如果不可用，降级为简单的字符重叠度计算
        """
        if not text1 or not text2:
            return 0.0

        # 尝试使用 sentence-transformers
        if self.semantic_model is not None:
            try:
                return self._calculate_transformer_similarity(text1, text2)
            except Exception:
                pass

        # 降级为简单计算
        return self._simple_semantic_similarity(text1, text2)

    def _calculate_transformer_similarity(self, text1: str, text2: str) -> float:
        """
        使用 sentence-transformers 计算语义相似度

        Args:
            text1: 文本1
            text2: 文本2

        Returns:
            float: 语义相似度（0.0 - 1.0）
        """
        # 编码文本
        embeddings = self.semantic_model.encode([text1, text2])

        # 计算余弦相似度
        from numpy import dot
        from numpy.linalg import norm

        similarity = dot(embeddings[0], embeddings[1]) / (norm(embeddings[0]) * norm(embeddings[1]))

        # 归一化到 0-1 范围
        return (similarity + 1) / 2

    def _simple_semantic_similarity(self, text1: str, text2: str) -> float:
        """
        简单语义相似度计算（降级方案）

        Args:
            text1: 文本1
            text2: 文本2

        Returns:
            float: 相似度（0.0 - 1.0）
        """
        # 字符级重叠度
        chars1 = set(text1)
        chars2 = set(text2)

        if not chars1 or not chars2:
            return 0.0

        intersection = len(chars1 & chars2)
        union = len(chars1 | chars2)

        if union == 0:
            return 0.0

        return intersection / union

    def _simple_tokenize(self, text: str) -> List[str]:
        """
        简单分词

        Args:
            text: 文本

        Returns:
            List[str]: 分词结果
        """
        # 移除标点符号
        text = re.sub(r'[^\w\s]', '', text)

        # 按空格分割
        words = text.split()

        # 提取 2-4 字的词组
        ngrams = []
        for word in words:
            if len(word) >= 2:
                ngrams.append(word)
                # 添加 2-gram
                for i in range(len(word) - 1):
                    ngrams.append(word[i:i+2])

        return ngrams

    def _try_load_semantic_model(self):
        """
        尝试加载语义模型

        如果 sentence-transformers 不可用，降级为简单计算
        """
        try:
            from sentence_transformers import SentenceTransformer
            self.semantic_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        except ImportError:
            self.semantic_model = None
        except Exception:
            self.semantic_model = None

    def _load_persona(self) -> dict:
        """
        加载 crush 角色档案

        Returns:
            dict: 角色档案数据
        """
        persona_path = self.base_dir / "crushes" / self.crush_slug / "persona.md"

        if not persona_path.exists():
            return {}

        try:
            # 简单解析 persona.md（提取关键信息）
            content = persona_path.read_text(encoding="utf-8")
            return self._parse_persona(content)
        except Exception:
            return {}

    def _parse_persona(self, content: str) -> dict:
        """
        解析 persona.md 内容

        Args:
            content: persona.md 内容

        Returns:
            dict: 解析后的数据
        """
        result = {
            "crush_replies": [],
            "personality": [],
            "behavior_patterns": []
        }

        # 提取说话习惯（对应 crush_replies）
        replies_match = re.search(r'##\s*说话习惯.*?\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if replies_match:
            replies_text = replies_match.group(1)
            result["crush_replies"] = self._extract_list_items(replies_text)

        # 提取情绪模式（对应 personality）
        personality_match = re.search(r'##\s*情绪模式.*?\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if personality_match:
            personality_text = personality_match.group(1)
            result["personality"] = self._extract_list_items(personality_text)

        # 提取行为偏好（对应 behavior_patterns）
        behavior_match = re.search(r'##\s*行为偏好.*?\n(.*?)(?=\n##|\Z)', content, re.DOTALL)
        if behavior_match:
            behavior_text = behavior_match.group(1)
            result["behavior_patterns"] = self._extract_list_items(behavior_text)

        return result

    def _extract_list_items(self, text: str) -> List[str]:
        """
        提取列表项

        Args:
            text: 文本内容

        Returns:
            List[str]: 列表项
        """
        items = []
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith('- ') or line.startswith('* '):
                items.append(line[2:].strip())
            elif line.startswith('「') and line.endswith('」'):
                items.append(line[1:-1])

        return items

    def _get_candidates(self) -> List[dict]:
        """
        获取候选回复

        Returns:
            List[dict]: 候选回复列表
                - content: 回复内容
                - source: 来源

        来源：
        1. persona.md 中的 crush_replies
        2. persona.md 中的 personality
        3. persona.md 中的 behavior_patterns
        """
        candidates = []

        # 常见回复（最高优先级）
        for reply in self.persona.get("crush_replies", []):
            candidates.append({
                "content": reply,
                "source": "crush_replies"
            })

        # 性格特征
        for trait in self.persona.get("personality", []):
            candidates.append({
                "content": trait,
                "source": "personality"
            })

        # 行为模式
        for pattern in self.persona.get("behavior_patterns", []):
            candidates.append({
                "content": pattern,
                "source": "behavior_patterns"
            })

        return candidates

    def get_default_reply(self) -> str:
        """
        获取默认回复（无匹配时使用）

        Returns:
            str: 默认回复
        """
        return "ta只是想和你聊天，这是ta表达亲近的方式"

    def is_semantic_available(self) -> bool:
        """
        检查语义模型是否可用

        Returns:
            bool: 是否可用
        """
        return self.semantic_model is not None


if __name__ == "__main__":
    # 测试 Blind 匹配器
    print("=== Blind 匹配器测试 ===")

    matcher = BlindMatcher("example")

    # 测试匹配
    user_input = "ta今天发了一个表情包，我不知道ta是什么意思"
    print(f"\n用户输入: {user_input}")

    results = matcher.match_replies(user_input, limit=3, threshold=0.5)
    print(f"匹配结果: {results}")

    # 测试无匹配
    user_input_no_match = "今天天气真好"
    print(f"\n用户输入: {user_input_no_match}")

    results_no_match = matcher.match_replies(user_input_no_match, limit=1, threshold=0.6)
    print(f"匹配结果: {results_no_match}")

    # 测试默认回复
    print(f"\n默认回复: {matcher.get_default_reply()}")

    # 测试语义模型可用性
    print(f"\n语义模型可用: {matcher.is_semantic_available()}")

    # 测试关键词匹配
    print(f"\n--- 关键词匹配测试 ---")
    print(f"相似文本: {matcher._keyword_match('ta发了一个表情包', 'ta发了一个可爱的表情包')}")
    print(f"不相似文本: {matcher._keyword_match('ta发了一个表情包', '今天天气真好')}")

    print("\n=== 测试完成 ===")
