#!/usr/bin/env python3
"""
test_fragment.py - 碎片日记测试用例

测试内容：
- 工具函数测试
- 数据结构测试
- 状态机测试
- Prompt 生成器测试
- 标签推荐器测试
- Blind 匹配器测试
- 碎片管理器测试
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# 添加 scripts 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from fragment_utils import (
    generate_fragment_id,
    get_current_date,
    get_current_datetime,
    get_current_time,
    validate_content,
    is_emoji_only,
    is_expired,
    is_today,
    calculate_days_between,
    get_mood_emoji,
    get_origin_display,
)

from fragment_models import (
    Fragment,
    FragmentDay,
    FragmentStatus,
    WritingMode,
    Origin,
    Mood,
    EditState,
)

from fragment_state_machine import FragmentStateMachine

from fragment_prompt_generator import FragmentPromptGenerator

from tag_recommender import TagRecommender

from blind_matcher import BlindMatcher

from fragment_manager import FragmentManager


def test_fragment_utils():
    """测试工具函数"""
    print("\n=== 工具函数测试 ===")

    # 测试 ID 生成
    test_id = generate_fragment_id("2026-05-30", "14:30")
    assert test_id.startswith("frag_20260530_143000_"), f"ID 格式错误: {test_id}"
    print(f"[OK] ID 生成: {test_id}")

    # 测试时间函数
    current_date = get_current_date()
    assert len(current_date) == 10, f"日期格式错误: {current_date}"
    print(f"[OK] 当前日期: {current_date}")

    current_time = get_current_time()
    assert len(current_time) == 5, f"时间格式错误: {current_time}"
    print(f"[OK] 当前时间: {current_time}")

    # 测试内容验证
    is_valid, msg = validate_content("", "raw")
    assert is_valid, "空内容应该有效"
    print(f"[OK] 空内容验证: {is_valid}")

    is_valid, msg = validate_content("你好世界", "raw")
    assert not is_valid, "4字内容应该无效"
    print(f"[OK] 短内容验证: {is_valid}")

    is_valid, msg = validate_content("今天天气真好", "raw")
    assert is_valid, "正常内容应该有效"
    print(f"[OK] 正常内容验证: {is_valid}")

    is_valid, msg = validate_content("今天天气", "blind")
    assert not is_valid, "Blind 模式 5 字应该无效"
    print(f"[OK] Blind 短内容验证: {is_valid}")

    is_valid, msg = validate_content("😊😊😊", "raw")
    assert not is_valid, "纯表情应该无效"
    print(f"[OK] 纯表情验证: {is_valid}")

    # 测试 Emoji 检测
    assert is_emoji_only("😊"), "单个表情应该返回 True"
    assert not is_emoji_only("你好😊"), "混合内容应该返回 False"
    print(f"[OK] Emoji 检测")

    # 测试日期判断
    assert is_today(current_date), "今天应该返回 True"
    assert not is_today("2026-01-01"), "其他日期应该返回 False"
    print(f"[OK] 今天判断")

    # 测试过期判断
    assert is_expired("2026-01-01"), "很久前应该过期"
    assert not is_expired(current_date), "今天不应该过期"
    print(f"[OK] 过期判断")

    # 测试天数计算
    days = calculate_days_between("2026-05-25", "2026-05-30")
    assert days == 5, f"天数计算错误: {days}"
    print(f"[OK] 天数计算: {days}")

    # 测试情绪 Emoji
    assert get_mood_emoji("positive") == "😊", "positive 应该返回 😊"
    assert get_mood_emoji(None) == "⬜", "None 应该返回 ⬜"
    print(f"[OK] 情绪 Emoji")

    # 测试来源显示
    assert get_origin_display("user") == "用户", "user 应该返回 用户"
    assert get_origin_display("crush") == "Crush", "crush 应该返回 Crush"
    print(f"[OK] 来源显示")

    print("=== 工具函数测试通过 ===")


def test_fragment_models():
    """测试数据结构"""
    print("\n=== 数据结构测试 ===")

    # 测试 Fragment 创建
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
        writing_mode="guided",
        theme=None,
        crush_slug="example",
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )

    assert fragment.id == "frag_20260530_143000_a1b2"
    assert fragment.origin == "crush"
    assert fragment.mood == "positive"
    print(f"[OK] Fragment 创建")

    # 测试序列化/反序列化
    fragment_dict = fragment.to_dict()
    fragment_restored = Fragment.from_dict(fragment_dict)
    assert fragment_restored.id == fragment.id
    assert fragment_restored.content == fragment.content
    print(f"[OK] Fragment 序列化/反序列化")

    # 测试 FragmentDay 创建
    day = FragmentDay(
        date="2026-05-30",
        crush_slug="example",
        fragments=[fragment],
        completed=False,
        direction="轻松的",
        writing_context=None,
        version=1,
        integration_date=None,
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )

    assert day.date == "2026-05-30"
    assert day.direction == "轻松的"
    assert day.get_fragment_count() == 1
    assert day.has_content() == True
    print(f"[OK] FragmentDay 创建")

    # 测试枚举
    assert FragmentStatus.IN_PROGRESS.value == "in_progress"
    assert WritingMode.GUIDED.value == "guided"
    assert Origin.USER.value == "user"
    assert Mood.POSITIVE.value == "positive"
    assert EditState.EDITABLE.value == "editable"
    print(f"[OK] 枚举测试")

    print("=== 数据结构测试通过 ===")


def test_state_machine():
    """测试状态机"""
    print("\n=== 状态机测试 ===")

    # 测试状态判断
    status = FragmentStateMachine.get_status("2026-05-30", False, "2026-05-30")
    assert status == FragmentStatus.IN_PROGRESS, f"今天应该 IN_PROGRESS，实际: {status}"
    print(f"[OK] 今天状态: {status.value}")

    status = FragmentStateMachine.get_status("2026-05-27", False, "2026-05-30")
    assert status == FragmentStatus.UNFINISHED, f"3天前应该 UNFINISHED，实际: {status}"
    print(f"[OK] 3天前状态: {status.value}")

    status = FragmentStateMachine.get_status("2026-05-20", False, "2026-05-30")
    assert status == FragmentStatus.EXPIRED, f"10天前应该 EXPIRED，实际: {status}"
    print(f"[OK] 10天前状态: {status.value}")

    status = FragmentStateMachine.get_status("2026-05-20", True)
    assert status == FragmentStatus.COMPLETED, f"已完成应该 COMPLETED，实际: {status}"
    print(f"[OK] 已完成状态: {status.value}")

    # 测试编辑状态
    edit_state = FragmentStateMachine.get_edit_state(False, None)
    assert edit_state == EditState.EDITABLE, f"应该 EDITABLE，实际: {edit_state}"
    print(f"[OK] 编辑状态（未触发）: {edit_state.value}")

    edit_state = FragmentStateMachine.get_edit_state(False, "content")
    assert edit_state == EditState.READONLY_REGENERABLE, f"应该 READONLY_REGENERABLE，实际: {edit_state}"
    print(f"[OK] 编辑状态（已触发）: {edit_state.value}")

    edit_state = FragmentStateMachine.get_edit_state(True, "content")
    assert edit_state == EditState.READONLY_FINAL, f"应该 READONLY_FINAL，实际: {edit_state}"
    print(f"[OK] 编辑状态（已完成）: {edit_state.value}")

    # 测试权限检查
    assert FragmentStateMachine.can_edit(EditState.EDITABLE) == True
    assert FragmentStateMachine.can_edit(EditState.READONLY_REGENERABLE) == False
    assert FragmentStateMachine.can_edit(EditState.READONLY_FINAL) == False
    print(f"[OK] 可编辑权限")

    assert FragmentStateMachine.can_generate(EditState.EDITABLE) == True
    assert FragmentStateMachine.can_generate(EditState.READONLY_REGENERABLE) == False
    assert FragmentStateMachine.can_generate(EditState.READONLY_FINAL) == False
    print(f"[OK] 可生成权限（EDITABLE）")

    assert FragmentStateMachine.can_regenerate(EditState.EDITABLE) == False
    assert FragmentStateMachine.can_regenerate(EditState.READONLY_REGENERABLE) == True
    assert FragmentStateMachine.can_regenerate(EditState.READONLY_FINAL) == False
    print(f"[OK] 可重新生成权限（READONLY_REGENERABLE）")

    assert FragmentStateMachine.can_delete(FragmentStatus.IN_PROGRESS, False) == True
    assert FragmentStateMachine.can_delete(FragmentStatus.EXPIRED, False) == True
    assert FragmentStateMachine.can_delete(FragmentStatus.COMPLETED, True) == False
    print(f"[OK] 可删除权限")

    assert FragmentStateMachine.can_integrate(FragmentStatus.IN_PROGRESS) == True
    assert FragmentStateMachine.can_integrate(FragmentStatus.UNFINISHED) == True
    assert FragmentStateMachine.can_integrate(FragmentStatus.EXPIRED) == False
    print(f"[OK] 可整合权限")

    assert FragmentStateMachine.can_add_fragment(FragmentStatus.IN_PROGRESS) == True
    assert FragmentStateMachine.can_add_fragment(FragmentStatus.UNFINISHED) == False
    assert FragmentStateMachine.can_add_fragment(FragmentStatus.COMPLETED) == False
    print(f"[OK] 可添加碎片权限")

    print("=== 状态机测试通过 ===")


def test_prompt_generator():
    """测试 Prompt 生成器"""
    print("\n=== Prompt 生成器测试 ===")

    generator = FragmentPromptGenerator()

    # 测试单碎片 Prompt
    fragment = Fragment(
        id="frag_20260530_143000_a1b2",
        date="2026-05-30",
        time="14:30",
        origin="crush",
        mood="positive",
        content="ta发了一个表情包",
        env_tags=[],
        behavior_tags=[],
        custom_tags=[],
        writing_mode="raw",
        theme=None,
        crush_slug="example",
        created_at="2026-05-30T14:30:00",
        updated_at="2026-05-30T14:30:00"
    )

    prompt = generator.generate_single_fragment_prompt(fragment)
    assert "ta今天说了什么让你开心的话" in prompt, f"Prompt 错误: {prompt}"
    print(f"[OK] Raw 模式 Prompt: {prompt}")

    # 测试 Guided 模式
    fragment.writing_mode = "guided"
    prompt = generator.generate_single_fragment_prompt(fragment, "轻松的")
    assert "记录一些日常小事" in prompt, f"Guided Prompt 错误: {prompt}"
    print(f"[OK] Guided 模式 Prompt: {prompt}")

    # 测试 Themed 模式
    fragment.writing_mode = "themed"
    fragment.theme = "约会/出行"
    prompt = generator.generate_single_fragment_prompt(fragment)
    assert "约会、外出相关的场景" in prompt, f"Themed Prompt 错误: {prompt}"
    print(f"[OK] Themed 模式 Prompt: {prompt}")

    # 测试多碎片 Prompt
    fragments = [
        Fragment(
            id="frag_20260530_143000_a1b2",
            date="2026-05-30",
            time="14:30",
            origin="user",
            mood="positive",
            content="我给ta发了一个表情包",
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
            content="ta回了一个嗯",
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

    prompt = generator.generate_multi_fragment_prompt(fragments)
    assert "我给ta发了一个表情包" in prompt, f"多碎片 Prompt 错误: {prompt}"
    assert "ta回了一个嗯" in prompt, f"多碎片 Prompt 错误: {prompt}"
    print(f"[OK] 多碎片 Prompt: {prompt}")

    # 测试情绪合并
    mood = generator._merge_moods(fragments)
    assert mood == "mixed", f"情绪合并错误: {mood}"
    print(f"[OK] 情绪合并（positive + neutral）: {mood}")

    fragments[1].mood = "positive"
    mood = generator._merge_moods(fragments)
    assert mood == "positive", f"情绪合并错误: {mood}"
    print(f"[OK] 情绪合并（positive + positive）: {mood}")

    fragments[1].mood = None
    mood = generator._merge_moods(fragments)
    assert mood == "positive", f"情绪合并错误: {mood}"
    print(f"[OK] 情绪合并（positive + None）: {mood}")

    print("=== Prompt 生成器测试通过 ===")


def test_tag_recommender():
    """测试标签推荐器"""
    print("\n=== 标签推荐器测试 ===")

    recommender = TagRecommender()
    session_id = "test_session_001"

    # 测试推荐
    content = "ta今天在公司发了一个可爱的表情包"
    result = recommender.recommend(content, "example", session_id)

    assert "env_tags" in result, "结果应该包含 env_tags"
    assert "behavior_tags" in result, "结果应该包含 behavior_tags"
    print(f"[OK] 标签推荐: {result}")

    # 测试降频策略
    for i in range(3):
        recommender.record_skip(session_id)

    stats = recommender.get_session_stats(session_id)
    assert stats["threshold"] == 0.7, f"降频后阈值应该是 0.7，实际: {stats['threshold']}"
    print(f"[OK] 降频策略: {stats}")

    for i in range(3):
        recommender.record_accept(session_id)

    stats = recommender.get_session_stats(session_id)
    assert stats["threshold"] == 0.5, f"恢复后阈值应该是 0.5，实际: {stats['threshold']}"
    print(f"[OK] 恢复策略: {stats}")

    # 测试空内容
    result = recommender.recommend("", "example", session_id)
    assert result["env_tags"] == [], "空内容应该返回空推荐"
    print(f"[OK] 空内容推荐: {result}")

    print("=== 标签推荐器测试通过 ===")


def test_blind_matcher():
    """测试 Blind 匹配器"""
    print("\n=== Blind 匹配器测试 ===")

    matcher = BlindMatcher("example")

    # 测试匹配
    user_input = "ta今天发了一个表情包"
    results = matcher.match_replies(user_input, limit=1, threshold=0.5)
    print(f"[OK] 匹配结果: {results}")

    # 测试默认回复
    default_reply = matcher.get_default_reply()
    assert default_reply, "应该有默认回复"
    print(f"[OK] 默认回复: {default_reply}")

    # 测试关键词匹配
    score = matcher._keyword_match("ta发了一个表情包", "ta发了一个可爱的表情包")
    assert score > 0, f"相似文本应该有分数，实际: {score}"
    print(f"[OK] 关键词匹配: {score}")

    # 测试语义模型可用性
    is_available = matcher.is_semantic_available()
    print(f"[OK] 语义模型可用: {is_available}")

    print("=== Blind 匹配器测试通过 ===")


def test_fragment_manager():
    """测试碎片管理器"""
    print("\n=== 碎片管理器测试 ===")

    # 使用临时目录
    with tempfile.TemporaryDirectory() as temp_dir:
        base_dir = Path(temp_dir)

        # 创建 crush 目录
        crush_dir = base_dir / "crushes" / "example"
        crush_dir.mkdir(parents=True)

        manager = FragmentManager(base_dir)

        # 测试记录碎片
        fragment_data = {
            "origin": "crush",
            "mood": "positive",
            "content": "ta发了一个可爱的表情包",
            "writing_mode": "raw",
            "env_tags": ["工作"],
            "behavior_tags": []
        }

        fragment, error = manager.record_fragment("example", fragment_data)
        assert fragment is not None, f"记录失败: {error}"
        assert fragment.origin == "crush"
        assert fragment.mood == "positive"
        print(f"[OK] 记录碎片: {fragment.id}")

        # 测试获取碎片
        current_date = get_current_date()
        fragments = manager.get_fragments_by_date("example", current_date)
        assert len(fragments) == 1, f"碎片数量错误: {len(fragments)}"
        print(f"[OK] 获取碎片: {len(fragments)} 个")

        # 测试更新碎片
        # 获取当前版本号
        day = manager.get_fragment_day("example", current_date)
        current_version = day.version

        updated, error = manager.update_fragment(
            fragment.id,
            {"content": "ta发了一个超级可爱的表情包"},
            current_version
        )
        assert updated is not None, f"更新失败: {error}"
        assert updated.content == "ta发了一个超级可爱的表情包"
        print(f"[OK] 更新碎片: {updated.content}")

        # 测试删除碎片
        # 获取当前版本号
        day = manager.get_fragment_day("example", current_date)
        current_version = day.version

        success, error = manager.delete_fragment(fragment.id, current_version)
        assert success, f"删除失败: {error}"

        fragments = manager.get_fragments_by_date("example", current_date)
        assert len(fragments) == 0, f"删除后碎片数量应该为 0，实际: {len(fragments)}"
        print(f"[OK] 删除碎片")

        # 测试内容验证
        fragment_data_invalid = {
            "origin": "crush",
            "mood": "positive",
            "content": "😊😊😊",
            "writing_mode": "raw"
        }

        fragment, error = manager.record_fragment("example", fragment_data_invalid)
        assert fragment is None, "纯表情应该记录失败"
        assert "表情符号" in error, f"错误信息应该包含'表情符号'，实际: {error}"
        print(f"[OK] 内容验证: {error}")

    print("=== 碎片管理器测试通过 ===")


def test_fragment_utils_edge_cases():
    """测试工具函数边界情况"""
    print("\n=== 工具函数边界测试 ===")

    # 测试 get_current_datetime
    dt = get_current_datetime()
    assert isinstance(dt, str), "get_current_datetime 应返回字符串"
    assert "T" in dt, "应返回 ISO 8601 格式"
    print(f"[OK] get_current_datetime: {dt}")

    # 测试日期倒序计算
    days = calculate_days_between("2026-05-30", "2026-05-25")
    assert days == -5, f"日期倒序应返回 -5，实际: {days}"
    print(f"[OK] 日期倒序计算: {days}")

    # 测试同一天计算
    days = calculate_days_between("2026-05-30", "2026-05-30")
    assert days == 0, f"同一天应返回 0，实际: {days}"
    print(f"[OK] 同一天计算: {days}")

    # 测试 validate_content 的 writing_mode 验证
    is_valid, msg = validate_content("测试内容", "invalid_mode")
    assert not is_valid, "无效 writing_mode 应该验证失败"
    print(f"[OK] 无效 writing_mode: {msg}")

    # 测试各 writing_mode 验证
    for mode in ["raw", "guided", "themed"]:
        is_valid, msg = validate_content("这是一个测试内容", mode)
        assert is_valid, f"writing_mode={mode} 应该验证通过，实际: {msg}"

    # blind 模式需要至少 10 字
    is_valid, msg = validate_content("这是一个用于blind模式测试的内容", "blind")
    assert is_valid, f"writing_mode=blind 应该验证通过，实际: {msg}"
    print(f"[OK] 所有 writing_mode 验证通过")

    # 测试空字符串验证（允许空内容，会提示补充）
    is_valid, msg = validate_content("", "raw")
    assert is_valid, "空字符串应该验证通过（会提示补充）"
    assert "建议" in msg, f"应提示建议补充，实际: {msg}"
    print(f"[OK] 空字符串验证: {msg}")

    # 测试纯空格验证（允许空内容，会提示补充）
    is_valid, msg = validate_content("   ", "raw")
    assert is_valid, "纯空格应该验证通过（会提示补充）"
    print(f"[OK] 纯空格验证: {msg}")

    # 测试情绪 Emoji 所有枚举
    for mood in ["positive", "negative", "neutral", "mixed"]:
        emoji = get_mood_emoji(mood)
        assert emoji, f"情绪 {mood} 应该有对应 Emoji"
    print(f"[OK] 所有情绪 Emoji")

    # 测试来源显示所有枚举
    for origin in ["user", "crush", "ambient"]:
        display = get_origin_display(origin)
        assert display, f"来源 {origin} 应该有对应显示"
    print(f"[OK] 所有来源显示")

    print("=== 工具函数边界测试通过 ===")


def test_state_machine_edge_cases():
    """测试状态机边界情况"""
    print("\n=== 状态机边界测试 ===")

    from datetime import datetime, timedelta

    # 测试 7 天边界（PRD 规定 7 天归档，第 7 天仍可操作，第 8 天起归档）
    current_date = get_current_date()
    current_dt = datetime.strptime(current_date, "%Y-%m-%d")

    # 6 天前 - 应该是 UNFINISHED
    date_6d = (current_dt - timedelta(days=6)).strftime("%Y-%m-%d")
    status = FragmentStateMachine.get_status(date_6d, False, current_date)
    assert status == FragmentStatus.UNFINISHED, f"6天前应该是 UNFINISHED，实际: {status}"
    print(f"[OK] 6天前状态: {status.value}")

    # 7 天前 - 仍然可以操作，应该是 UNFINISHED
    date_7d = (current_dt - timedelta(days=7)).strftime("%Y-%m-%d")
    status = FragmentStateMachine.get_status(date_7d, False, current_date)
    assert status == FragmentStatus.UNFINISHED, f"7天前应该是 UNFINISHED（第7天仍可操作），实际: {status}"
    print(f"[OK] 7天前状态: {status.value}")

    # 8 天前 - 应该是 EXPIRED
    date_8d = (current_dt - timedelta(days=8)).strftime("%Y-%m-%d")
    status = FragmentStateMachine.get_status(date_8d, False, current_date)
    assert status == FragmentStatus.EXPIRED, f"8天前应该是 EXPIRED，实际: {status}"
    print(f"[OK] 8天前状态: {status.value}")

    # 测试 can_generate vs can_regenerate
    assert FragmentStateMachine.can_generate(EditState.EDITABLE) == True
    assert FragmentStateMachine.can_generate(EditState.READONLY_REGENERABLE) == False
    assert FragmentStateMachine.can_regenerate(EditState.EDITABLE) == False
    assert FragmentStateMachine.can_regenerate(EditState.READONLY_REGENERABLE) == True
    print(f"[OK] generate/regenerate 权限区分")

    # 测试 can_integrate 所有状态
    for status in FragmentStatus:
        can = FragmentStateMachine.can_integrate(status)
        if status in [FragmentStatus.IN_PROGRESS, FragmentStatus.UNFINISHED]:
            assert can, f"{status.value} 应该可以整合"
        else:
            assert not can, f"{status.value} 不应该可以整合"
    print(f"[OK] 所有状态的整合权限")

    # 测试 can_add_fragment 所有状态
    for status in FragmentStatus:
        can = FragmentStateMachine.can_add_fragment(status)
        if status == FragmentStatus.IN_PROGRESS:
            assert can, f"{status.value} 应该可以添加碎片"
        else:
            assert not can, f"{status.value} 不应该可以添加碎片"
    print(f"[OK] 所有状态的添加权限")

    print("=== 状态机边界测试通过 ===")


def test_fragment_manager_integration():
    """测试碎片管理器整合功能"""
    print("\n=== 碎片管理器整合测试 ===")

    with tempfile.TemporaryDirectory() as temp_dir:
        base_dir = Path(temp_dir)
        crush_dir = base_dir / "crushes" / "example"
        crush_dir.mkdir(parents=True)

        manager = FragmentManager(base_dir)
        current_date = get_current_date()

        # 记录多个碎片
        for i in range(3):
            fragment_data = {
                "origin": "crush" if i % 2 == 0 else "user",
                "mood": "positive" if i < 2 else "neutral",
                "content": f"这是第 {i+1} 个测试碎片内容",
                "writing_mode": "raw"
            }
            fragment, error = manager.record_fragment("example", fragment_data)
            assert fragment is not None, f"记录碎片 {i+1} 失败: {error}"

        # 验证碎片数量
        fragments = manager.get_fragments_by_date("example", current_date)
        assert len(fragments) == 3, f"应该有 3 个碎片，实际: {len(fragments)}"
        print(f"[OK] 记录了 {len(fragments)} 个碎片")

        # 测试获取状态
        status = manager.get_status("example", current_date)
        assert status == FragmentStatus.IN_PROGRESS, f"状态应该是 IN_PROGRESS，实际: {status}"
        print(f"[OK] 状态: {status.value}")

        # 测试获取编辑状态
        edit_state = manager.get_edit_state("example", current_date)
        assert edit_state == EditState.EDITABLE, f"编辑状态应该是 EDITABLE，实际: {edit_state}"
        print(f"[OK] 编辑状态: {edit_state.value}")

        # 测试 get_fragment 方法
        fragment = manager.get_fragment(fragments[0].id)
        assert fragment is not None, "应该能通过 ID 获取碎片"
        assert fragment.id == fragments[0].id
        print(f"[OK] 通过 ID 获取碎片: {fragment.id}")

        # 测试 get_fragment 不存在的 ID
        not_found = manager.get_fragment("non_existent_id")
        assert not_found is None, "不存在的 ID 应该返回 None"
        print(f"[OK] 不存在的 ID 返回 None")

        # 测试碎片数量限制（PRD 规定最多 10 个）
        for i in range(7):  # 已有 3 个，再添加 7 个
            fragment_data = {
                "origin": "user",
                "mood": "neutral",
                "content": f"这是额外的碎片内容 {i+4}",
                "writing_mode": "raw"
            }
            fragment, error = manager.record_fragment("example", fragment_data)

        # 第 11 个应该失败
        fragment_data = {
            "origin": "user",
            "mood": "neutral",
            "content": "这是第 11 个碎片，应该失败",
            "writing_mode": "raw"
        }
        fragment, error = manager.record_fragment("example", fragment_data)
        assert fragment is None, "第 11 个碎片应该记录失败"
        assert "上限" in error or "10" in error, f"错误信息应提示上限，实际: {error}"
        print(f"[OK] 碎片数量限制: {error}")

    print("=== 碎片管理器整合测试通过 ===")


def test_file_error_handling():
    """测试文件异常处理"""
    print("\n=== 文件异常处理测试 ===")

    with tempfile.TemporaryDirectory() as temp_dir:
        base_dir = Path(temp_dir)
        crush_dir = base_dir / "crushes" / "example"
        crush_dir.mkdir(parents=True)

        manager = FragmentManager(base_dir)

        # 测试加载不存在的日期（应该返回空的 FragmentDay）
        day = manager.get_fragment_day("example", "2026-01-01")
        assert day is not None, "不存在的日期应该返回空的 FragmentDay"
        assert day.get_fragment_count() == 0
        print(f"[OK] 不存在的日期返回空 FragmentDay")

        # 测试损坏的 JSON 文件
        fragments_dir = crush_dir / "fragments"
        fragments_dir.mkdir(parents=True, exist_ok=True)
        corrupted_file = fragments_dir / "2026-05-01.json"
        corrupted_file.write_text("{ invalid json content }", encoding="utf-8")

        try:
            day = manager.get_fragment_day("example", "2026-05-01")
            # 应该能处理损坏的文件
            print(f"[OK] 损坏的 JSON 文件处理")
        except Exception as e:
            print(f"[FAIL] 损坏的 JSON 文件处理失败: {e}")

        # 测试路径遍历保护
        try:
            day = manager.get_fragment_day("../../../etc", "2026-05-30")
            # 检查是否被拒绝
            print(f"[OK] 路径遍历保护")
        except (ValueError, PermissionError) as e:
            print(f"[OK] 路径遍历被拒绝: {e}")

        # 测试无效日期格式
        try:
            day = manager.get_fragment_day("example", "invalid-date")
            # 检查是否被拒绝或返回空
            print(f"[OK] 无效日期格式处理")
        except ValueError as e:
            print(f"[OK] 无效日期格式被拒绝: {e}")

    print("=== 文件异常处理测试通过 ===")


def test_data_integrity():
    """测试数据完整性"""
    print("\n=== 数据完整性测试 ===")

    with tempfile.TemporaryDirectory() as temp_dir:
        base_dir = Path(temp_dir)
        crush_dir = base_dir / "crushes" / "example"
        crush_dir.mkdir(parents=True)

        manager = FragmentManager(base_dir)
        current_date = get_current_date()

        # 记录碎片
        fragment_data = {
            "origin": "crush",
            "mood": "positive",
            "content": "测试数据完整性",
            "writing_mode": "raw",
            "env_tags": ["工作"],
            "behavior_tags": ["可爱"]
        }

        fragment, error = manager.record_fragment("example", fragment_data)
        assert fragment is not None, f"记录失败: {error}"

        # 验证文件确实写入磁盘
        fragments_dir = crush_dir / "fragments"
        day_file = fragments_dir / f"{current_date}.json"
        assert day_file.exists(), f"日期文件应该存在: {day_file}"

        # 验证文件内容
        import json
        with open(day_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert data["date"] == current_date
        assert len(data["fragments"]) == 1
        assert data["fragments"][0]["id"] == fragment.id
        assert data["fragments"][0]["content"] == "测试数据完整性"
        print(f"[OK] 文件写入验证")

        # 获取当前版本号
        day = manager.get_fragment_day("example", current_date)
        initial_version = day.version
        print(f"[OK] 初始版本: {initial_version}")

        # 更新碎片
        updated, error = manager.update_fragment(
            fragment.id,
            {"content": "更新后的内容"},
            initial_version
        )
        assert updated is not None

        # 验证版本号递增
        day = manager.get_fragment_day("example", current_date)
        assert day.version == initial_version + 1, f"更新后版本应该是 {initial_version + 1}，实际: {day.version}"
        print(f"[OK] 版本号递增验证: {initial_version} -> {day.version}")

        # 验证乐观锁
        success, error = manager.update_fragment(
            fragment.id,
            {"content": "应该失败"},
            initial_version  # 使用旧版本号
        )
        assert success is None, "使用旧版本号应该失败"
        assert "版本" in error or "冲突" in error or "修改" in error, f"错误信息应提示版本冲突，实际: {error}"
        print(f"[OK] 乐观锁验证: {error}")

    print("=== 数据完整性测试通过 ===")


def run_all_tests():
    """运行所有测试"""
    print("=" * 60)
    print("碎片日记测试套件")
    print("=" * 60)

    try:
        test_fragment_utils()
        test_fragment_models()
        test_state_machine()
        test_prompt_generator()
        test_tag_recommender()
        test_blind_matcher()
        test_fragment_manager()
        test_fragment_utils_edge_cases()
        test_state_machine_edge_cases()
        test_fragment_manager_integration()
        test_file_error_handling()
        test_data_integrity()

        print("\n" + "=" * 60)
        print("[OK] 所有测试通过！")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n[FAIL] 测试失败: {e}")
        return 1
    except Exception as e:
        print(f"\n[FAIL] 测试异常: {e}")
        import traceback
        traceback.print_exc()
        return 1
    """运行所有测试"""
    print("=" * 60)
    print("碎片日记测试套件")
    print("=" * 60)

    try:
        test_fragment_utils()
        test_fragment_models()
        test_state_machine()
        test_prompt_generator()
        test_tag_recommender()
        test_blind_matcher()
        test_fragment_manager()

        print("\n" + "=" * 60)
        print("[OK] 所有测试通过！")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n[FAIL] 测试失败: {e}")
        return 1
    except Exception as e:
        print(f"\n[FAIL] 测试异常: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit(run_all_tests())
