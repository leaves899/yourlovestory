"""
日常写作单元测试
"""

import pytest
from pathlib import Path
from src.scripts.day.service import DayService


@pytest.fixture
def day_service():
    project_root = Path(__file__).parent.parent.parent
    return DayService(project_root)


def test_day_service_generate(day_service):
    """测试生成日常写作"""
    result = day_service.generate(
        slug='example',
        day_number=1,
        summary='测试摘要',
    )
    assert result['success'] is True


def test_day_service_list(day_service):
    """测试获取日常写作列表"""
    result = day_service.list(slug='example')
    assert result['success'] is True


def test_day_service_get(day_service):
    """测试获取日常写作详情"""
    result = day_service.get(slug='example', day_number=1)
    assert result['success'] is True


def test_day_service_update(day_service):
    """测试更新日常写作"""
    result = day_service.update(
        slug='example',
        day_number=1,
        content='测试内容',
    )
    assert result['success'] is True


def test_day_service_delete(day_service):
    """测试删除日常写作"""
    result = day_service.delete(slug='example', day_number=1)
    assert result['success'] is True
