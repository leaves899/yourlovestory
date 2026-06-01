"""
初始化角色模板
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional


def create_crush(name: str, nickname: str, slug: str, project_root: Optional[Path] = None) -> Dict[str, Any]:
    """
    创建新的 crush 角色

    Args:
        name: 真实姓名
        nickname: 昵称
        slug: URL slug（唯一标识）
        project_root: 项目根目录（可选，默认自动检测）

    Returns:
        Dict: 响应结果
    """
    try:
        # 获取项目根目录
        if project_root is None:
            project_root = Path(__file__).parent.parent.parent

        # 创建角色目录
        crush_dir = project_root / 'crushes' / slug
        crush_dir.mkdir(parents=True, exist_ok=True)

        # 创建子目录
        (crush_dir / 'memories' / 'chats').mkdir(parents=True, exist_ok=True)
        (crush_dir / 'fragments').mkdir(parents=True, exist_ok=True)
        (crush_dir / 'plans').mkdir(parents=True, exist_ok=True)

        # 创建元数据文件
        now = datetime.now().isoformat()
        meta = {
            'name': name,
            'nickname': nickname,
            'slug': slug,
            'created_at': now,
            'updated_at': now,
        }
        meta_file = crush_dir / 'meta.json'
        with open(meta_file, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        # 创建记忆文件
        memory_file = crush_dir / 'memory.md'
        memory_file.write_text(f'# {nickname} 的记忆\n\n', encoding='utf-8')

        # 创建性格文件
        persona_file = crush_dir / 'persona.md'
        persona_file.write_text(f'# {nickname} 的性格\n\n', encoding='utf-8')

        # 创建亲密内容配置文件（默认关闭）
        intimate_file = crush_dir / '.intimate_config'
        intimate_file.write_text('intimate=false', encoding='utf-8')

        return {
            'success': True,
            'data': meta,
        }
    except Exception as e:
        return {
            'success': False,
            'errors': [str(e)],
        }


if __name__ == '__main__':
    import sys
    import argparse

    parser = argparse.ArgumentParser(description='创建新的 crush 角色')
    parser.add_argument('--name', required=True, help='真实姓名')
    parser.add_argument('--nickname', required=True, help='昵称')
    parser.add_argument('--slug', required=True, help='URL slug')

    args = parser.parse_args()
    result = create_crush(args.name, args.nickname, args.slug)
    print(json.dumps(result, ensure_ascii=False))
