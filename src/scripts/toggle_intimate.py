"""
亲密内容开关

支持两种配置格式（向后兼容）：
- 旧格式：intimate=true|false（纯文本）
- 新格式：{"enabled": true|false}（JSON）
"""

import json
from pathlib import Path
from typing import Dict, Any


def _read_config_file(config_file: Path) -> bool:
    """
    读取配置文件，支持旧格式和新格式

    Args:
        config_file: 配置文件路径

    Returns:
        bool: 是否启用亲密内容
    """
    if not config_file.exists():
        return False

    try:
        content = config_file.read_text(encoding='utf-8').strip()

        # 尝试 JSON 格式（新格式）
        try:
            config = json.loads(content)
            return config.get('enabled', False)
        except json.JSONDecodeError:
            pass

        # 尝试旧格式：intimate=true 或 intimate=false
        if content.lower().startswith('intimate='):
            value = content.split('=', 1)[1].strip().lower()
            return value == 'true'

        # 尝试旧格式：enabled: true 或 enabled: false
        if content.lower().startswith('enabled:'):
            value = content.split(':', 1)[1].strip().lower()
            return value == 'true'

        return False
    except Exception:
        return False


def toggle_intimate(slug: str, enable: bool) -> Dict[str, Any]:
    """
    切换亲密内容开关

    Args:
        slug: 角色标识
        enable: 是否启用

    Returns:
        Dict: 响应结果
    """
    try:
        # 获取项目根目录
        project_root = Path(__file__).parent.parent

        # 获取配置文件路径
        config_file = project_root / 'crushes' / slug / '.intimate_config'

        # 确保目录存在
        config_file.parent.mkdir(parents=True, exist_ok=True)

        # 更新配置（使用兼容格式）
        content = f'intimate={"true" if enable else "false"}'
        config_file.write_text(content, encoding='utf-8')

        return {
            'success': True,
            'data': {'slug': slug, 'enabled': enable},
        }
    except Exception as e:
        return {
            'success': False,
            'errors': [str(e)],
        }


def get_intimate_status(slug: str) -> Dict[str, Any]:
    """
    获取亲密内容状态

    Args:
        slug: 角色标识

    Returns:
        Dict: 响应结果
    """
    try:
        # 获取项目根目录
        project_root = Path(__file__).parent.parent

        # 获取配置文件路径
        config_file = project_root / 'crushes' / slug / '.intimate_config'

        # 读取配置（支持多种格式）
        enabled = _read_config_file(config_file)

        return {
            'success': True,
            'data': {'slug': slug, 'enabled': enabled},
        }
    except Exception as e:
        return {
            'success': False,
            'errors': [str(e)],
        }


if __name__ == '__main__':
    import sys
    import argparse

    parser = argparse.ArgumentParser(description='切换亲密内容开关')
    parser.add_argument('--slug', required=True, help='角色标识')
    parser.add_argument('--enable', action='store_true', help='启用亲密内容')
    parser.add_argument('--disable', action='store_true', help='禁用亲密内容')
    parser.add_argument('--status', action='store_true', help='查看状态')

    args = parser.parse_args()

    if args.status:
        result = get_intimate_status(args.slug)
    elif args.enable:
        result = toggle_intimate(args.slug, True)
    elif args.disable:
        result = toggle_intimate(args.slug, False)
    else:
        result = {'success': False, 'errors': ['请指定 --enable, --disable 或 --status']}

    print(json.dumps(result, ensure_ascii=False))
