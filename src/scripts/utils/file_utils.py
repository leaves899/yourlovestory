"""
文件工具函数
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional


def read_json(file_path: Path) -> Optional[Dict[str, Any]]:
    """
    读取 JSON 文件

    Args:
        file_path: 文件路径

    Returns:
        Dict: JSON 数据
    """
    try:
        if file_path.exists():
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None
    except Exception:
        return None


def write_json(file_path: Path, data: Dict[str, Any]) -> bool:
    """
    写入 JSON 文件

    Args:
        file_path: 文件路径
        data: JSON 数据

    Returns:
        bool: 是否成功
    """
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def get_settings(project_root: Path) -> Dict[str, Any]:
    """
    获取应用设置

    Args:
        project_root: 项目根目录

    Returns:
        Dict: 设置数据
    """
    settings_file = project_root / 'settings.json'
    return read_json(settings_file) or {}


def update_settings(project_root: Path, settings: Dict[str, Any]) -> bool:
    """
    更新应用设置

    Args:
        project_root: 项目根目录
        settings: 设置数据

    Returns:
        bool: 是否成功
    """
    settings_file = project_root / 'settings.json'
    return write_json(settings_file, settings)
