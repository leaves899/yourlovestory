#!/usr/bin/env python3
"""
toggle_intimate.py - 亲密内容开关

用法 / Usage:
    python scripts/toggle_intimate.py --slug "xiaoming" --enable
    python scripts/toggle_intimate.py --slug "xiaoming" --disable
    python scripts/toggle_intimate.py --slug "xiaoming" --status

选项 / Options:
    --slug          角色 slug（目录名）
    --enable        开启亲密内容
    --disable       关闭亲密内容
    --status        查看当前状态
"""

import argparse
import os
from pathlib import Path


def read_intimate_config(config_path: Path) -> bool:
    """读取亲密配置 / Read intimate config"""
    if not config_path.exists():
        return False
    content = config_path.read_text(encoding="utf-8").strip()
    return "intimate=true" in content


def write_intimate_config(config_path: Path, enabled: bool):
    """写入亲密配置 / Write intimate config"""
    value = "true" if enabled else "false"
    config_path.write_text(f"intimate={value}\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="亲密内容开关 / Toggle intimate content")
    parser.add_argument("--slug", required=True, help="角色 slug / Crush slug")
    parser.add_argument("--enable", action="store_true", help="开启亲密内容 / Enable intimate content")
    parser.add_argument("--disable", action="store_true", help="关闭亲密内容 / Disable intimate content")
    parser.add_argument("--status", action="store_true", help="查看当前状态 / Show current status")

    args = parser.parse_args()

    # 验证必须指定一个操作 / Validate exactly one action specified
    actions = [args.enable, args.disable, args.status]
    if sum(actions) != 1:
        print("Error: 必须指定 --enable、--disable 或 --status 之一")
        print("Error: Must specify exactly one of --enable, --disable, or --status")
        return 1

    # Paths
    base_dir = Path(__file__).parent.parent.resolve()
    target_dir = base_dir / "crushes" / args.slug
    config_path = target_dir / ".intimate_config"

    # Validate directory exists
    if not target_dir.exists():
        print(f"Error: Crush directory not found: {target_dir}")
        return 1

    current_state = read_intimate_config(config_path)

    if args.status:
        print(f"Intimate content is currently: {'enabled' if current_state else 'disabled'}")
        return 0

    if args.enable:
        if current_state:
            print("Intimate content is already enabled")
        else:
            write_intimate_config(config_path, True)
            print("Intimate content enabled successfully")
        return 0

    if args.disable:
        if not current_state:
            print("Intimate content is already disabled")
        else:
            write_intimate_config(config_path, False)
            print("Intimate content disabled successfully")
        return 0

    return 0


if __name__ == "__main__":
    exit(main())