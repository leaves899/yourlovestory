"""
角色管理单元测试
"""

import pytest
from pathlib import Path
from src.scripts.init_template import create_crush


def test_create_crush():
    """测试创建角色"""
    result = create_crush(
        name='测试角色',
        nickname='测试昵称',
        slug='test_crush',
    )
    assert result['success'] is True
