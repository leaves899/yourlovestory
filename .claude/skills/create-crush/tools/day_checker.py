#!/usr/bin/env python3
"""Day叙事文件自动化逻辑审查工具

用法: python3 day_checker.py <day_file_path>

检查项目:
1. 计数一致性（性爱次数、股数、秒数）
2. 时间线逻辑（时间顺序、场景切换）
3. 关键词矛盾（同一文件内的矛盾描述）
4. 跳蛋 continuity（放入/取出/使用）
5. 对话与旁白的一致性
"""

import re
import sys
from pathlib import Path


def check_count_consistency(content: str, filename: str):
    """检查计数一致性"""
    issues = []

    # 检查性爱场景标题
    scene_headers = re.findall(r'^## \d+:\d+ .*(?:第[一二三四五]次|亲密|性爱|肛交|绑)', content, re.MULTILINE)

    # 检查对话中的计数
    count_patterns = [
        (r'(\d)次了', '对话中的次数计数'),
    ]

    for pattern, desc in count_patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            num = int(match)
            idx = content.find(f'{num}次')
            if idx >= 0:
                context = content[max(0, idx-50):idx+50].replace('\n', ' ')
                issues.append(f'  [{desc}] "{num}次" -- context: ...{context[-80:]}...')

    return issues


def check_timeline_logic(content: str, filename: str):
    """检查时间线逻辑"""
    issues = []

    time_pattern = r'^## (\d+):(\d+)'
    times = []
    for match in re.finditer(time_pattern, content, re.MULTILINE):
        hour, minute = int(match.group(1)), int(match.group(2))
        times.append((hour, minute, match.start()))

    # Check time ordering (allow cross-midnight: evening -> early morning)
    for i in range(1, len(times)):
        prev_h, prev_m, _ = times[i-1]
        curr_h, curr_m, _ = times[i]
        # Allow evening (>=19) -> early morning (<6) cross-midnight
        if prev_h >= 19 and curr_h < 6:
            continue
        # Allow early morning -> early morning (same overnight session)
        if prev_h < 6 and curr_h < 6 and curr_h >= prev_h:
            continue
        if curr_h < prev_h or (curr_h == prev_h and curr_m < prev_m):
            issues.append(f'  Time reversal: {prev_h:02d}:{prev_m:02d} -> {curr_h:02d}:{curr_m:02d}')

    return issues


def check_keywords_contradiction(content: str, filename: str):
    """检查关键词矛盾"""
    issues = []

    # Check "退出来" vs "没退出来" contradiction within same paragraph
    # Only flag if both appear in the same SENTENCE context (within 100 chars)
    for match in re.finditer(r'退出来', content):
        if '没' in content[max(0, match.start()-5):match.end()+5]:
            continue  # This is "没退出来", skip
        # Check if "没退出来" appears within 100 chars
        nearby = content[match.start():match.start()+200]
        if '没退出来' in nearby or '没有退出来' in nearby:
            issues.append(f'  Contradiction: "退出来" and "没退出来" within 200 chars')

    # Check elastic band count
    band_count = len(re.findall(r'弹力带', content))
    if band_count > 0:
        four_bands = re.search(r'四条弹力带', content)
        if four_bands:
            # More flexible pattern: match any subject + band + verb
            wrap_count = len(re.findall(
                r'(?:你用|你把|把|用).*?弹力带.*?(?:绑|缠|绕|捆)',
                content
            ))
            if wrap_count == 0:
                # Fallback: count any band + binding verb combination
                wrap_count = len(re.findall(r'弹力带.{0,20}(?:绑|缠|绕|捆)', content))
            if wrap_count < 4:
                issues.append(f'  Band count: "四条弹力带" but only {wrap_count} binding actions found')

    return issues


def check_egg_continuity(content: str, filename: str):
    """检查跳蛋连续性"""
    issues = []

    insert_count = len(re.findall(r'塞进去|塞入|放入.*跳蛋|跳蛋.*塞|塞进去', content))
    remove_count = len(re.findall(r'拿出来|取出|取出来|拉出来.*跳蛋|跳蛋.*拉出|放在床头柜', content))

    if insert_count > 0 and remove_count == 0:
        issues.append(f'  Egg inserted {insert_count} times but never removed')

    return issues


def check_dialogue_consistency(content: str, filename: str):
    """检查对话与旁白的一致性"""
    issues = []

    # Check button count consistency
    button_matches = re.findall(r'还有(\d)颗扣子没弹开', content)
    if button_matches:
        button_pop_count = len(re.findall(r'弹开.*扣子|扣子.*弹开|弹开.*暗扣|暗扣.*弹开', content))
        for match in button_matches:
            remaining = int(match)
            if button_pop_count > 0 and remaining > 6:
                issues.append(f'  "还有{remaining}颗扣子没弹开" but dress only has 6 hidden buttons')

    return issues


def run_all_checks(filepath: str):
    """运行所有检查"""
    path = Path(filepath)
    if not path.exists():
        print(f'Error: file not found {filepath}')
        return

    content = path.read_text(encoding='utf-8')
    filename = path.name

    print(f'=== Checking {filename} ===')
    print(f'File: {len(content)} chars, {len(content.splitlines())} lines')
    print()

    all_issues = []

    # 1. Count consistency
    issues = check_count_consistency(content, filename)
    if issues:
        print('[Count consistency]')
        for issue in issues:
            print(issue)
        all_issues.extend(issues)
        print()

    # 2. Timeline logic
    issues = check_timeline_logic(content, filename)
    if issues:
        print('[Timeline logic]')
        for issue in issues:
            print(issue)
        all_issues.extend(issues)
        print()

    # 3. Keyword contradictions
    issues = check_keywords_contradiction(content, filename)
    if issues:
        print('[Keyword contradictions]')
        for issue in issues:
            print(issue)
        all_issues.extend(issues)
        print()

    # 4. Egg continuity
    issues = check_egg_continuity(content, filename)
    if issues:
        print('[Egg continuity]')
        for issue in issues:
            print(issue)
        all_issues.extend(issues)
        print()

    # 5. Dialogue consistency
    issues = check_dialogue_consistency(content, filename)
    if issues:
        print('[Dialogue consistency]')
        for issue in issues:
            print(issue)
        all_issues.extend(issues)
        print()

    if not all_issues:
        print('[OK] No logic issues found')
    else:
        print(f'Total: {len(all_issues)} potential issues')

    # Statistics
    print()
    print('=== Statistics ===')
    chinese_chars = len(re.findall(r'[一-鿿]', content))
    print(f'Chinese chars: {chinese_chars}')
    print(f'Total chars: {len(content)}')

    sections = re.findall(r'^## ', content, re.MULTILINE)
    print(f'Sections: {len(sections)}')

    dialogues = re.findall(r'^".*?"$', content, re.MULTILINE)
    print(f'Dialogue lines: {len(dialogues)}')

    sex_scenes = re.findall(r'第[一二三四五]次', content)
    print(f'Sex scene mentions: {len(sex_scenes)}')

    egg_mentions = len(re.findall(r'跳蛋', content))
    print(f'Egg mentions: {egg_mentions}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python3 day_checker.py <day_file_path>')
        print('Example: python3 day_checker.py crushes/{{slug}}/memories/chats/day{{day}}.md')
        sys.exit(1)

    # Fix Windows GBK encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    run_all_checks(sys.argv[1])
