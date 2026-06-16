#!/usr/bin/env python3
"""
init_template.py - 初始化新角色模板

提供两种调用方式：
    1. 函数式：create_crush(name, nickname, slug, ...) -> dict，供程序和测试调用
    2. CLI：python init_template.py --name ... --nickname ... --slug ...

CLI 是 create_crush() 的薄壳，两者产物完全一致。

用法 / Usage:
    python scripts/init_template.py --name "小明" --nickname "小雪" --slug "xiaoming"

选项 / Options:
    --name          角色真实姓名
    --nickname      角色昵称
    --slug          URL slug（唯一标识，用于目录名）
    --description   角色描述（可选）
    --gender        性别 male/female/unknown（可选，默认 unknown）
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


def create_crush(
    name: str,
    nickname: str,
    slug: str,
    project_root: Optional[Path] = None,
    description: str = "",
    gender: str = "unknown",
) -> Dict[str, Any]:
    """
    创建新的 crush 角色

    在 <project_root>/crushes/<slug>/ 下创建完整目录结构与元数据。
    幂等：目录已存在时仅补齐缺失的子目录与文件，不会报错。

    Args:
        name: 真实姓名
        nickname: 昵称
        slug: URL slug（唯一标识）
        project_root: 项目根目录（可选，默认自动检测：src/scripts -> 项目根）
        description: 角色描述（可选）
        gender: 性别 male/female/unknown（可选，默认 unknown）

    Returns:
        Dict: {'success': bool, 'data'?: meta, 'errors'?: [str]}
    """
    try:
        # 获取项目根目录
        # 当前文件位于 <root>/src/scripts/init_template.py
        if project_root is None:
            project_root = Path(__file__).parent.parent.parent

        # 创建角色目录（幂等）
        crush_dir = project_root / "crushes" / slug
        crush_dir.mkdir(parents=True, exist_ok=True)

        # 创建子目录（幂等）
        (crush_dir / "memories" / "chats").mkdir(parents=True, exist_ok=True)
        (crush_dir / "fragments").mkdir(parents=True, exist_ok=True)
        (crush_dir / "plans").mkdir(parents=True, exist_ok=True)

        # 创建元数据文件
        now = datetime.now().isoformat()
        meta = {
            "name": name,
            "nickname": nickname,
            "slug": slug,
            "gender": gender,
            "description": description,
            "intimate_enabled": False,
            "version": "v1",
            "created_at": now,
            "updated_at": now,
        }
        meta_file = crush_dir / "meta.json"
        with open(meta_file, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

        # 创建记忆文件（幂等：已存在则保留，不覆盖）
        memory_file = crush_dir / "memory.md"
        if not memory_file.exists():
            memory_file.write_text(f"# {nickname} 的记忆\n\n", encoding="utf-8")

        # 创建性格文件（幂等）
        persona_file = crush_dir / "persona.md"
        if not persona_file.exists():
            persona_file.write_text(f"# {nickname} 的性格\n\n", encoding="utf-8")

        # 创建亲密内容配置文件（默认关闭，幂等）
        intimate_file = crush_dir / ".intimate_config"
        if not intimate_file.exists():
            intimate_file.write_text("intimate=false\n", encoding="utf-8")

        return {
            "success": True,
            "data": meta,
        }
    except Exception as e:
        return {
            "success": False,
            "errors": [str(e)],
        }


def main() -> int:
    """CLI 入口：解析参数并调用 create_crush()"""
    import argparse

    parser = argparse.ArgumentParser(
        description="初始化新角色模板 / Initialize new crush template"
    )
    parser.add_argument("--name", required=True, help="角色真实姓名 / Real name")
    parser.add_argument("--nickname", required=True, help="角色昵称 / Nickname")
    parser.add_argument("--slug", required=True, help="URL slug (unique identifier)")
    parser.add_argument(
        "--description", default="", help="角色描述 / Description"
    )
    parser.add_argument(
        "--gender",
        default="unknown",
        choices=["male", "female", "unknown"],
        help="性别 / Gender",
    )

    args = parser.parse_args()

    result = create_crush(
        name=args.name,
        nickname=args.nickname,
        slug=args.slug,
        description=args.description,
        gender=args.gender,
    )

    if result["success"]:
        crush_dir = Path("crushes") / args.slug
        print(f"Created new crush at: {crush_dir}")
        print(f"Meta: {crush_dir / 'meta.json'}")
        print(f"Intimate config: {crush_dir / '.intimate_config'}")
        return 0
    else:
        print(f"Error: {result.get('errors', ['unknown error'])}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
