#!/usr/bin/env python3
"""
fragment_prompt_generator.py - 碎片 Prompt 生成器

功能 / Functions:
    - 单碎片 Prompt 生成
    - 多碎片整合 Prompt 生成
    - 来源合并、情绪处理、内容拼接
    - 占位符填充
"""

from typing import List, Optional

from fragment_models import Fragment, FragmentDay


class FragmentPromptGenerator:
    """
    碎片 Prompt 生成器

    完整 Prompt 矩阵（3来源 × 4情绪 + 跳过 = 13种组合）
    """

    # 完整 Prompt 矩阵（3来源 × 4情绪 + 跳过 = 13种组合）
    PROMPT_MATRIX = {
        ("user", "positive"): "记录一下，今天我给ta发了什么",
        ("user", "negative"): "今天我给ta发了什么，让ta在意了？",
        ("user", "neutral"): "今天我给ta发了什么？",
        ("user", "mixed"): "今天我给ta发了什么，心情复杂",
        ("user", None): "记录一下，今天我给ta发了什么",  # 跳过情绪
        ("crush", "positive"): "ta今天说了什么让你开心的话？",
        ("crush", "negative"): "ta今天说了什么让你在意的话？",
        ("crush", "neutral"): "ta今天说了什么？",
        ("crush", "mixed"): "ta今天说了什么，心情复杂",
        ("crush", None): "ta今天说了什么？",  # 跳过情绪
        ("ambient", "positive"): "在【环境】时，看到ta的【行为】，感到开心",
        ("ambient", "negative"): "在【环境】时，看到ta的【行为】，感到在意",
        ("ambient", "neutral"): "在【环境】时，看到ta的【行为】",
        ("ambient", "mixed"): "在【环境】时，看到ta的【行为】，心情复杂",
        ("ambient", None): "在【环境】时，看到ta的【行为】",  # 跳过情绪
    }

    # 情绪修饰符
    MOOD_MODIFIERS = {
        "positive": "开心",
        "negative": "在意",
        "neutral": "日常",
        "mixed": "心情复杂"
    }

    # 方向 Prompt
    DIRECTION_PROMPTS = {
        "轻松的": "记录一些日常小事",
        "有些在意的": "说说那些让你在意的事",
        "想深入的": "展开聊聊这个话题"
    }

    # 方向→情绪推荐映射
    DIRECTION_MOOD_MAP = {
        "轻松的": "positive",
        "有些在意的": "negative",
        "想深入的": "mixed"
    }

    # 主题 Prompt
    THEME_PROMPTS = {
        "工作/学习": "与工作、学习相关的互动",
        "生活日常": "日常生活中的小事",
        "约会/出行": "约会、外出相关的场景",
        "情感交流": "深入的情感对话",
        "兴趣爱好": "与兴趣、爱好相关",
        "节日/纪念日": "节日、纪念日相关",
        "争吵/误会": "冲突、误会相关",
        "和好/道歉": "和好、道歉相关"
    }

    # 内容拼接连接符
    CONNECTORS = ["，然后", "，接着", "，同时", "，另外"]

    # 最大内容长度
    MAX_TOTAL_LENGTH = 1000

    def generate_single_fragment_prompt(self, fragment: Fragment, direction: Optional[str] = None) -> str:
        """
        生成单碎片 Prompt

        Args:
            fragment: 碎片数据
            direction: guided 模式方向

        Returns:
            str: 生成的 Prompt

        模式处理：
        - Raw：base_prompt(origin) + [mood_modifier(mood)]
        - Guided：direction_prompt(direction) + [mood_modifier(mood)]
        - Themed：theme_prompt(theme) + base_prompt(origin) + mood_modifier(mood)
        - Blind：base_prompt(origin) + mood_modifier(mood) + 盲写特殊处理
        """
        mode = fragment.writing_mode

        if mode == "guided" and direction:
            # Guided 模式：使用方向 Prompt
            prompt = self.DIRECTION_PROMPTS.get(direction, "")
            if fragment.mood:
                prompt += f"，{self.MOOD_MODIFIERS[fragment.mood]}"
            return prompt

        elif mode == "themed" and fragment.theme:
            # Themed 模式：使用主题 Prompt
            theme_prompt = self.THEME_PROMPTS.get(fragment.theme, "")
            base_prompt = self._get_base_prompt(fragment.origin, fragment.mood)
            return f"{theme_prompt}。{base_prompt}"

        elif mode == "blind":
            # Blind 模式：基础 Prompt + 盲写特殊处理
            base_prompt = self._get_base_prompt(fragment.origin, fragment.mood)
            return f"{base_prompt}（盲写模式，隐藏对话历史）"

        else:
            # Raw 模式：基础 Prompt
            return self._get_base_prompt(fragment.origin, fragment.mood)

    def generate_multi_fragment_prompt(self, fragments: List[Fragment], direction: Optional[str] = None) -> str:
        """
        生成多碎片整合 Prompt

        Args:
            fragments: 碎片列表
            direction: guided 模式方向

        Returns:
            str: 生成的 Prompt

        处理逻辑：
        1. 来源合并：所有来源，按时间顺序排列
        2. 情绪处理：
           - 情绪相同：使用该情绪
           - 情绪不同：使用 mixed
           - 有情绪 + 跳过：以有情绪的碎片统计主导情绪
           - 单个有效情绪：直接使用该情绪
           - 全是跳过：无情绪修饰
        3. 内容拼接：按时间顺序，使用连接符
        4. 长度控制：超过 1000 字自动压缩
        """
        if not fragments:
            return ""

        if len(fragments) == 1:
            return self.generate_single_fragment_prompt(fragments[0], direction)

        # 来源合并
        origins = self._merge_origins(fragments)

        # 情绪处理
        mood = self._merge_moods(fragments)

        # 内容拼接
        content = self._concat_contents(fragments)

        # 生成 Prompt
        if direction and direction in self.DIRECTION_PROMPTS:
            # Guided 模式
            prompt = self.DIRECTION_PROMPTS[direction]
            if mood:
                prompt += f"，{self.MOOD_MODIFIERS[mood]}"
        else:
            # 非 Guided 模式
            origin_prompts = [self._get_base_prompt(o, mood) for o in origins]
            prompt = " + ".join(origin_prompts)

        # 添加内容
        if content:
            prompt += f"\n\n{content}"

        return prompt

    def _get_base_prompt(self, origin: str, mood: Optional[str]) -> str:
        """
        获取基础 Prompt

        Args:
            origin: 来源
            mood: 情绪

        Returns:
            str: 基础 Prompt
        """
        return self.PROMPT_MATRIX.get((origin, mood), "")

    def _merge_origins(self, fragments: List[Fragment]) -> List[str]:
        """
        合并多个碎片的来源

        Args:
            fragments: 碎片列表

        Returns:
            List[str]: 去重后的来源列表（保持顺序）

        规则：使用所有来源，按输入顺序排列，去重
        """
        seen = set()
        origins = []

        for f in fragments:
            if f.origin not in seen:
                seen.add(f.origin)
                origins.append(f.origin)

        return origins

    def _merge_moods(self, fragments: List[Fragment]) -> Optional[str]:
        """
        合并多个碎片的情绪

        Args:
            fragments: 碎片列表

        Returns:
            Optional[str]: 合并后的情绪（None 表示全部跳过）

        规则：
        1. 过滤跳过的碎片（mood=None）
        2. 情绪相同：使用该情绪
        3. 情绪不同：使用 mixed
        4. 全是跳过：返回 None
        5. 单个有效情绪：直接使用该情绪
        """
        moods = [f.mood for f in fragments if f.mood is not None]

        if not moods:
            return None  # 全是跳过

        if len(moods) == 1:
            return moods[0]  # 单个有效情绪

        unique_moods = set(moods)

        if len(unique_moods) == 1:
            return moods[0]  # 情绪相同
        else:
            return "mixed"  # 情绪不同

    def _concat_contents(self, fragments: List[Fragment]) -> str:
        """
        拼接多个碎片的内容

        Args:
            fragments: 碎片列表

        Returns:
            str: 拼接后的内容

        规则：
        1. 按时间顺序拼接
        2. 使用连接符（，然后、，接着、，同时、，另外）
        3. 跳过空内容碎片
        4. 超过 1000 字自动压缩
        """
        # 过滤空内容碎片
        contents = [f.content for f in fragments if f.content and f.content.strip()]

        if not contents:
            return ""

        if len(contents) == 1:
            return contents[0]

        # 拼接内容
        result = contents[0]
        for i, content in enumerate(contents[1:], 1):
            connector = self.CONNECTORS[(i - 1) % len(self.CONNECTORS)]
            result += f"{connector}{content}"

        # 长度控制
        if len(result) > self.MAX_TOTAL_LENGTH:
            result = self._compress_content(result, self.MAX_TOTAL_LENGTH)

        return result

    def _compress_content(self, content: str, max_length: int) -> str:
        """
        压缩内容

        Args:
            content: 原始内容
            max_length: 最大长度

        Returns:
            str: 压缩后的内容

        策略：
        1. 保留每个碎片的核心信息
        2. 删除细节描述
        3. 跨天整合时优先保留当前日期碎片
        """
        if len(content) <= max_length:
            return content

        # 简单截断（后续可以优化为智能摘要）
        return content[:max_length - 3] + "..."


if __name__ == "__main__":
    # 测试 Prompt 生成器
    print("=== Prompt 生成器测试 ===")

    generator = FragmentPromptGenerator()

    # 测试单碎片 Prompt
    fragment = Fragment(
        id="frag_20260530_143000_a1b2",
        date="2026-05-30",
        time="14:30",
        origin="crush",
        mood="positive",
        content="ta发了一个表情包",
        env_tags=["工作"],
        behavior_tags=[],
        custom_tags=["可爱"],
        writing_mode="raw",
        theme=None,
        crush_slug="example",
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )

    print(f"\n单碎片 Prompt（Raw）:")
    print(generator.generate_single_fragment_prompt(fragment))

    # 测试 Guided 模式
    fragment.writing_mode = "guided"
    print(f"\n单碎片 Prompt（Guided，轻松的）:")
    print(generator.generate_single_fragment_prompt(fragment, "轻松的"))

    # 测试 Themed 模式
    fragment.writing_mode = "themed"
    fragment.theme = "约会/出行"
    print(f"\n单碎片 Prompt（Themed，约会/出行）:")
    print(generator.generate_single_fragment_prompt(fragment))

    # 测试 Blind 模式
    fragment.writing_mode = "blind"
    print(f"\n单碎片 Prompt（Blind）:")
    print(generator.generate_single_fragment_prompt(fragment))

    # 测试多碎片 Prompt
    fragments = [
        Fragment(
            id="frag_20260530_143000_a1b2",
            date="2026-05-30",
            time="14:30",
            origin="user",
            mood="positive",
            content="我给ta发了一个可爱的表情包",
            env_tags=[],
            behavior_tags=[],
            custom_tags=[],
            writing_mode="raw",
            theme=None,
            crush_slug="example",
            created_at="2026-05-30T14:30:00",
            updated_at="2026-05-30T14:30:00"
        ),
        Fragment(
            id="frag_20260530_150000_c3d4",
            date="2026-05-30",
            time="15:00",
            origin="crush",
            mood="neutral",
            content='ta回了一个"嗯"',
            env_tags=[],
            behavior_tags=[],
            custom_tags=[],
            writing_mode="raw",
            theme=None,
            crush_slug="example",
            created_at="2026-05-30T15:00:00",
            updated_at="2026-05-30T15:00:00"
        )
    ]

    print(f"\n多碎片 Prompt:")
    print(generator.generate_multi_fragment_prompt(fragments))

    # 测试情绪合并
    print(f"\n情绪合并测试:")
    print(f"positive + neutral: {generator._merge_moods(fragments)}")

    fragments[1].mood = "positive"
    print(f"positive + positive: {generator._merge_moods(fragments)}")

    fragments[1].mood = None
    print(f"positive + None: {generator._merge_moods(fragments)}")

    fragments[0].mood = None
    print(f"None + None: {generator._merge_moods(fragments)}")

    # 测试碎片描述生成（替代已废弃的占位符填充）
    print(f"\n碎片描述生成测试:")
    print(f"描述: {generator._generate_fragment_description(fragment)}")

    print("\n=== 测试完成 ===")
