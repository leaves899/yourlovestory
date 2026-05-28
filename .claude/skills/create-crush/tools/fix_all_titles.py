#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复重复日期问题
正确格式：# Day N（周X·YYYY-MM-DD·事件内容）
"""
from pathlib import Path
import re
import sys
from datetime import datetime, timedelta

sys.stdout.reconfigure(encoding='utf-8')

DAY1_DATE = datetime(2026, 5, 17)
WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']

def day_to_weekday(n): return WEEKDAYS[(n-1) % 7]
def day_to_date_str(n): return (DAY1_DATE + timedelta(days=n-1)).strftime('%Y-%m-%d')

def extract_day_number(filename: str):
    name = filename.replace('.md', '')
    if re.match(r'^day\d+-\d+$', name):
        parts = name.replace('day', '').split('-')
        return int(parts[0]), int(parts[1])
    elif re.match(r'^day\d+$', name):
        return int(name.replace('day', '')), int(name.replace('day', ''))
    return None


def fix_single(filepath: Path) -> bool:
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    first = content.split('\n')[0]

    dr = extract_day_number(filepath.name)
    if dr is None or dr[0] != dr[1]:
        return False
    day_num = dr[0]

    correct_weekday = day_to_weekday(day_num)
    correct_date = day_to_date_str(day_num)

    date_m = re.search(r'\d{4}-\d{2}-\d{2}', first)
    if not date_m:
        return False

    first_date_end = date_m.end()
    before = first[:first_date_end]
    after = first[first_date_end:]

    after_cleaned = re.sub(r'^·+周[一二三四五六日] ?· ?', '', after)

    new_first = before + '·' + after_cleaned

    if new_first == first:
        return False

    new_content = content.replace(first, new_first, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f'Fixed {filepath.name}:')
    print(f'  OLD: {first}')
    print(f'  NEW: {new_first}')
    return True


def fix_merge(filepath: Path) -> bool:
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    first = content.split('\n')[0]

    dr = extract_day_number(filepath.name)
    if dr is None or dr[0] == dr[1]:
        return False

    day_start, day_end = dr
    correct_start_w = day_to_weekday(day_start)
    correct_end_w = day_to_weekday(day_end)

    if not first.endswith('·）'):
        return False

    inner = first.split('（')[1][:-2]

    date_range_m = re.match(r'(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})', inner)
    if not date_range_m:
        return False

    date_range = f'{date_range_m.group(1)}~{date_range_m.group(2)}'
    new_first = f'# Day {day_start}-{day_end}（{date_range}·{correct_start_w}·{correct_end_w}）'

    if new_first == first:
        return False

    new_content = content.replace(first, new_first, 1)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f'Fixed {filepath.name}:')
    print(f'  OLD: {first}')
    print(f'  NEW: {new_first}')
    return True


def main():
    chats_dir = Path('crushes/{{CHARACTER_NAME}}/memories/chats')
    fixed = 0

    for f in sorted(chats_dir.glob('day*.md')):
        dr = extract_day_number(f.name)
        if dr is None:
            continue

        if dr[0] == dr[1]:
            if fix_single(f):
                fixed += 1
        else:
            if fix_merge(f):
                fixed += 1

    print(f'\nTotal fixed: {fixed}')


if __name__ == '__main__':
    main()