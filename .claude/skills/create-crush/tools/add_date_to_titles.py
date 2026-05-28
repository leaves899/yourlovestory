#!/usr/bin/env python3
"""批量为 day 文件标题添加真实日期

用法: python3 add_date_to_titles.py [--dry-run]

基准：Day {{DAY_NUMBER}} = 2026-05-17 = 周六
"""

import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Day {{DAY_NUMBER}} 锚点
DAY1_DATE = datetime(2026, 5, 17)  # 周六
WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']


def day_to_date(day_number: int) -> datetime:
    return DAY1_DATE + timedelta(days=day_number - 1)


def day_to_weekday(day_number: int) -> str:
    return WEEKDAYS[(day_number - 1) % 7]


def extract_day_number(filename: str) -> tuple[int, int] | None:
    """从文件名提取 day 号范围。返回 (起始day, 结束day) 或 (day, day)"""
    name = filename.replace('.md', '')
    # day174-1.md 特殊处理：-1 是修正版标记，不是 day 号
    if re.match(r'^day\d+-\d+$', name):
        parts = name.replace('day', '').split('-')
        return int(parts[0]), int(parts[1])
    elif re.match(r'^day\d+$', name):
        num = int(name.replace('day', ''))
        return num, num
    return None


def has_date(text: str) -> bool:
    return bool(re.search(r'\d{4}-\d{2}-\d{2}', text))


def process_single_file(filepath: Path, dry_run: bool = True) -> tuple[str, str] | None:
    """处理单个 day 文件。返回 (old_title, new_title) 或 None"""
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if not lines:
        return None

    first_line = lines[0].rstrip()
    filename = filepath.name

    # 检查是否已有日期（且标题格式已正确，即日期后面没有重复的周X）
    if has_date(first_line):
        # 但仍需检查是否有重复的周X（日期后面跟着的周X）
        m = re.match(r'^(# Day (\d+))（(.+)）$', first_line)
        if m:
            content = m.group(3)
            # 去掉开头的周X· 和 日期后面跟着的周X·
            new_content = re.sub(r'^周[一二三四五六日]·', '', content)
            new_content = re.sub(r'(\d{4}-\d{2}-\d{2}·)(周[一二三四五六日]·) ', r'\1', new_content)
            if new_content != content:
                # 重新组装标题
                day_num = int(m.group(2))
                date_str = day_to_date(day_num).strftime('%Y-%m-%d')
                weekday = day_to_weekday(day_num)
                new_title = f'# Day {day_num}（{weekday}·{date_str}·{new_content}）'
                return (first_line, new_title)
        return None  # 已有日期且格式正确，跳过

    day_range = extract_day_number(filename)
    if day_range is None:
        return None

    start_day, end_day = day_range
    start_date = day_to_date(start_day)
    end_date = day_to_date(end_day)
    start_weekday = day_to_weekday(start_day)
    end_weekday = day_to_weekday(end_day)

    new_title = None

    # 类型 A/B: # Day N（周X·...）或 # Day N（...）
    m = re.match(r'^(# Day (\d+))（(.+)）$', first_line)
    if m:
        day_num = int(m.group(2))
        content = m.group(3)
        # 去掉原内容中开头的周X·（如"周四·"），避免重复
        content = re.sub(r'^周[一二三四五六日]·', '', content)
        # 去掉日期后面跟着的周X·（如"2026-08-29·周五·" → "2026-08-29·"）
        content = re.sub(r'(\d{4}-\d{2}-\d{2}·)(周[一二三四五六日]·) ', r'\1', content)
        date_str = day_to_date(day_num).strftime('%Y-%m-%d')
        weekday = day_to_weekday(day_num)
        new_title = f'# Day {day_num}（{weekday}·{date_str}·{content}）'
        return (first_line, new_title)

    # 类型 C: # Day N ~ M — ...
    m = re.match(r'^(# Day (\d+) ~ (\d+) — .+)$', first_line)
    if m:
        d1, d2 = int(m.group(2)), int(m.group(3))
        date_range = f'{day_to_date(d1).strftime("%Y-%m-%d")}~{day_to_date(d2).strftime("%Y-%m-%d")}'
        weekdays = f'{day_to_weekday(d1)}·{day_to_weekday(d2)}'
        new_title = f'# Day {d1}-{d2}（{date_range}·{weekdays}·）'
        return (first_line, new_title)

    # 类型 D: # Day N~M ...
    m = re.match(r'^(# Day (\d+)~(\d+) .+)$', first_line)
    if m:
        d1, d2 = int(m.group(2)), int(m.group(3))
        date_range = f'{day_to_date(d1).strftime("%Y-%m-%d")}~{day_to_date(d2).strftime("%Y-%m-%d")}'
        weekdays = f'{day_to_weekday(d1)}·{day_to_weekday(d2)}'
        new_title = f'# Day {d1}-{d2}（{date_range}·{weekdays}·）'
        return (first_line, new_title)

    # 类型 E: # Day N — ...
    m = re.match(r'^(# Day (\d+) — .+)$', first_line)
    if m:
        day_num = int(m.group(2))
        date_str = day_to_date(day_num).strftime('%Y-%m-%d')
        weekday = day_to_weekday(day_num)
        rest = first_line[m.end():]
        new_title = f'# Day {day_num}（{weekday}·{date_str}·{rest}'
        return (first_line, new_title)

    # 类型 F: # Day N~M ...
    m = re.match(r'^(# Day (\d+)~(\d+) .+)$', first_line)
    if m:
        d1, d2 = int(m.group(2)), int(m.group(3))
        date_range = f'{day_to_date(d1).strftime("%Y-%m-%d")}~{day_to_date(d2).strftime("%Y-%m-%d")}'
        weekdays = f'{day_to_weekday(d1)}·{day_to_weekday(d2)}'
        new_title = f'# Day {d1}-{d2}（{date_range}·{weekdays}·）'
        return (first_line, new_title)

    # 类型 G/J: # Day N-M ...
    m = re.match(r'^(# Day (\d+)-(\d+) .+)$', first_line)
    if m:
        d1, d2 = int(m.group(2)), int(m.group(3))
        date_range = f'{day_to_date(d1).strftime("%Y-%m-%d")}~{day_to_date(d2).strftime("%Y-%m-%d")}'
        weekdays = f'{day_to_weekday(d1)}·{day_to_weekday(d2)}'
        new_title = f'# Day {d1}-{d2}（{date_range}·{weekdays}·）'
        return (first_line, new_title)

    # 类型 H: # Day {{DAY_NUMBER}} 模拟聊天记录
    m = re.match(r'^(# Day {{DAY_NUMBER}} 模拟聊天记录)$', first_line)
    if m:
        new_title = '# Day {{DAY_NUMBER}}（周六·2026-05-17·模拟聊天记录）'
        return (first_line, new_title)

    # 类型 I: # Day N · 周X · ...
    m = re.match(r'^(# Day (\d+) · (.+) · (.+))$', first_line)
    if m:
        day_num = int(m.group(2))
        date_str = day_to_date(day_num).strftime('%Y-%m-%d')
        weekday = day_to_weekday(day_num)
        rest = m.group(3)
        new_title = f'# Day {day_num}（{weekday}·{date_str}·{rest}·{m.group(4)}）'
        return (first_line, new_title)

    return None


def main():
    dry_run = '--dry-run' in sys.argv

    # add_date_to_titles.py is at .claude/skills/create-crush/tools/
    # project_root = d:/CLAUDECODE/crushSkill (5 parents up: tools→create-crush→skills→.claude→project)
    script_path = Path(__file__).resolve()
    project_root = script_path.parent.parent.parent.parent.parent
    chats_dir = project_root / 'crushes' / '{{CHARACTER_NAME}}' / 'memories' / 'chats'

    if not chats_dir.exists():
        print(f'Error: directory not found: {chats_dir}')
        sys.exit(1)

    files = sorted(chats_dir.glob('day*.md'), key=lambda p: int(re.search(r'\d+', p.stem.split('-')[0].replace('day', '')).group()))

    changes = []
    for f in files:
        result = process_single_file(f, dry_run)
        if result:
            changes.append((f, result[0], result[1]))

    if dry_run:
        print(f'DRY-RUN: {len(changes)} files would be modified\n')
        for f, old, new in changes:
            print(f'{f.name}')
            print(f'  OLD: {old}')
            print(f'  NEW: {new}')
            print()
    else:
        print(f'Applying {len(changes)} changes...\n')
        for f, old, new in changes:
            with open(f, 'r', encoding='utf-8') as fp:
                content = fp.read()
            content = content.replace(old, new, 1)
            with open(f, 'w', encoding='utf-8') as fp:
                fp.write(content)
            print(f'Modified: {f.name}')


if __name__ == '__main__':
    main()