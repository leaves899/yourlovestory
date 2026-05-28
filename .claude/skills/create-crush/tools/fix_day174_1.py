#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复 update_day_refs.py 中的 day174-1 映射错误

问题：rename_day_files.py 为 day174-1.md 生成的新文件名是
      day174-1_2026-11-06~2026-05-17.md（错误的日期范围）

正确应该是：day174-1_2026-11-06.md
"""
from pathlib import Path
import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = Path('d:/CLAUDECODE/crushSkill')
CHATS_DIR = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'memories' / 'chats'

# 先修复 rename_day_files.py 的问题：重命名 day174-1
day174_1_old = CHATS_DIR / 'day174-1_2026-11-06~2026-05-17.md'
day174_1_new = CHATS_DIR / 'day174-1_2026-11-06.md'
if day174_1_old.exists() and not day174_1_new.exists():
    print(f'Rename fix: {day174_1_old.name} -> {day174_1_new.name}')
    day174_1_old.rename(day174_1_new)

# 现在重新构建正确的映射
old_to_new = {}

# 直接从文件系统构建映射：旧名 → 新名
# 旧名格式: day{N}.md, day{N}-M.md, day{N}-1.md
# 新名格式: day{N}_YYYY-MM-DD.md, day{N}-M_YYYY-MM-DD~YYYY-MM-DD.md, day{N}-1_YYYY-MM-DD.md
for f in CHATS_DIR.glob('day*.md'):
    # 新文件名
    new_name = f.name.replace('.md', '')

    # 从新文件名提取旧文件名（去掉 _日期 部分）
    # day144_2026-10-07.md -> day144
    # day101-105_2026-08-25~2026-08-29.md -> day101-105
    # day174-1_2026-11-06.md -> day174-1
    m = re.match(r'^(day\d+(?:-\d+)?)_', new_name)
    if m:
        old_name = m.group(1)  # day144, day101-105, day174-1
        old_to_new[old_name] = new_name

print(f'Built mapping for {len(old_to_new)} files')
for k, v in list(old_to_new.items())[:5]:
    print(f'  {k} -> {v}')

# 修复 meta.json 中的错误映射
meta_path = PROJECT_ROOT / 'crushes' / '{{CHARACTER_NAME}}' / 'meta.json'
if meta_path.exists():
    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)

    changed = False
    # 检查并修复 relationship_status 中的错误引用
    profile = meta.get('profile', {})
    status = profile.get('relationship_status', '')
    if 'day174-1_2026-11-06~2026-05-17' in status:
        status = status.replace('day174-1_2026-11-06~2026-05-17.md', 'day174-1_2026-11-06.md')
        profile['relationship_status'] = status
        changed = True
        print(f'Fixed meta.json: day174-1_2026-11-06~2026-05-17 -> day174-1_2026-11-06')

    if changed:
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

# 修复 day_updater.py 中的 ensure_title_has_date 候选文件名
updater_path = PROJECT_ROOT / '.claude' / 'skills' / 'create-crush' / 'tools' / 'day_updater.py'
if updater_path.exists():
    with open(updater_path, encoding='utf-8') as f:
        content = f.read()

    # ensure_title_has_date 里面现在有个错误的 day174-1 候选
    # 需要更新为正确的 day174-1_2026-11-06.md
    if 'day174-1_2026-11-06~2026-05-17.md' in content:
        content = content.replace(
            'day174-1_2026-11-06~2026-05-17.md',
            'day174-1_2026-11-06.md'
        )
        with open(updater_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Fixed day_updater.py: day174-1 candidate path')

print('\nDone fixing mapping issues')