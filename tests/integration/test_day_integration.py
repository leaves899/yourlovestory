"""
日常写作集成测试
"""

import pytest
from pathlib import Path
from src.scripts.day.service import DayService


@pytest.fixture
def day_service():
    project_root = Path(__file__).parent.parent.parent
    return DayService(project_root)


def test_day_workflow(day_service):
    """测试日常写作完整流程"""
    # 1. 生成日常写作
    generate_result = day_service.generate(
        slug='example',
        day_number=1,
        summary='测试摘要',
    )
    assert generate_result['success'] is True

    # 2. 获取日常写作
    get_result = day_service.get(slug='example', day_number=1)
    assert get_result['success'] is True

    # 3. 更新日常写作
    update_result = day_service.update(
        slug='example',
        day_number=1,
        content='更新内容',
    )
    assert update_result['success'] is True

    # 4. 删除日常写作
    delete_result = day_service.delete(slug='example', day_number=1)
    assert delete_result['success'] is True
