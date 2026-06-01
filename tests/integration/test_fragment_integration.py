"""
碎片日记集成测试
"""

import pytest
from pathlib import Path
from src.scripts.fragment.manager import FragmentManager


@pytest.fixture
def fragment_manager():
    project_root = Path(__file__).parent.parent.parent
    return FragmentManager(project_root)


def test_fragment_workflow(fragment_manager):
    """测试碎片日记完整流程"""
    # 1. 记录碎片
    record_result = fragment_manager.record(
        slug='example',
        origin='user',
        mood='positive',
        content='测试内容',
    )
    assert record_result['success'] is True

    # 2. 获取碎片列表
    list_result = fragment_manager.list(slug='example')
    assert list_result['success'] is True

    # 3. 更新碎片
    update_result = fragment_manager.update(
        slug='example',
        fragment_id='test_id',
        content='更新内容',
    )
    assert update_result['success'] is True

    # 4. 删除碎片
    delete_result = fragment_manager.delete(slug='example', fragment_id='test_id')
    assert delete_result['success'] is True
