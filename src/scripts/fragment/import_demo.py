#!/usr/bin/env python3
"""
import_demo.py - 导入示例角色

用法 / Usage:
    python scripts/import_demo.py [--force]

选项 / Options:
    --force         强制覆盖已存在的示例角色
"""

import argparse
import shutil
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="导入示例角色 / Import demo character")
    parser.add_argument("--force", action="store_true", help="强制覆盖已存在的示例角色 / Force overwrite existing demo")

    args = parser.parse_args()

    base_dir = Path(__file__).parent.parent.resolve()
    demo_source = base_dir / "examples" / "demo"
    target_dir = base_dir / "crushes" / "example"

    if not demo_source.exists():
        print(f"Error: Demo source directory not found: {demo_source}")
        return 1

    if target_dir.exists() and not args.force:
        print(f"Error: Demo character already exists at: {target_dir}")
        print("Use --force to overwrite, or delete it manually first.")
        return 1

    try:
        if target_dir.exists() and args.force:
            shutil.rmtree(target_dir)
        shutil.copytree(demo_source, target_dir, dirs_exist_ok=True)
    except Exception as e:
        print(f"Error: Failed to import demo: {e}")
        return 1

    print("Demo character imported successfully!")
    print()
    print(f"  Location: crushes/example/")
    print()
    print("  Next steps:")
    print("  1. View character memory: crushes/example/memory.md")
    print("  2. View sample day output: crushes/example/memories/chats/day1.md")
    print("  3. Start writing: claude skill run day")
    print()
    print("  Create your own character:")
    print("  （通过应用内 UI 创建角色，或参考 src/shared/crush/crushStore.ts）")

    return 0


if __name__ == "__main__":
    sys.exit(main())
