# -*- coding: utf-8 -*-
"""修复合并文件末尾多余的·（cut-off weekday bug修复）"""
from pathlib import Path
import re
import sys
sys.stdout.reconfigure(encoding='utf-8')

chats_dir = Path('crushes/{{CHARACTER_NAME}}/memories/chats')
# Re-run the original correct logic to fix all merge files properly

# For titles like # Day {{DAY_NUMBER}}-16（2026-05-28~2026-06-01·周三·周·）
# We need: # Day {{DAY_NUMBER}}-16（2026-05-28~2026-06-01·周三·周日）

# The bug: currently the title is ·周三·周·） meaning weekday was truncated
# Correct target: ·周三·周日·） should be ·周三·周日）
# So if we find a title with ·周· at position -4, it means the weekday was cut

merge_files = [
    'day12-16.md', 'day17-19.md', 'day20-22.md', 'day23-28.md', 'day29-34.md',
    'day35-37.md', 'day38-40.md', 'day41-43.md', 'day44-45.md', 'day46-55.md',
    'day60-71.md', 'day72-84.md', 'day85-93.md', 'day94-100.md', 'day101-105.md',
    'day102-104.md', 'day106-108.md', 'day109-111.md'
]

# The problem: titles like ·周三·周·） where 周日 was truncated to 周·
# Fix: the pattern in the original file was:
#   # Day {{DAY_NUMBER}}-16（2026-05-28~2026-06-01·周三·周日·）
# but my wrong fix turned it into:
#   # Day {{DAY_NUMBER}}-16（2026-05-28~2026-06-01·周三·周·）
#
# I need to know the correct second weekday for each file.
# Since I can't know without looking at each file, let me recalculate from the file order.
# Actually, for all these files, the correct second weekday can be calculated:
# Day N-M, second weekday = weekdays[(N+1) % 7]

WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']

for fname in merge_files:
    f = chats_dir / fname
    if not f.exists():
        continue
    with open(f, encoding='utf-8') as fp:
        content = fp.read()
    first = content.split('\n')[0]

    # Check if this file has the bug (·周· at position -4 from ·）)
    # Bug form: ·周·） (ends with middle dot, truncated weekday)
    # Correct form: ·周X·周Y） (full weekdays)
    # We need: if title ends with ·周·）-> check if previous 3 chars are ·周
    # then the correct full title should have the second weekday restored

    # Pattern detection: if we see ·周·） at the end, it means the second
    # weekday was cut to just "周". The full weekday is:
    # For day12-16: start=12, end=16, second weekday for day16 = weekdays[16%7] = weekdays[2] = 周二
    # But wait the file shows ...·周三·周·） which is start weekday 周三 (day12)
    # and truncated weekday should be day16's weekday = 周二
    # So target: ...·周三·周二）

    # Extract the day range from filename
    m = re.match(r'day(\d+)-(\d+)\.md', fname)
    if not m:
        continue
    day_start = int(m.group(1))
    day_end = int(m.group(2))

    # Get the correct weekdays for start and end
    w_start = WEEKDAYS[(day_start - 1) % 7]
    w_end = WEEKDAYS[(day_end - 1) % 7]

    # Build correct title
    # Extract the date range from current title
    date_m = re.search(r'（(\d{4}-\d{2}-\d{2}@\d{4}-\d{2}-\d{2}）)', first)
    if not date_m:
        # Try simpler extraction
        date_m = re.search(r'（(\d{4}-\d{2}-\d{2}）', first)

    # Find the date range
    date_range_m = re.search(r'(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})', first)
    if date_range_m:
        date_range = f'{date_range_m.group(1)}~{date_range_m.group(2)}'
    else:
        continue

    # Find the event content between the date range and ·周·）
    # Title structure: # Day N-M（date_range·w_start·w_end·）
    # We need: # Day N-M（date_range·w_start·w_end）
    # But only if current title is broken (ends with ·周·）)
    if first.endswith('·周·）'):
        correct_title = f'# Day {day_start}-{day_end}（{date_range}·{w_start}·{w_end}）'
        print(f'FIXING {fname}:')
        print(f'  OLD: {first}')
        print(f'  NEW: {correct_title}')
        new_content = content.replace(first, correct_title, 1)
        with open(f, 'w', encoding='utf-8') as fp:
            fp.write(new_content)
    else:
        print(f'OK: {fname}: {first}')