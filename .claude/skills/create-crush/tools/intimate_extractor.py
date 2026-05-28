#!/usr/bin/env python3
"""Intimate archive auto-extractor from day narrative files.

Usage: python3 intimate_extractor.py <day_file_path> [output_path]
"""

import re
import sys
from pathlib import Path


# Chinese numeral mapping
CN_DIGITS = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
             '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
             '十一': 11, '十二': 12, '十三': 13, '十四': 14,
             '十五': 15, '十六': 16, '十七': 17, '十八': 18,
             '十九': 19, '二十': 20, '二十一': 21, '二十二': 22,
             '二十三': 23, '二十四': 24, '二十五': 25}


def cn_to_int(s):
    """Convert Chinese numeral string to int."""
    return CN_DIGITS.get(s, 0)


def extract_time_markers(content):
    markers = []
    for match in re.finditer(r'^## (\d+:\d+) · (.+)$', content, re.MULTILINE):
        markers.append((match.group(1), match.group(2), match.start()))
    return markers


def extract_dialogues(content):
    """Extract dialogue lines with quotes."""
    dialogues = []
    for match in re.finditer(r'^"(.+?)"$', content, re.MULTILINE):
        text = match.group(1)
        if len(text) > 3:
            dialogues.append(text)
    return dialogues


def extract_climax_info(content):
    """Extract climax seconds and load counts (Chinese numerals).
    Only match explicit climax/loads descriptions, not generic time durations."""
    info = []
    seen_secs = set()
    seen_loads = set()
    # Match "高潮N秒" pattern (climax duration)
    for match in re.finditer(r'高潮([一二三四五六七八九十]+)秒', content):
        val = cn_to_int(match.group(1))
        if val > 0 and val not in seen_secs:
            seen_secs.add(val)
            info.append(f'{val}s')
    # Match "射了N股" or "他后到N股" (total count, not per-stroke)
    for match in re.finditer(r'(?:射了|后到|喷了)([一二三四五六七八九十]+)股', content):
        val = cn_to_int(match.group(1))
        if val > 0 and val not in seen_loads:
            seen_loads.add(val)
            info.append(f'{val}loads')
    return info


def extract_ycm_pill(content):
    """Extract YCM pill number. Look for '优思明' nearby to avoid false positives."""
    # Match "优思明...第N颗" within 30 chars (take last match)
    result = None
    for match in re.finditer(r'优思明.{0,30}第(\d+)颗', content):
        result = int(match.group(1))
    if result:
        return result
    # Fallback: "第N颗" near "优思明" in same paragraph
    for match in re.finditer(r'第(\d+)颗', content):
        ctx = content[max(0, match.start() - 50):match.end() + 50]
        if '优思明' in ctx:
            result = int(match.group(1))
    return result


def extract_handwriting(content):
    """Extract handwriting characters from palm/writing descriptions."""
    hw = []
    # Match 「X」 corner brackets after 写
    for match in re.finditer(r'写[了]?[一个].*?[「](.+?)[」]', content):
        for ch in match.group(1):
            if ch not in hw:
                hw.append(ch)
    # Match "写X" patterns in summary lines
    for match in re.finditer(r'[「](.+?)[」]', content):
        text = match.group(1)
        if len(text) <= 3 and '写' in content[max(0, match.start()-30):match.start()]:
            for ch in text:
                if ch not in hw:
                    hw.append(ch)
    # Match 手心写字 descriptions
    for match in re.finditer(r'手心.*?写.*?[「](.+?)[」]', content):
        for ch in match.group(1):
            if ch not in hw:
                hw.append(ch)
    return hw


def extract_she_said(content):
    """Extract quotes from the '她说的话' section."""
    said = []
    # Find "## 她说的话" section
    match = re.search(r'^## 她说的话\s*\n', content, re.MULTILINE)
    if match:
        section_start = match.end()
        # Find next ## heading
        next_heading = re.search(r'^## ', content[section_start:], re.MULTILINE)
        if next_heading:
            section = content[section_start:section_start + next_heading.start()]
        else:
            section = content[section_start:]
        for m in re.finditer(r'^- "(.+?)"', section, re.MULTILINE):
            said.append(m.group(1))
    return said


def get_section_text(content, time_start, time_end):
    """Get text between two time markers."""
    idx = content.find(f'## {time_start}', 0)
    if idx < 0:
        return ''
    next_idx = content.find('\n## ', idx + 1)
    if next_idx < 0:
        next_idx = len(content)
    if time_end:
        end_idx = content.find(f'## {time_end}', idx + 1)
        if 0 < end_idx < next_idx:
            next_idx = end_idx
    return content[idx:next_idx]


def generate_archive(day_file, day_number):
    content = day_file.read_text(encoding='utf-8')

    time_markers = extract_time_markers(content)
    climax_info = extract_climax_info(content)
    ycm_pill = extract_ycm_pill(content)
    handwriting = extract_handwriting(content)
    she_said = extract_she_said(content)

    lines = []
    lines.append(f'# Day {day_number} - Intimate Archive')
    lines.append('')
    lines.append('> Type: Intimate scene archive')

    date_match = re.search(r'Day (\d+).*?\((.+?)\)', content)
    if date_match:
        lines.append(f'> Date: Day {date_match.group(1)} ({date_match.group(2)})')

    lines.append('')
    lines.append('---')
    lines.append('')

    # Timeline
    lines.append('## Timeline')
    lines.append('')
    for i, (time, title, _) in enumerate(time_markers):
        lines.append(f'### {time} - {title}')
        # Get section text between this and next marker
        next_time = time_markers[i+1][0] if i+1 < len(time_markers) else None
        section = get_section_text(content, time, next_time)
        section_dialogues = re.findall(r'^"(.+?)"$', section, re.MULTILINE)
        for d in section_dialogues:
            if len(d) > 3:
                lines.append(f'- "{d}"')
        lines.append('')

    # She said
    if she_said:
        lines.append('## What She Said')
        lines.append('')
        for said in she_said[:15]:
            lines.append(f'- "{said}"')
        lines.append('')

    # Handwriting
    if handwriting:
        lines.append('## Handwriting')
        lines.append('')
        for hw in handwriting:
            lines.append(f'- She wrote "{hw}" on his palm')
        lines.append('')

    # Summary table
    lines.append('## Summary')
    lines.append('')
    lines.append('| Item | Data |')
    lines.append('|------|------|')
    lines.append(f'| Day | {day_number} |')
    if time_markers:
        lines.append(f'| Time | {time_markers[0][0]}~{time_markers[-1][0]} |')
    climax_secs = [x for x in climax_info if x.endswith('s')]
    if climax_secs:
        lines.append(f'| Climax | {", ".join(climax_secs)} |')
    loads = [x for x in climax_info if x.endswith('loads')]
    if loads:
        lines.append(f'| His climax | {", ".join(loads)} |')
    if handwriting:
        lines.append(f'| Handwriting | {", ".join(handwriting)} |')
    if ycm_pill:
        lines.append(f'| YCM | Pill #{ycm_pill} |')
    lines.append('')
    lines.append('---')
    lines.append('')
    if ycm_pill:
        lines.append('## YCM Record')
        lines.append('')
        lines.append(f'- Pill #{ycm_pill} (Day {day_number})')
        lines.append('')

    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 intimate_extractor.py <day_file_path> [output_path]')
        sys.exit(1)

    day_file = Path(sys.argv[1])
    if not day_file.exists():
        print(f'Error: file not found {sys.argv[1]}')
        sys.exit(1)

    day_match = re.search(r'day(\d+)', day_file.name)
    if not day_match:
        print(f'Error: cannot extract day number from {day_file.name}')
        sys.exit(1)
    day_number = int(day_match.group(1))

    archive = generate_archive(day_file, day_number)

    if len(sys.argv) > 2:
        output_path = Path(sys.argv[2])
    else:
        # Output to crushes/{slug}/memories/intimate/ (correct canonical path)
        # Input: crushes/{slug}/memories/chats/day{N}.md
        # Output: crushes/{slug}/memories/intimate/Day{N}_auto_extracted.md
        slug_dir = day_file.parent.parent.parent  # memories/chats -> slug
        intimate_dir = slug_dir / 'memories' / 'intimate'
        intimate_dir.mkdir(exist_ok=True)
        output_path = intimate_dir / f'Day{day_number}_auto_extracted.md'

    output_path.write_text(archive, encoding='utf-8')
    print(f'Generated: {output_path}')
    print(f'Lines: {len(archive.split(chr(10)))}')


if __name__ == '__main__':
    main()
