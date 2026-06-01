"""
碎片日记单元测试
"""

import pytest
from pathlib import Path
from src.scripts.fragment.manager import FragmentManager


@pytest.fixture
def fragment_manager():
    project_root = Path(__file__).parent.parent.parent
    return FragmentManager(project_root)


def test_fragment_manager_record(fragment_manager):
    """测试记录碎片"""
    result = fragment_manager.record(
        slug='example',
        origin='user',
        mood='positive',
        content='测试内容',
    )
    assert result['success'] is True


def test_fragment_manager_list(fragment_manager):
    """测试获取碎片列表"""
    result = fragment_manager.list(slug='example')
    assert result['success'] is True


def test_fragment_manager_get(fragment_manager):
    """测试获取碎片详情"""
    result = fragment_manager.get(slug='example', fragment_id='test_id')
    assert result['success'] is True


def test_fragment_manager_update(fragment_manager):
    """测试更新碎片"""
    result = fragment_manager.update(
        slug='example',
        fragment_id='test_id',
        content='更新内容',
    )
    assert result['success'] is True


def test_fragment_manager_delete(fragment_manager):
    """测试删除碎片"""
    result = fragment_manager.delete(slug='example', fragment_id='test_id')
    assert result['success'] is True
