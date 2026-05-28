#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""更新所有 day 文件引用

将 meta.json、memory.md、CONTEXT.md、day_updater.py 等文件中
的 day{N}.md 引用更新为 day{N}_YYYY-MM-DD.md 格式

需要先运行 rename_day_files.py 完成重命名
"""
from pathlib import Path
import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path('d:/CLAUDECODE/crushSkill')
CHATS_DIR = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'memories' / 'chats'


def build_old_to_new_map():
    """构建旧文件名到新文件名的映射"""
    mapping = {}
    for f in CHATS_DIR.glob('day*.md'):
        # 从新文件名提取 day 号
        # 新格式: day144_2026-10-07.md 或 day101-105_2026-08-25~2026-08-29.md
        m = re.match(r'^(day\d+(-\d+)?)_', f.name)
        if m:
            old_name_part = m.group(1)  # day144 或 day101-105
            mapping[old_name_part] = f.name.replace('.md', '')
    return mapping


def update_file_content(filepath: Path, old_to_new: dict):
    """更新单个文件中的 day 文件名引用"""
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = []

    for old_part, new_part in old_to_new.items():
        old_ref = f'{old_part}.md'
        new_ref = f'{new_part}.md'

        # 在内容中替换引用（但要避免替换已经是新格式的）
        # 只替换以 .md 结尾的完整引用
        pattern = re.compile(re.escape(old_ref) + r'(?!\w)')
        if pattern.search(content):
            content = pattern.sub(new_ref, content)
            changes.append((old_ref, new_ref))

    if changes:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return changes
    return []


def main():
    old_to_new = build_old_to_new_map()
    print(f'Found {len(old_to_new)} day file mappings')
    for k, v in list(old_to_new.items())[:10]:
        print(f'  {k}.md -> {v}.md')
    print('...')

    all_changes = []

    # 1. meta.json
    meta_path = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'meta.json'
    if meta_path.exists():
        changes = update_file_content(meta_path, old_to_new)
        if changes:
            all_changes.append(('meta.json', changes))
            print(f'Meta.json: {len(changes)} changes')

    # 2. memory.md
    memory_path = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'memory.md'
    if memory_path.exists():
        changes = update_file_content(memory_path, old_to_new)
        if changes:
            all_changes.append(('memory.md', changes))
            print(f'memory.md: {len(changes)} changes')

    # 3. CONTEXT.md
    context_path = PROJECT_ROOT / 'CONTEXT.md'
    if context_path.exists():
        changes = update_file_content(context_path, old_to_new)
        if changes:
            all_changes.append(('CONTEXT.md', changes))
            print(f'CONTEXT.md: {len(changes)} changes')

    # 4. day_updater.py
    updater_path = PROJECT_ROOT / '.claude' / 'skills' / 'create-crush' / 'tools' / 'day_updater.py'
    if updater_path.exists():
        changes = update_file_content(updater_path, old_to_new)
        if changes:
            all_changes.append(('day_updater.py', changes))
            print(f'day_updater.py: {len(changes)} changes')

    # 5. 其他可能引用 day 文件的地方
    # 检查 PROMPT.md
    prompt_path = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'PROMPT.md'
    if prompt_path.exists():
        changes = update_file_content(prompt_path, old_to_new)
        if changes:
            all_changes.append(('PROMPT.md', changes))
            print(f'PROMPT.md: {len(changes)} changes')

    # 检查 context_generator.py 是否引用
    ctx_gen_path = PROJECT_ROOT / '.claude' / 'skills' / 'create-crush' / 'tools' / 'context_generator.py'
    if ctx_gen_path.exists():
        changes = update_file_content(ctx_gen_path, old_to_new)
        if changes:
            all_changes.append(('context_generator.py', changes))
            print(f'context_generator.py: {len(changes)} changes')

    print(f'\nTotal files modified: {len(all_changes)}')
    for fname, changes in all_changes:
        print(f'\n{fname}:')
        for old, new in changes[:10]:
            print(f'  {old} -> {new}')
        if len(changes) > 10:
            print(f'  ... and {len(changes) - 10} more')


if __name__ == '__main__':
    main()