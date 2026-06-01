"""
角色管理单元测试
"""

import pytest
import tempfile
from pathlib import Path
from src.scripts.init_template import create_crush


@pytest.fixture
def temp_project(tmp_path):
    """创建临时项目目录"""
    (tmp_path / 'crushes').mkdir()
    return tmp_path


def test_create_crush(temp_project, monkeypatch):
    """测试创建角色"""
    # 修改项目根目录
    monkeypatch.chdir(temp_project)

    result = create_crush(
        name='测试角色',
        nickname='小测',
        slug='test_crush',
    )
    assert result['success'] is True
    assert result['data']['name'] == '测试角色'
    assert result['data']['nickname'] == '小测'
    assert result['data']['slug'] == 'test_crush'


def test_create_crush_directory_structure(temp_project, monkeypatch):
    """测试创建角色后的目录结构"""
    monkeypatch.chdir(temp_project)

    create_crush(
        name='测试角色',
        nickname='小测',
        slug='test_structure',
    )

    crush_dir = temp_project / 'crushes' / 'test_structure'
    assert crush_dir.exists()
    assert (crush_dir / 'memories' / 'chats').exists()
    assert (crush_dir / 'fragments').exists()
    assert (crush_dir / 'plans').exists()
    assert (crush_dir / 'meta.json').exists()
    assert (crush_dir / 'memory.md').exists()
    assert (crush_dir / 'persona.md').exists()


def test_create_crush_meta_json(temp_project, monkeypatch):
    """测试创建角色后的 meta.json 内容"""
    import json
    monkeypatch.chdir(temp_project)

    create_crush(
        name='测试角色',
        nickname='小测',
        slug='test_meta',
    )

    meta_file = temp_project / 'crushes' / 'test_meta' / 'meta.json'
    with open(meta_file, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    assert meta['name'] == '测试角色'
    assert meta['nickname'] == '小测'
    assert meta['slug'] == 'test_meta'
    assert 'created_at' in meta
    assert 'updated_at' in meta


def test_create_crush_idempotent(temp_project, monkeypatch):
    """测试创建角色的幂等性（重复创建不会失败）"""
    monkeypatch.chdir(temp_project)

    result1 = create_crush(
        name='测试角色',
        nickname='小测',
        slug='test_idempotent',
    )
    assert result1['success'] is True

    result2 = create_crush(
        name='测试角色',
        nickname='小测',
        slug='test_idempotent',
    )
    assert result2['success'] is True
