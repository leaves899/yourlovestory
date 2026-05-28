#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量重命名 day 文件为 day{N}_YYYY-MM-DD.md 格式

day144.md → day144_2026-10-07.md
day2-11.md → day2-11_2026-05-18~2026-05-27.md (合并文件取起始日期)
day174-1.md → day174-1_2026-11-06.md (-1 是修正版标记，不是 day 号)
"""
from pathlib import Path
import re
import sys
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')

DAY1_DATE = datetime(2026, 5, 17)
WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']

def day_to_date_str(n): return (DAY1_DATE + timedelta(days=n-1)).strftime('%Y-%m-%d')


def extract_day_info(filename: str):
    """从文件名提取 day 号信息。返回 (起始day, 结束day, 是否修正版)"""
    name = filename.replace('.md', '')
    # day174-1.md: -1 是修正版标记
    if re.match(r'^day\d+-\d+$', name):
        parts = name.replace('day', '').split('-')
        return int(parts[0]), int(parts[1]), False, name  # start, end, is_fix, original_name
    elif re.match(r'^day\d+$', name):
        num = int(name.replace('day', ''))
        return num, num, False, name
    return None


def build_new_filename(original_name: str, day_start: int, day_end: int) -> str:
    """构建新文件名"""
    if day_start == day_end:
        # 单 day 文件
        date_str = day_to_date_str(day_start)
        return f'day{day_start}_{date_str}.md'
    else:
        # 合并文件
        date_start = day_to_date_str(day_start)
        date_end = day_to_date_str(day_end)
        return f'day{day_start}-{day_end}_{date_start}~{date_end}.md'


def main():
    chats_dir = Path('crushes/{{CHARACTER_NAME}}/memories/chats')
    renamed = []
    conflicts = []

    files = list(chats_dir.glob('day*.md'))

    for f in files:
        info = extract_day_info(f.name)
        if info is None:
            print(f'SKIP (unknown format): {f.name}')
            continue

        day_start, day_end, is_fix, original_name = info
        new_name = build_new_filename(f.name, day_start, day_end)
        new_path = chats_dir / new_name

        if new_path.exists() and new_path != f:
            conflicts.append((f.name, new_name, 'target exists'))
            continue

        if new_path == f:
            print(f'SAME: {f.name} -> {new_name} (no rename needed)')
            continue

        print(f'REname: {f.name} -> {new_name}')
        f.rename(new_path)
        renamed.append((f.name, new_name))

    print(f'\nTotal renamed: {len(renamed)}')
    if conflicts:
        print(f'Conflicts (not renamed): {conflicts}')


if __name__ == '__main__':
    main()