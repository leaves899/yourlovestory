#!/usr/bin/env python3
"""
init_template.py - 初始化新角色模板

用法 / Usage:
    python scripts/init_template.py --name "小明" --nickname "小雪" --slug "xiaoming"

选项 / Options:
    --name          角色真实姓名
    --nickname      角色昵称
    --slug          URL slug（唯一标识，用于目录名）
"""

import argparse
import json
import os
import shutil
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="初始化新角色模板 / Initialize new crush template")
    parser.add_argument("--name", required=True, help="角色真实姓名 / Real name")
    parser.add_argument("--nickname", required=True, help="角色昵称 / Nickname")
    parser.add_argument("--slug", required=True, help="URL slug (unique identifier)")
    parser.add_argument("--description", default="", help="角色描述 / Description")
    parser.add_argument("--gender", default="unknown", choices=["male", "female", "unknown"], help="性别 / Gender")

    args = parser.parse_args()

    # Paths
    base_dir = Path(__file__).parent.parent.resolve()
    template_dir = base_dir / "crushes" / "TEMPLATE"
    crushes_dir = base_dir / "crushes"
    target_dir = crushes_dir / args.slug

    # Validate template exists
    if not template_dir.exists():
        print(f"Error: Template directory not found: {template_dir}")
        return 1

    # Check if slug already exists
    if target_dir.exists():
        print(f"Error: Directory already exists: {target_dir}")
        return 1

    # Copy template to new directory
    shutil.copytree(template_dir, target_dir)

    # Create meta.json
    now = __import__("datetime").datetime.now().isoformat()
    meta = {
        "name": args.name,
        "nickname": args.nickname,
        "slug": args.slug,
        "gender": args.gender,
        "description": args.description,
        "intimate": False,
        "version": "v1",
        "created_at": now,
        "updated_at": now
    }

    meta_path = target_dir / "meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # Create .intimate_config
    intimate_config = target_dir / ".intimate_config"
    with open(intimate_config, "w", encoding="utf-8") as f:
        f.write("intimate=false\n")

    print(f"Created new crush template at: {target_dir}")
    print(f"Meta file: {meta_path}")
    print(f"Intimate config: {intimate_config}")

    return 0


if __name__ == "__main__":
    exit(main())