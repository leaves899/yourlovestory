#!/usr/bin/env python3
"""写前自动同步检查

检查所有写作依赖文件是否最新，自动同步过时文件。
用法: python3 pre_write_check.py <slug> [--auto-fix] [--day N]

输出:
  ✅ 文件状态正常
  ⚠️ 文件过时，已自动同步
  ❌ 文件缺失，需要手动处理
"""

import json
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timedelta


def find_project_root():
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / 'CLAUDE.md').exists():
            return current
        current = current.parent
    return Path.cwd()


def run_tool(project_root: Path, script_name: str, args: list) -> tuple:
    """运行工具脚本，返回 (success, output)"""
    script = project_root / '.claude' / 'skills' / 'create-crush' / 'tools' / script_name
    if not script.exists():
        return False, f'{script_name} not found'
    try:
        result = subprocess.run(
            [sys.executable, str(script)] + args,
            cwd=str(project_root),
            capture_output=True, timeout=30
        )
        stdout = result.stdout.decode('utf-8', errors='replace').strip() if result.stdout else ''
        return result.returncode == 0, stdout
    except Exception as e:
        return False, str(e)


def check_meta_version(slug_dir: Path) -> dict:
    """读取 meta.json 版本"""
    meta_path = slug_dir / 'meta.json'
    if not meta_path.exists():
        return {'status': 'error', 'msg': 'meta.json not found'}
    with open(meta_path, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    return {'status': 'ok', 'version': meta.get('version', 'v0')}


def check_persona_sync(slug_dir: Path, project_root: Path, auto_fix: bool) -> dict:
    """检查 persona.md → persona_core.md 是否同步"""
    persona_path = slug_dir / 'persona.md'
    core_path = slug_dir / 'persona' / 'persona_core.md'

    if not persona_path.exists():
        return {'status': 'error', 'msg': 'persona.md missing'}

    if not core_path.exists():
        if auto_fix:
            ok, out = run_tool(project_root, 'persona_splitter.py', [slug_dir.name])
            return {'status': 'fixed', 'msg': 'persona_core.md generated'}
        return {'status': 'warn', 'msg': 'persona_core.md missing, run persona_splitter.py'}

    persona_mtime = persona_path.stat().st_mtime
    core_mtime = core_path.stat().st_mtime

    if persona_mtime > core_mtime:
        if auto_fix:
            ok, out = run_tool(project_root, 'persona_splitter.py', [slug_dir.name])
            return {'status': 'fixed', 'msg': 'persona_core.md regenerated'}
        return {'status': 'warn', 'msg': 'persona.md newer than persona_core.md, run persona_splitter.py'}

    return {'status': 'ok', 'msg': 'persona sync OK'}


def check_context_sync(slug_dir: Path, project_root: Path, auto_fix: bool) -> dict:
    """检查 memory.md → CONTEXT.md 是否同步"""
    memory_path = slug_dir / 'memory.md'
    context_path = slug_dir / 'CONTEXT.md'

    if not memory_path.exists():
        return {'status': 'error', 'msg': 'memory.md missing'}

    if not context_path.exists():
        if auto_fix:
            ok, out = run_tool(project_root, 'context_generator.py', [slug_dir.name])
            return {'status': 'fixed', 'msg': 'CONTEXT.md generated'}
        return {'status': 'warn', 'msg': 'CONTEXT.md missing, run context_generator.py'}

    memory_mtime = memory_path.stat().st_mtime
    context_mtime = context_path.stat().st_mtime

    if memory_mtime > context_mtime:
        if auto_fix:
            ok, out = run_tool(project_root, 'context_generator.py', [slug_dir.name])
            return {'status': 'fixed', 'msg': 'CONTEXT.md regenerated'}
        return {'status': 'warn', 'msg': 'memory.md newer than CONTEXT.md, run context_generator.py'}

    return {'status': 'ok', 'msg': 'context sync OK'}


def check_skill_sync(slug_dir: Path, project_root: Path, auto_fix: bool) -> dict:
    """检查 SKILL.md 是否需要重建"""
    skill_path = slug_dir / 'SKILL.md'
    meta_path = slug_dir / 'meta.json'

    if not skill_path.exists():
        if auto_fix:
            ok, out = run_tool(project_root, 'skill_writer.py',
                               ['--action', 'combine', '--base-dir', './crushes', '--slug', slug_dir.name])
            return {'status': 'fixed', 'msg': 'SKILL.md generated'}
        return {'status': 'warn', 'msg': 'SKILL.md missing'}

    if meta_path.exists():
        meta_mtime = meta_path.stat().st_mtime
        skill_mtime = skill_path.stat().st_mtime
        if meta_mtime > skill_mtime:
            if auto_fix:
                ok, out = run_tool(project_root, 'skill_writer.py',
                                   ['--action', 'combine', '--base-dir', './crushes', '--slug', slug_dir.name])
                return {'status': 'fixed', 'msg': 'SKILL.md regenerated'}
            return {'status': 'warn', 'msg': 'meta.json newer than SKILL.md'}

    return {'status': 'ok', 'msg': 'SKILL.md OK'}


def check_weekday(slug_dir: Path, project_root: Path, day_number: int, auto_fix: bool) -> dict:
    """检查 WEEKDAY.md 是否覆盖指定 Day"""
    weekday_path = slug_dir / 'WEEKDAY.md'
    if not weekday_path.exists():
        return {'status': 'error', 'msg': 'WEEKDAY.md missing'}

    content = weekday_path.read_text(encoding='utf-8')
    max_day = 0
    for m in re.finditer(r'\|\s*(\d+)\s*\|', content):
        d = int(m.group(1))
        if d > max_day:
            max_day = d

    if day_number <= max_day:
        return {'status': 'ok', 'msg': f'WEEKDAY.md covers up to Day {max_day}'}

    if auto_fix:
        extend_weekday(weekday_path, max_day + 1, day_number + 7)
        return {'status': 'fixed', 'msg': f'WEEKDAY.md extended to Day {day_number + 7}'}

    return {'status': 'warn', 'msg': f'WEEKDAY.md only covers Day {max_day}, need Day {day_number}'}


def extend_weekday(weekday_path: Path, start_day: int, end_day: int):
    """扩展 WEEKDAY.md"""
    weekdays = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']
    content = weekday_path.read_text(encoding='utf-8')
    lines = content.rstrip().split('\n')

    # 找到最后一个表格行
    last_table_idx = len(lines) - 1
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith('|') and re.search(r'\|\s*\d+\s*\|', lines[i]):
            last_table_idx = i
            break

    # 生成新行（每行4个单元格）
    new_cells = []
    for day in range(start_day, end_day + 1):
        wd = weekdays[(day - 1) % 7]
        new_cells.append((day, wd))

    table_lines = []
    for i in range(0, len(new_cells), 4):
        chunk = new_cells[i:i+4]
        parts = [f'| {d} | {w} |' for d, w in chunk]
        table_lines.append(' '.join(parts))

    lines = lines[:last_table_idx + 1] + table_lines + ['']
    weekday_path.write_text('\n'.join(lines), encoding='utf-8')


def check_version_consistency(slug_dir: Path) -> dict:
    """检查版本号一致性"""
    issues = []
    meta_path = slug_dir / 'meta.json'
    meta_ver = None
    if meta_path.exists():
        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)
        meta_ver = meta.get('version', '')

    prompt_path = slug_dir / 'PROMPT.md'
    if prompt_path.exists():
        prompt_content = prompt_path.read_text(encoding='utf-8')
        m = re.search(r'版本\s*(v\d+)', prompt_content)
        if m and meta_ver and m.group(1) != meta_ver:
            issues.append(f'PROMPT.md={m.group(1)} vs meta.json={meta_ver}')

    persona_path = slug_dir / 'persona.md'
    if persona_path.exists():
        persona_content = persona_path.read_text(encoding='utf-8')
        m = re.search(r'v(\d+)', persona_content[:100])
        if m and meta_ver and f'v{m.group(1)}' != meta_ver:
            issues.append(f'persona.md=v{m.group(1)} vs meta.json={meta_ver}')

    if issues:
        return {'status': 'warn', 'msg': '; '.join(issues)}
    return {'status': 'ok', 'msg': f'version {meta_ver} consistent'}


def main():
    # Fix Windows GBK encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    if len(sys.argv) < 2:
        print('Usage: python3 pre_write_check.py <slug> [--auto-fix] [--day N]')
        sys.exit(1)

    slug = sys.argv[1]
    auto_fix = '--auto-fix' in sys.argv
    day_number = None
    for i, arg in enumerate(sys.argv):
        if arg == '--day' and i + 1 < len(sys.argv):
            day_number = int(sys.argv[i + 1])

    project_root = find_project_root()
    slug_dir = project_root / 'crushes' / slug

    if not slug_dir.exists():
        print(f'Error: {slug_dir} not found')
        sys.exit(1)

    print(f'=== Pre-write Check: {slug} ===')
    print(f'Auto-fix: {auto_fix}')
    if day_number:
        print(f'Target day: {day_number}')
    print()

    ver_info = check_meta_version(slug_dir)
    print(f'[Version] {ver_info["version"]}')

    ver_consistency = check_version_consistency(slug_dir)
    icon = {'ok': '✅', 'warn': '⚠️', 'error': '❌'}.get(ver_consistency['status'], '?')
    print(f'[Version Consistency] {icon} {ver_consistency["msg"]}')

    persona_info = check_persona_sync(slug_dir, project_root, auto_fix)
    icon = {'ok': '✅', 'warn': '⚠️', 'error': '❌', 'fixed': '🔧'}.get(persona_info['status'], '?')
    print(f'[Persona Sync] {icon} {persona_info["msg"]}')

    context_info = check_context_sync(slug_dir, project_root, auto_fix)
    icon = {'ok': '✅', 'warn': '⚠️', 'error': '❌', 'fixed': '🔧'}.get(context_info['status'], '?')
    print(f'[Context Sync] {icon} {context_info["msg"]}')

    skill_info = check_skill_sync(slug_dir, project_root, auto_fix)
    icon = {'ok': '✅', 'warn': '⚠️', 'error': '❌', 'fixed': '🔧'}.get(skill_info['status'], '?')
    print(f'[SKILL.md] {icon} {skill_info["msg"]}')

    if day_number:
        weekday_info = check_weekday(slug_dir, project_root, day_number, auto_fix)
        icon = {'ok': '✅', 'warn': '⚠️', 'error': '❌', 'fixed': '🔧'}.get(weekday_info['status'], '?')
        print(f'[WEEKDAY] {icon} {weekday_info["msg"]}')

    print()

    all_results = [ver_info, ver_consistency, persona_info, context_info, skill_info]
    if day_number:
        all_results.append(weekday_info)

    errors = [r for r in all_results if r.get('status') == 'error']
    warns = [r for r in all_results if r.get('status') == 'warn']
    fixed = [r for r in all_results if r.get('status') == 'fixed']

    if errors:
        print(f'❌ {len(errors)} error(s) — fix before writing')
        sys.exit(1)
    elif warns:
        print(f'⚠️ {len(warns)} warning(s) — run with --auto-fix to resolve')
        sys.exit(1)
    elif fixed:
        print(f'🔧 {len(fixed)} file(s) auto-fixed — ready to write')
    else:
        print('✅ All checks passed — ready to write')


if __name__ == '__main__':
    main()
