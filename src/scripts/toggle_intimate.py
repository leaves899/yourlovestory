"""
亲密内容开关
"""

import json
from pathlib import Path
from typing import Dict, Any


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

        # 更新配置
        config = {'enabled': enable}
        with open(config_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)

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

        # 读取配置
        if config_file.exists():
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {
                    'success': True,
                    'data': {'slug': slug, 'enabled': config.get('enabled', False)},
                }
        else:
            return {
                'success': True,
                'data': {'slug': slug, 'enabled': False},
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
