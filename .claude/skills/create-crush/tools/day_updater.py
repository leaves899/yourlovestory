#!/usr/bin/env python3
"""Day叙事文件批量更新工具

用法: python3 day_updater.py <slug> <day_number> <summary>

功能:
1. 更新 memory.md（时间线+无套数据+手心写字密码）
2. 更新 meta.json（version+1，updated_at，relationship_status）
3. 更新 PROMPT.md（版本号）
4. 运行 skill_writer.py 重新生成 SKILL.md

参数:
  slug: crush名称（如 {{CHARACTER_NAME}}）
  day_number: 天数（如 144）
  summary: 当天摘要（一句话描述，用于memory.md时间线和meta.json）
"""

import json
import re
import sys
import subprocess
from pathlib import Path
from datetime import datetime, timedelta


def find_project_root():
    """找到项目根目录"""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / 'CLAUDE.md').exists():
            return current
        current = current.parent
    return Path.cwd()


# Day {{DAY_NUMBER}} 锚点：2026-05-17 = 周六
DAY1_DATE = datetime(2026, 5, 17)
WEEKDAYS = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']


def day_to_date(day_number: int) -> datetime:
    return DAY1_DATE + timedelta(days=day_number - 1)


def day_to_weekday(day_number: int) -> str:
    return WEEKDAYS[(day_number - 1) % 7]


def ensure_title_has_date(project_root: Path, slug: str, day_number: int):
    """确保 day 文件标题包含真实日期。如果标题缺少日期，补充之。"""
    slug_dir = project_root / 'crushes' / slug / 'memories' / 'chats'

    # 查找 day 文件（可能是 day144_2026-10-07.md 或 day174-1_2026-11-06.md 等）
    candidates = [
        slug_dir / f'day{day_number}.md',
        slug_dir / f'day{day_number}.md',  # 旧的未重命名格式
        slug_dir / f'day{day_number}-1.md',
    ]
    day_file = None
    for c in candidates:
        if c.exists():
            day_file = c
            break

    if day_file is None:
        print(f'  warning: day file not found for Day {day_number}')
        return

    with open(day_file, 'r', encoding='utf-8') as f:
        content = f.read()

    first_line = content.split('\n')[0]

    # 已有日期则跳过
    if re.search(r'\d{4}-\d{2}-\d{2}', first_line):
        return

    date_str = day_to_date(day_number).strftime('%Y-%m-%d')
    weekday = day_to_weekday(day_number)

    new_first = None

    # 类型 A/B: # Day N（周X·...）或 # Day N（...）
    m = re.match(r'^(# Day (\d+))（(.+)）$', first_line)
    if m:
        day_num = int(m.group(2))
        content_inside = m.group(3)
        # 去掉原内容中开头的周X·（如"周四·"），避免重复
        content_inside = re.sub(r'^周[一二三四五六日]·', '', content_inside)
        correct_weekday = day_to_weekday(day_num)
        new_first = f'# Day {day_num}（{correct_weekday}·{date_str}·{content_inside}）'

    # 类型 H: # Day {{DAY_NUMBER}} 模拟聊天记录
    if new_first is None and first_line == '# Day {{DAY_NUMBER}} 模拟聊天记录':
        new_first = '# Day {{DAY_NUMBER}}（周六·2026-05-17·模拟聊天记录）'

    if new_first is None:
        print(f'  warning: unknown title format in {day_file.name}: {first_line[:50]}')
        return

    new_content = content.replace(first_line, new_first, 1)
    with open(day_file, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f'  title: added date {date_str} to {day_file.name}')


def update_meta_json(project_root: Path, slug: str, day_number: int, summary: str):
    """更新 meta.json"""
    meta_path = project_root / 'crushes' / slug / 'meta.json'
    if not meta_path.exists():
        print(f'  warning: {meta_path} not found')
        return

    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)

    # version +1
    old_version = meta.get('version', 'v0')
    ver_match = re.search(r'\d+', old_version)
    version_num = int(ver_match.group()) + 1 if ver_match else 1
    meta['version'] = f'v{version_num}'

    # updated_at
    meta['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')

    # relationship_status - append day summary
    profile = meta.setdefault('profile', {})
    old_status = profile.get('relationship_status', '')
    if f'Day {day_number}' not in old_status:
        new_status = f'{old_status}·Day {day_number} {summary[:20]}'
        profile['relationship_status'] = new_status

    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f'  meta.json: {old_version} -> v{version_num}')


def update_prompt_md(project_root: Path, slug: str, day_number: int):
    """更新 PROMPT.md 版本号"""
    prompt_path = project_root / 'crushes' / slug / 'PROMPT.md'
    if not prompt_path.exists():
        print(f'  warning: {prompt_path} not found')
        return

    with open(prompt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    ver_match = re.search(r'v(\d+)', content)
    if not ver_match:
        print(f'  warning: no version number found in PROMPT.md')
        return

    old_ver = int(ver_match.group(1))
    new_ver = old_ver + 1

    old_pattern = r'> 版本 v\d+ · Day \d+'
    new_line = f'> 版本 v{new_ver} · Day {day_number}'
    new_content = re.sub(old_pattern, new_line, content, count=1)

    with open(prompt_path, 'w', encoding='utf-8') as f:
        f.write(new_content)

    print(f'  PROMPT.md: v{old_ver} -> v{new_ver} (Day {day_number})')


def update_memory_md(project_root: Path, slug: str, day_number: int, summary: str,
                     sex_count: int = 0, sex_details: str = '',
                     handwriting: str = '', ycm_pill: int = 0):
    """更新 memory.md"""
    memory_path = project_root / 'crushes' / slug / 'memory.md'
    if not memory_path.exists():
        print(f'  warning: {memory_path} not found')
        return

    with open(memory_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update current status line
    old_state_pattern = r'当前状态：Day \d+ 已完成。.*?详见时间线'
    if re.search(old_state_pattern, content):
        new_state = f'当前状态：Day {day_number} 已完成。{summary}。详见时间线'
        content = re.sub(old_state_pattern, new_state, content, count=1)

    # 2. Update YCM pill count
    if ycm_pill > 0:
        old_ycm = r'已服至第\d+颗（Day \d+睡前）'
        new_ycm = f'已服至第{ycm_pill}颗（Day {day_number}睡前）'
        content = re.sub(old_ycm, new_ycm, content, count=1)

    # 3. Append sex count data
    if sex_count > 0 and f'Day {day_number}' not in content:
        # Find the line after "无套次数：" and its data entries
        sex_section = re.search(r'(无套次数：[^\n]*(?:\n-+[^\n]*)*)', content)
        if sex_section:
            old_text = sex_section.group(1)
            sex_entry = f'+ Day {day_number}×{sex_count}（{sex_details}）'
            new_text = old_text + '\n' + sex_entry
            content = content[:sex_section.start()] + new_text + content[sex_section.end():]

    # 4. Append handwriting
    if handwriting:
        hw_section = re.search(r'(手心写字密码新增：[^\n]*(?:\n-+[^\n]*)*)', content)
        if hw_section and handwriting not in hw_section.group(1):
            old_text = hw_section.group(1)
            hw_entry = f'/{handwriting}'
            new_text = old_text + hw_entry
            content = content[:hw_section.start()] + new_text + content[hw_section.end():]

    with open(memory_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'  memory.md: updated')


def run_skill_writer(project_root: Path, slug: str):
    """运行 skill_writer.py"""
    script_path = project_root / '.claude' / 'skills' / 'create-crush' / 'tools' / 'skill_writer.py'
    if not script_path.exists():
        print(f'  warning: {script_path} not found')
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script_path), '--action', 'combine', '--base-dir', './crushes', '--slug', slug],
            cwd=str(project_root),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            print(f'  SKILL.md: regenerated')
        else:
            print(f'  warning: skill_writer.py error: {result.stderr[:200]}')
    except Exception as e:
        print(f'  warning: skill_writer.py failed: {e}')


def run_context_generator(project_root: Path, slug: str):
    """运行 context_generator.py 更新 CONTEXT.md"""
    script_path = project_root / '.claude' / 'skills' / 'create-crush' / 'tools' / 'context_generator.py'
    if not script_path.exists():
        print(f'  warning: {script_path} not found')
        return

    try:
        result = subprocess.run(
            [sys.executable, str(script_path), slug],
            cwd=str(project_root),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            print(f'  CONTEXT.md: regenerated')
        else:
            print(f'  warning: context_generator.py error: {result.stderr[:200]}')
    except Exception as e:
        print(f'  warning: context_generator.py failed: {e}')


def main():
    if len(sys.argv) < 3:
        print('Usage: python3 day_updater.py <slug> <day_number> [summary] [sex_count] [sex_details] [handwriting] [ycm_pill]')
        print()
        print('Example:')
        print('  python3 day_updater.py {{slug}} {{day}} "{{summary}}" {{count}} "{{details}}" "{{hw}}" {{pill}}')
        sys.exit(1)

    slug = sys.argv[1]

    try:
        day_number = int(sys.argv[2])
    except ValueError:
        print(f'Error: day_number must be an integer, got "{sys.argv[2]}"')
        sys.exit(1)

    summary = sys.argv[3] if len(sys.argv) > 3 else ''
    sex_count = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 0
    sex_details = sys.argv[5] if len(sys.argv) > 5 else ''
    handwriting = sys.argv[6] if len(sys.argv) > 6 else ''
    ycm_pill = int(sys.argv[7]) if len(sys.argv) > 7 and sys.argv[7].isdigit() else 0

    project_root = find_project_root()
    print(f'=== Updating Day {day_number} ===')
    print(f'Project root: {project_root}')
    print(f'Slug: {slug}')
    print()

    update_meta_json(project_root, slug, day_number, summary)
    update_prompt_md(project_root, slug, day_number)
    update_memory_md(project_root, slug, day_number, summary, sex_count, sex_details, handwriting, ycm_pill)
    ensure_title_has_date(project_root, slug, day_number)
    run_skill_writer(project_root, slug)
    run_context_generator(project_root, slug)

    print()
    print('=== Done ===')


if __name__ == '__main__':
    main()
