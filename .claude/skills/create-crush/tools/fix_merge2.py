#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix merge file titles where the second weekday was truncated"""
from pathlib import Path
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

chats_dir = Path('crushes/{{CHARACTER_NAME}}/memories/chats')
WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']

merge_files = [
    'day12-16.md', 'day17-19.md', 'day20-22.md', 'day23-28.md', 'day29-34.md',
    'day35-37.md', 'day38-40.md', 'day41-43.md', 'day44-45.md', 'day46-55.md',
    'day60-71.md', 'day72-84.md', 'day85-93.md', 'day94-100.md', 'day101-105.md',
    'day102-104.md', 'day106-108.md', 'day109-111.md'
]

for fname in merge_files:
    f = chats_dir / fname
    if not f.exists():
        continue
    with open(f, encoding='utf-8') as fp:
        content = fp.read()
    first = content.split('\n')[0]

    # Only fix files that have the bug (ends with .周.)
    if not first.endswith('周.'):
        print(f'OK: {fname}: {first}')
        continue

    m = re.match(r'day(\d+)-(\d+)\.md', fname)
    if not m:
        continue

    day_start = int(m.group(1))
    day_end = int(m.group(2))

    w_start = WEEKDAYS[(day_start - 1) % 7]
    w_end = WEEKDAYS[(day_end - 1) % 7]

    # Extract date range
    date_m = re.search(r'(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})', first)
    if not date_m:
        continue

    date_range = f'{date_m.group(1)}~{date_m.group(2)}'
    correct_title = f'# Day {day_start}-{day_end}（{date_range}·{w_start}·{w_end}）'

    print(f'FIXING {fname}:')
    print(f'  OLD: {first}')
    print(f'  NEW: {correct_title}')

    new_content = content.replace(first, correct_title, 1)
    with open(f, 'w', encoding='utf-8') as fp:
        fp.write(new_content)