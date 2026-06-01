"""
碎片日记单元测试
"""

import pytest
import tempfile
from pathlib import Path
from src.scripts.fragment.manager import FragmentManager


@pytest.fixture
def temp_project(tmp_path):
    """创建临时项目目录"""
    # 创建 crushes 目录结构
    crush_dir = tmp_path / 'crushes' / 'example'
    crush_dir.mkdir(parents=True)
    (crush_dir / 'fragments').mkdir()
    return tmp_path


@pytest.fixture
def fragment_manager(temp_project):
    """创建碎片管理器实例"""
    return FragmentManager(temp_project)


def test_record_fragment(fragment_manager):
    """测试记录碎片"""
    fragment, error = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'positive',
            'content': 'ta发了一个可爱的表情包',
            'writing_mode': 'raw',
        },
    )
    assert fragment is not None
    assert error == ''
    assert fragment.content == 'ta发了一个可爱的表情包'
    assert fragment.origin == 'user'
    assert fragment.mood == 'positive'


def test_get_fragments_by_date(fragment_manager):
    """测试获取指定日期的碎片列表"""
    # 先记录一个碎片
    fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'positive',
            'content': '测试内容',
            'writing_mode': 'raw',
        },
    )

    # 获取碎片列表
    from src.scripts.fragment.utils import get_current_date
    fragments = fragment_manager.get_fragments_by_date('example', get_current_date())
    assert len(fragments) >= 1
    assert fragments[0].content == '测试内容'


def test_get_fragment(fragment_manager):
    """测试获取单个碎片"""
    # 先记录一个碎片
    fragment, _ = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'crush',
            'mood': 'positive',
            'content': 'ta今天好开心',
            'writing_mode': 'raw',
        },
    )

    # 获取碎片
    retrieved = fragment_manager.get_fragment(fragment.id)
    assert retrieved is not None
    assert retrieved.id == fragment.id
    assert retrieved.content == 'ta今天好开心'


def test_update_fragment(fragment_manager):
    """测试更新碎片"""
    # 先记录一个碎片
    fragment, _ = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'neutral',
            'content': '原始内容',
            'writing_mode': 'raw',
        },
    )

    # 更新碎片
    updated, error = fragment_manager.update_fragment(
        fragment_id=fragment.id,
        updates={'content': '更新后的内容'},
        expected_version=1,
    )
    assert updated is not None
    assert error == ''
    assert updated.content == '更新后的内容'


def test_delete_fragment(fragment_manager):
    """测试删除碎片"""
    # 先记录一个碎片
    fragment, _ = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'positive',
            'content': '要删除的内容',
            'writing_mode': 'raw',
        },
    )

    # 删除碎片
    success, error = fragment_manager.delete_fragment(
        fragment_id=fragment.id,
        expected_version=1,
    )
    assert success is True
    assert error == ''

    # 确认已删除
    retrieved = fragment_manager.get_fragment(fragment.id)
    assert retrieved is None


def test_record_fragment_validation(fragment_manager):
    """测试碎片内容验证"""
    # 内容太短
    fragment, error = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'positive',
            'content': '短',
            'writing_mode': 'raw',
        },
    )
    assert fragment is None
    assert '内容长度' in error or '太短' in error


def test_record_fragment_max_limit(fragment_manager):
    """测试碎片数量上限"""
    # 记录 10 个碎片（上限）
    for i in range(10):
        fragment_manager.record_fragment(
            crush_slug='example',
            fragment_data={
                'origin': 'user',
                'mood': 'positive',
                'content': f'第{i+1}个碎片内容测试',
                'writing_mode': 'raw',
            },
        )

    # 第 11 个应该失败
    fragment, error = fragment_manager.record_fragment(
        crush_slug='example',
        fragment_data={
            'origin': 'user',
            'mood': 'positive',
            'content': '这是第11个碎片内容',
            'writing_mode': 'raw',
        },
    )
    assert fragment is None
    assert '上限' in error
