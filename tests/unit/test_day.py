"""
日常写作单元测试
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


def test_day_service_list(day_service):
    """测试获取日常写作列表"""
    result = day_service.list(slug='example')
    assert result['success'] is True
    assert len(result['data']) >= 1
    assert result['data'][0]['day_number'] == 1


def test_day_service_get(day_service):
    """测试获取日常写作详情"""
    result = day_service.get(slug='example', day_number=1)
    assert result['success'] is True
    assert 'content' in result['data']
    assert 'Day 1' in result['data']['content']


def test_day_service_get_not_found(day_service):
    """测试获取不存在的日常写作"""
    result = day_service.get(slug='example', day_number=999)
    assert result['success'] is False
    assert len(result['errors']) > 0


def test_day_service_update(day_service):
    """测试更新日常写作"""
    result = day_service.update(
        slug='example',
        day_number=1,
        content='# Day 1\n\n更新后的内容',
    )
    assert result['success'] is True
    assert result['data']['content'] == '# Day 1\n\n更新后的内容'

    # 验证更新后的内容
    get_result = day_service.get(slug='example', day_number=1)
    assert get_result['data']['content'] == '# Day 1\n\n更新后的内容'


def test_day_service_delete(day_service):
    """测试删除日常写作"""
    result = day_service.delete(slug='example', day_number=1)
    assert result['success'] is True

    # 验证删除后无法获取
    get_result = day_service.get(slug='example', day_number=1)
    assert get_result['success'] is False


def test_day_service_list_empty(tmp_path):
    """测试空列表"""
    # 创建空的 crush 目录
    crush_dir = tmp_path / 'crushes' / 'empty'
    crush_dir.mkdir(parents=True)

    service = DayService(tmp_path)
    result = service.list(slug='empty')
    assert result['success'] is True
    assert result['data'] == []
    assert result['total'] == 0
