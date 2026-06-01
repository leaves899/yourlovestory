"""
碎片日记集成测试
"""

import pytest
import tempfile
from pathlib import Path
from src.scripts.fragment.manager import FragmentManager
from src.scripts.fragment.utils import get_current_date


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


def test_fragment_workflow(fragment_manager):
    """测试碎片日记完整流程"""
    # 1. 记录碎片
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

    # 2. 获取碎片列表
    current_date = get_current_date()
    fragments = fragment_manager.get_fragments_by_date('example', current_date)
    assert len(fragments) >= 1

    # 3. 获取单个碎片
    retrieved = fragment_manager.get_fragment(fragment.id)
    assert retrieved is not None
    assert retrieved.id == fragment.id

    # 4. 获取当前版本号
    day = fragment_manager.get_fragment_day('example', current_date)

    # 5. 更新碎片
    updated, error = fragment_manager.update_fragment(
        fragment_id=fragment.id,
        updates={'content': 'ta发了一个超级可爱的表情包'},
        expected_version=day.version,
    )
    assert updated is not None
    assert error == ''
    assert updated.content == 'ta发了一个超级可爱的表情包'

    # 6. 获取更新后的版本号
    day_after_update = fragment_manager.get_fragment_day('example', current_date)

    # 7. 删除碎片
    success, error = fragment_manager.delete_fragment(
        fragment_id=fragment.id,
        expected_version=day_after_update.version,
    )
    assert success is True
    assert error == ''

    # 8. 确认删除
    deleted = fragment_manager.get_fragment(fragment.id)
    assert deleted is None
