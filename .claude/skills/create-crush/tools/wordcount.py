#!/usr/bin/env python3
"""
计算 day{N}.md 正文字数（不含标题、分隔线、关系进展记录表等元数据）

用法：
  python wordcount.py <文件路径>              # 计算单个文件
  python wordcount.py <目录>                 # 计算目录下所有 day*.md
  python wordcount.py <文件路径> --detail     # 显示详细信息
  python wordcount.py <目录> --sort           # 按字数排序
"""

import sys
import os
import re
import glob


def has_intimate_in_body(body_text):
    """判断正文是否包含亲密内容（只检查正文，不检查元数据）"""
    intimate_keywords = ['高潮', '痉挛', '释放', '进入她的身体', '他后到', '收缩持续了']
    for keyword in intimate_keywords:
        if keyword in body_text:
            return True
    return False


def count_body_text(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')

    total_chars = len(content)

    # 找到正文开始位置：第一个 ## HH:MM 开头的行
    body_start = None
    for i, line in enumerate(lines):
        if re.match(r'^## \d{1,2}:\d{2} ', line):
            body_start = i
            break

    if body_start is None:
        return {
            'file': os.path.basename(filepath),
            'total': total_chars,
            'body': total_chars,
            'meta': 0,
            'lines': len(lines),
            'body_lines': len(lines),
            'start_line': 1,
            'end_line': len(lines),
            'is_intimate': False,
        }

    # 找到正文结束位置：从文件末尾往回找，找到 "---" 后面紧跟 "## Day N 关系进展记录" 的位置
    body_end = len(lines)
    # 从后往前找关系进展记录表
    for i in range(len(lines) - 1, body_start, -1):
        line = lines[i].strip()
        if re.match(r'^## Day \d+ 关系进展记录', line):
            # 往前找到对应的 --- 分隔线
            for j in range(i - 1, body_start, -1):
                if lines[j].strip() == '---':
                    body_end = j
                    break
            else:
                # 没找到 ---，直接从关系进展记录开始
                body_end = i
            break

    # 计算正文字数
    body_text = '\n'.join(lines[body_start:body_end])
    body_chars = len(body_text)
    meta_chars = total_chars - body_chars

    # 判断正文是否包含亲密内容（只检查正文，不检查标题和元数据）
    is_intimate = has_intimate_in_body(body_text)

    return {
        'file': os.path.basename(filepath),
        'total': total_chars,
        'body': body_chars,
        'meta': meta_chars,
        'lines': len(lines),
        'body_lines': body_end - body_start,
        'start_line': body_start + 1,
        'end_line': body_end,
        'is_intimate': is_intimate,
    }


def format_number(n):
    return f"{n:,}"


def print_result(result, detail=False):
    name = result['file']
    total = result['total']
    body = result['body']
    is_intimate = result.get('is_intimate', False)

    if is_intimate:
        # 有亲密内容：目标15000+
        if body >= 15000:
            status = "[OK-hot]"
        elif body >= 12000:
            status = "[~~hot]"
        else:
            status = "[!!hot]"
        target_desc = "15k+"
    else:
        # 无亲密内容：目标8000+
        if body >= 8000:
            status = "[OK-day]"
        elif body >= 6000:
            status = "[~~day]"
        else:
            status = "[!!day]"
        target_desc = " 8k+"

    print(f"  {name:<35} body: {format_number(body):>8}  total: {format_number(total):>8}  {status}  ({target_desc})")

    if detail:
        print(f"    body lines: {result['body_lines']}  total lines: {result['lines']}")
        print(f"    body range: line {result['start_line']} ~ line {result['end_line']}")
        print(f"    meta: {format_number(result['meta'])} chars")
        print(f"    intimate: {'Yes' if is_intimate else 'No'}")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = sys.argv[1]
    detail = '--detail' in sys.argv
    sort_by = '--sort' in sys.argv

    files = []
    if os.path.isdir(target):
        pattern = os.path.join(target, 'day*.md')
        files = sorted(glob.glob(pattern))
        if not files:
            print(f"No day*.md files found in {target}")
            sys.exit(1)
    elif os.path.isfile(target):
        files = [target]
    else:
        print(f"Not found: {target}")
        sys.exit(1)

    results = []
    for f in files:
        results.append(count_body_text(f))

    if sort_by:
        results.sort(key=lambda x: x['body'], reverse=True)

    print()
    print("=" * 60)
    print("  Word Count (daily: 8k+ / intimate: 15k+)")
    print("=" * 60)

    total_body = 0
    total_all = 0
    for r in results:
        print_result(r, detail)
        total_body += r['body']
        total_all += r['total']

    print("-" * 60)
    print(f"  Files: {len(results)}")
    print(f"  Body total: {format_number(total_body)}")
    print(f"  All total:  {format_number(total_all)}")

    intimate_results = [r for r in results if r.get('is_intimate', False)]
    daily_results = [r for r in results if not r.get('is_intimate', False)]

    intimate_ok = sum(1 for r in intimate_results if r['body'] >= 15000)
    intimate_fail = sum(1 for r in intimate_results if r['body'] < 15000)
    daily_ok = sum(1 for r in daily_results if r['body'] >= 8000)
    daily_fail = sum(1 for r in daily_results if r['body'] < 8000)

    print(f"  Intimate(>=15k): {intimate_ok} ok / {intimate_fail} fail")
    print(f"  Daily(>=8k): {daily_ok} ok / {daily_fail} fail")
    print("=" * 60)
    print()


if __name__ == '__main__':
    main()
