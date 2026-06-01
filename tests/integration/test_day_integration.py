"""
日常写作集成测试
"""

import pytest
import tempfile
from pathlib import Path
from src.scripts.day.service import DayService


@pytest.fixture
def temp_project(tmp_path):
    """创建临时项目目录"""
    # 创建 crushes 目录结构
    crush_dir = tmp_path / 'crushes' / 'example'
    chats_dir = crush_dir / 'memories' / 'chats'
    chats_dir.mkdir(parents=True)

    # 创建测试 day 文件
    day_file = chats_dir / 'day1.md'
    day_file.write_text('# Day 1\n\n今天是第一天，我们相遇了。', encoding='utf-8')

    return tmp_path


@pytest.fixture
def day_service(temp_project):
    """创建日常写作服务实例"""
    return DayService(temp_project)


def test_day_workflow(day_service):
    """测试日常写作完整流程（跳过生成，因为 pipeline 是 TODO）"""
    # 1. 获取日常写作列表
    list_result = day_service.list(slug='example')
    assert list_result['success'] is True
    assert len(list_result['data']) >= 1

    # 2. 获取日常写作详情
    get_result = day_service.get(slug='example', day_number=1)
    assert get_result['success'] is True
    assert 'content' in get_result['data']

    # 3. 更新日常写作
    update_result = day_service.update(
        slug='example',
        day_number=1,
        content='# Day 1\n\n更新后的内容',
    )
    assert update_result['success'] is True

    # 4. 验证更新
    verify_result = day_service.get(slug='example', day_number=1)
    assert verify_result['data']['content'] == '# Day 1\n\n更新后的内容'

    # 5. 删除日常写作
    delete_result = day_service.delete(slug='example', day_number=1)
    assert delete_result['success'] is True

    # 6. 验证删除
    get_deleted = day_service.get(slug='example', day_number=1)
    assert get_deleted['success'] is False
