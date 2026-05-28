# -*- coding: utf-8 -*-
"""修复 day 文件标题中的重复星期和末尾问题"""
from pathlib import Path
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

chats_dir = Path('crushes/{{CHARACTER_NAME}}/memories/chats')

# Type I fix: # Day N（周X·YYYY-MM-DD·周一·content） -> # Day N（周X·YYYY-MM-DD·content）
# The pattern has the weekday repeated after the date
for f in chats_dir.glob('day*.md'):
    with open(f, encoding='utf-8') as fp:
        content = fp.read()
    first = fp.readline() if False else None

    # Match: weekday·date·weekday·  -> weekday·date·
    new_content = re.sub(
        r'(# Day \d+（[周日月火水木金一二三四五六日]·\d{4}-\d{2}-\d{2}·)[周日月火水木金一二三四五六日]·',
        r'\1',
        content,
        count=1
    )
    if new_content != content:
        print(f'TypeI fixed: {f.name}')
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(new_content)

# Merge files fix: remove trailing ·weekday·
# # Day {{DAY_NUMBER}}-104（2026-08-26~2026-08-28·周二·周四·） -> # Day {{DAY_NUMBER}}-104（2026-08-26~2026-08-28·周二·周四）
merge_files = [
    'day102-104.md', 'day106-108.md', 'day109-111.md',
    'day2-11.md', 'day12-16.md', 'day17-19.md', 'day20-22.md',
    'day23-28.md', 'day29-34.md', 'day35-37.md', 'day38-40.md',
    'day41-43.md', 'day44-45.md', 'day46-55.md', 'day60-71.md',
    'day72-84.md', 'day85-93.md', 'day94-100.md', 'day101-105.md'
]
for fname in merge_files:
    f = chats_dir / fname
    if not f.exists():
        continue
    with open(f, encoding='utf-8') as fp:
        content = fp.read()

    # Match: ·周X·） at end -> ·周X）
    new_content = re.sub(
        r'(# Day \d+-\d+（\d{4}-\d{2}-\d{2}·[周日月火水木金一二三四五六日]·[周日月火水木金一二三四五六日]）)·$',
        r'\1',
        content,
        count=1,
        flags=re.MULTILINE
    )
    if new_content != content:
        print(f'Merge fixed: {fname}')
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(new_content)

print('Done')