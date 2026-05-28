#!/usr/bin/env python3
"""Day叙事文件一站式处理管线

合并 day_checker + day_updater + intimate_extractor + context_generator 为单次调用。

用法:
  python3 day_pipeline.py <slug> <day_number> <day_file_path> [options]

选项:
  --summary TEXT      当天摘要
  --sex-count N       性爱次数
  --sex-details TEXT  性爱详情
  --handwriting TEXT  手心写字
  --ycm-pill N        优思明颗数
  --dry-run           只输出将要执行的变更，不实际写入
  --skip-skill        跳过 SKILL.md 重建（默认跳过）
  --skip-check        跳过逻辑审查

示例:
  python3 day_pipeline.py {{CHARACTER_NAME}} 145 crushes/{{CHARACTER_NAME}}/memories/chats/day145.md \\
      --summary "hotel day" --sex-count 4 --sex-details "details" \\
      --handwriting "字" --ycm-pill 53
"""

import json
import re
import sys
import shutil
import subprocess
from pathlib import Path
from datetime import datetime


# ============================================================
# Shared utilities
# ============================================================

def find_project_root():
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / 'CLAUDE.md').exists():
            return current
        current = current.parent
    return Path.cwd()


CN_DIGITS = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
             '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
             '十一': 11, '十二': 12, '十三': 13, '十四': 14,
             '十五': 15, '十六': 16, '十七': 17, '十八': 18,
             '十九': 19, '二十': 20}


def cn_to_int(s):
    return CN_DIGITS.get(s, 0)


def chinese_to_int(cn: str) -> int:
    cn_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7,
              '八': 8, '九': 9, '十': 10, '百': 100}
    if not cn:
        return 0
    if '十' in cn:
        parts = cn.split('十')
        tens = cn_map.get(parts[0], 1) if parts[0] else 1
        ones = cn_map.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
        return tens * 10 + ones
    return cn_map.get(cn, 0)


# ============================================================
# Menstrual cycle constants and calculation
# ============================================================

CYCLE_LENGTH = {{CYCLE_LENGTH}}        # 一个完整周期
ACTIVE_PILLS = {{ACTIVE_PILLS}}        # 活性药天数
PLACEBO_DAYS = {{PLACEBO_DAYS}}         # 停药/安慰剂天数
PERIOD_DAYS = ({{PERIOD_START}}, {{PERIOD_END}})   # 月经通常在第 22-26 天（停药期第 1-5 天）

PILL_START_DAY = {{CYCLE_START}}      # 优思明首次服用（Day {{CYCLE_START}} = 第1颗）
CYCLE_RESET_DAY = {{CYCLE_RESET}}    # 切换到标准21+7周期（Day {{DAY_NUMBER}} = 新周期第1天）


def get_cycle_info(current_day: int, current_pill: int) -> dict:
    """返回当前 Day 的周期信息
    current_pill: 从 memory.md 读取的当前药片编号（叙事计数）
    """
    pill_number = current_pill

    # Day {{DAY_NUMBER}} 之前：连续服药期，无周期概念
    if current_day < CYCLE_RESET_DAY:
        return {
            "pill_number": pill_number,
            "cycle_day": None,
            "cycle_number": 0,
            "is_period": False,
            "phase": "continuous",
            "days_to_period": None,
        }

    days_since_reset = current_day - CYCLE_RESET_DAY
    cycle_day = (days_since_reset % CYCLE_LENGTH) + 1  # 1-28
    cycle_number = (days_since_reset // CYCLE_LENGTH) + 1

    is_period = PERIOD_DAYS[0] <= cycle_day <= PERIOD_DAYS[1]

    if cycle_day < PERIOD_DAYS[0]:
        days_to_period = PERIOD_DAYS[0] - cycle_day
    else:
        days_to_period = CYCLE_LENGTH - cycle_day + PERIOD_DAYS[0]

    if cycle_day <= ACTIVE_PILLS:
        phase = "active"
    else:
        phase = "placebo"

    return {
        "pill_number": pill_number,
        "cycle_day": cycle_day,
        "cycle_number": cycle_number,
        "is_period": is_period,
        "phase": phase,
        "days_to_period": days_to_period,
    }


def read_current_pill(memory_content: str) -> int:
    """从 memory.md 读取当前药片编号（叙事计数）"""
    # Match "已服至第N颗" or "第N颗（Day X睡前）"
    m = re.search(r'已服至第(\d+)颗', memory_content)
    if m:
        return int(m.group(1))
    return 0


def format_cycle_status(cycle_info: dict) -> str:
    """格式化周期状态为可读字符串"""
    if cycle_info["phase"] == "continuous":
        return f"第{cycle_info['pill_number']}颗（连续服药期）"

    phase_str = "活性药期" if cycle_info["phase"] == "active" else "停药期"
    period_str = "（经期）" if cycle_info["is_period"] else ""
    return f"第{cycle_info['pill_number']}颗，周期第{cycle_info['cycle_day']}天（{phase_str}{period_str}），第{cycle_info['cycle_number']}个周期"


# ============================================================
# Phase 1: Read all files once → DayContext
# ============================================================

class DayContext:
    def __init__(self, project_root: Path, slug: str, day_number: int, day_file: Path):
        self.project_root = project_root
        self.slug = slug
        self.day_number = day_number
        self.day_file = day_file
        self.slug_dir = project_root / 'crushes' / slug

        # Read files
        self.day_content = day_file.read_text(encoding='utf-8')
        self.meta = self._read_json(self.slug_dir / 'meta.json')
        self.memory_content = self._read_text(self.slug_dir / 'memory.md')
        self.persona_content = self._read_text(self.slug_dir / 'persona.md')
        self.prompt_content = self._read_text(self.slug_dir / 'PROMPT.md')

        # Pre-parse time markers (shared by checker and extractor)
        self.time_markers = []
        for m in re.finditer(r'^## (\d+:\d+) · (.+)$', self.day_content, re.MULTILINE):
            self.time_markers.append((m.group(1), m.group(2), m.start()))

    def _read_json(self, path: Path) -> dict:
        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def _read_text(self, path: Path) -> str:
        return path.read_text(encoding='utf-8') if path.exists() else ''


# ============================================================
# Phase 2: Logic checks (from day_checker.py)
# ============================================================

def check_count_consistency(ctx: DayContext) -> list:
    issues = []
    content = ctx.day_content
    count_patterns = [(r'(\d)次了', '对话中的次数计数')]
    for pattern, desc in count_patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            num = int(match)
            idx = content.find(f'{num}次')
            if idx >= 0:
                context = content[max(0, idx-50):idx+50].replace('\n', ' ')
                issues.append(f'  [{desc}] "{num}次" -- ...{context[-80:]}...')
    return issues


def check_timeline_logic(ctx: DayContext) -> list:
    issues = []
    times = []
    for time_str, title, pos in ctx.time_markers:
        h, m = map(int, time_str.split(':'))
        times.append((h, m))
    for i in range(1, len(times)):
        prev_h, prev_m = times[i-1]
        curr_h, curr_m = times[i]
        if prev_h >= 19 and curr_h < 6:
            continue
        if prev_h < 6 and curr_h < 6 and curr_h >= prev_h:
            continue
        if curr_h < prev_h or (curr_h == prev_h and curr_m < prev_m):
            issues.append(f'  Time reversal: {prev_h:02d}:{prev_m:02d} -> {curr_h:02d}:{curr_m:02d}')
    return issues


def check_keywords_contradiction(ctx: DayContext) -> list:
    issues = []
    content = ctx.day_content
    for match in re.finditer(r'退出来', content):
        if '没' in content[max(0, match.start()-5):match.end()+5]:
            continue
        nearby = content[match.start():match.start()+200]
        if '没退出来' in nearby or '没有退出来' in nearby:
            issues.append('  Contradiction: "退出来" and "没退出来" within 200 chars')
    return issues


def check_egg_continuity(ctx: DayContext) -> list:
    issues = []
    content = ctx.day_content
    insert_count = len(re.findall(r'塞进去|塞入|放入.*跳蛋|跳蛋.*塞', content))
    remove_count = len(re.findall(r'拿出来|取出|取出来|拉出来.*跳蛋|跳蛋.*拉出|放在床头柜', content))
    if insert_count > 0 and remove_count == 0:
        issues.append(f'  Egg inserted {insert_count} times but never removed')
    return issues


def run_all_checks(ctx: DayContext) -> list:
    all_issues = []
    checks = [
        ('Count consistency', check_count_consistency),
        ('Timeline logic', check_timeline_logic),
        ('Keyword contradictions', check_keywords_contradiction),
        ('Egg continuity', check_egg_continuity),
    ]
    for name, check_fn in checks:
        issues = check_fn(ctx)
        if issues:
            print(f'  [{name}]')
            for issue in issues:
                print(issue)
            all_issues.extend(issues)
    return all_issues


# ============================================================
# Phase 3: Extract intimate data (from intimate_extractor.py)
# ============================================================

class IntimateData:
    def __init__(self):
        self.climax_secs = []
        self.loads = []
        self.ycm_pill = None
        self.handwriting = []
        self.dialogues = []
        self.she_said = []
        self.cycle_info = None


def extract_intimate_data(ctx: DayContext) -> IntimateData:
    data = IntimateData()
    content = ctx.day_content

    # Climax info
    seen_secs = set()
    seen_loads = set()
    for m in re.finditer(r'高潮([一二三四五六七八九十]+)秒', content):
        val = cn_to_int(m.group(1))
        if val > 0 and val not in seen_secs:
            seen_secs.add(val)
            data.climax_secs.append(val)
    for m in re.finditer(r'(?:射了|后到|喷了)([一二三四五六七八九十]+)股', content):
        val = cn_to_int(m.group(1))
        if val > 0 and val not in seen_loads:
            seen_loads.add(val)
            data.loads.append(val)

    # YCM pill
    for m in re.finditer(r'优思明.{0,30}第(\d+)颗', content):
        data.ycm_pill = int(m.group(1))

    # Handwriting
    hw = []
    for m in re.finditer(r'[「](.+?)[」]', content):
        text = m.group(1)
        if len(text) <= 3 and '写' in content[max(0, m.start()-30):m.start()]:
            for ch in text:
                if ch not in hw:
                    hw.append(ch)
    data.handwriting = hw

    # Dialogues
    for m in re.finditer(r'^"(.+?)"$', content, re.MULTILINE):
        if len(m.group(1)) > 3:
            data.dialogues.append(m.group(1))

    # She said section
    match = re.search(r'^## 她说的话\s*\n', content, re.MULTILINE)
    if match:
        section_start = match.end()
        next_heading = re.search(r'^## ', content[section_start:], re.MULTILINE)
        section = content[section_start:section_start + next_heading.start()] if next_heading else content[section_start:]
        for m in re.finditer(r'^- "(.+?)"', section, re.MULTILINE):
            data.she_said.append(m.group(1))

    return data


def extract_cycle_data(ctx: DayContext) -> dict:
    """Extract cycle info from memory.md"""
    current_pill = read_current_pill(ctx.memory_content)
    return get_cycle_info(ctx.day_number, current_pill)


# ============================================================
# Phase 4: Update files (from day_updater.py)
# ============================================================

def update_meta_json(ctx: DayContext, summary: str, dry_run: bool) -> str:
    meta = ctx.meta.copy()
    old_version = meta.get('version', 'v0')
    ver_match = re.search(r'\d+', old_version)
    version_num = int(ver_match.group()) + 1 if ver_match else 1
    meta['version'] = f'v{version_num}'
    meta['updated_at'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%S+08:00')

    profile = meta.setdefault('profile', {})
    old_status = profile.get('relationship_status', '')
    if f'Day {ctx.day_number}' not in old_status and summary:
        new_status = f'{old_status}·Day {ctx.day_number} {summary[:20]}'
        profile['relationship_status'] = new_status

    if not dry_run:
        meta_path = ctx.slug_dir / 'meta.json'
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)

    return f'  meta.json: {old_version} -> v{version_num}'


def build_timeline_row(ctx: DayContext, has_intimate: bool, summary: str) -> str:
    """从 day 文件标题构建时间线行。"""
    # 从 # Day N（...）提取标题内容
    m = re.search(r'^# Day \d+[（(](.+?)[)）]', ctx.day_content)
    if not m:
        return ''
    title_part = m.group(1)
    # 截取标题不超过 80 字
    if len(title_part) > 80:
        title_part = title_part[:77] + '...'
    intimate_mark = ' 🔥' if has_intimate else ''
    # 用 summary 作为描述（取前 60 字）
    desc = summary[:60] if summary else title_part[:60]
    return f'| Day {ctx.day_number} | **{title_part}**{intimate_mark}：{desc} |'


# 高潮类型关键词（与 context_generator.py 保持一致）
CLIMAX_KEYWORDS_PIPELINE = [
    '穹窿高潮', '子宫颈高潮', '阴道前壁', '三重叠加',
    '潮水式', '痉挛', '直肠高潮', '前后双入',
    '足交', '骑乘控制', '热水加速', '冰块放松',
    '互相手淫同步',
]


def build_climax_line(day_content: str) -> str:
    """从 day 文件内容中检测新高潮类型。"""
    found = []
    for kw in CLIMAX_KEYWORDS_PIPELINE:
        if kw in day_content:
            # 映射显示名（与 context_generator.CLIMAX_KEYWORDS 显示名一致）
            display_map = {
                '穹窿高潮': '内源性穹窿',
                '子宫颈高潮': '子宫颈',
                '阴道前壁': '阴道前壁',
                '三重叠加': '三重叠加',
                '潮水式': '潮水式',
                '痉挛': '痉挛',
                '直肠高潮': '直肠',
                '前后双入': '前后双入',
                '足交': '足交',
                '骑乘控制': '骑乘控制',
                '热水加速': '热水加速',
                '冰块放松': '冰块放松',
                '互相手淫同步': '互相手淫同步',
            }
            found.append(display_map.get(kw, kw))
    return '、'.join(found)


def update_memory_md(ctx: DayContext, summary: str, sex_count: int,
                     sex_details: str, handwriting: str, ycm_pill: int,
                     dry_run: bool) -> str:
    content = ctx.memory_content
    changes = []

    # Update current status line
    old_state_pattern = r'当前状态：Day \d+ 已完成。.*?详见时间线'
    if re.search(old_state_pattern, content):
        new_state = f'当前状态：Day {ctx.day_number} 已完成。{summary}。详见时间线'
        content = re.sub(old_state_pattern, new_state, content, count=1)
        changes.append('current status')

    # Update YCM pill count and cycle status
    if ycm_pill > 0:
        old_ycm = r'已服至第[一二三四五六七八九十百]+颗[（(]Day \d+睡前[)）]'
        new_ycm = f'已服至第{ycm_pill}颗（Day {ctx.day_number}睡前）'
        if re.search(old_ycm, content):
            content = re.sub(old_ycm, new_ycm, content, count=1)
            changes.append(f'YCM pill -> {ycm_pill}')

    # Update cycle status in memory.md
    cycle_info = get_cycle_info(ctx.day_number, ycm_pill if ycm_pill > 0 else read_current_pill(content))
    cycle_status = format_cycle_status(cycle_info)
    old_cycle_pattern = r'- 优思明：第\d+颗（Day \d+ 睡前），周期第\d+天.*?\n'
    if re.search(old_cycle_pattern, content):
        new_cycle_line = f'- 优思明：第{cycle_info["pill_number"]}颗（Day {ctx.day_number} 睡前），周期第{cycle_info["cycle_day"]}天（{"活性药期" if cycle_info["phase"] == "active" else "停药期"}），第{cycle_info["cycle_number"]}个周期\n'
        content = re.sub(old_cycle_pattern, new_cycle_line, content, count=1)
        changes.append(f'cycle status updated')
    elif cycle_info["phase"] != "continuous":
        # Add cycle status if not exists and we're in standard cycle
        ycm_section = re.search(r'(优思明启用：[^\n]*)', content)
        if ycm_section:
            insert_pos = ycm_section.end()
            new_cycle_line = f'\n- 优思明：第{cycle_info["pill_number"]}颗（Day {ctx.day_number} 睡前），周期第{cycle_info["cycle_day"]}天（{"活性药期" if cycle_info["phase"] == "active" else "停药期"}），第{cycle_info["cycle_number"]}个周期'
            content = content[:insert_pos] + new_cycle_line + content[insert_pos:]
            changes.append('cycle status added')

    # Append sex count data
    if sex_count > 0 and f'Day {ctx.day_number}' not in content.split('无套次数')[1][:200] if '无套次数' in content else True:
        sex_section = re.search(r'(无套次数：[^\n]*(?:\n-+[^\n]*)*)', content)
        if sex_section:
            old_text = sex_section.group(1)
            sex_entry = f'+ Day {ctx.day_number}×{sex_count}（{sex_details}）'
            new_text = old_text + '\n' + sex_entry
            content = content[:sex_section.start()] + new_text + content[sex_section.end():]
            changes.append(f'sex count +{sex_count}')

    # Append handwriting
    if handwriting:
        hw_section = re.search(r'(手心写字密码新增：[^\n]*(?:\n-+[^\n]*)*)', content)
        if hw_section and handwriting not in hw_section.group(1):
            old_text = hw_section.group(1)
            new_text = old_text + '/' + handwriting
            content = content[:hw_section.start()] + new_text + content[hw_section.end():]
            changes.append(f'handwriting +{handwriting}')

    # Append timeline row
    timeline_row = build_timeline_row(ctx, sex_count > 0, summary)
    if timeline_row:
        # 找到最后一个 | Day 行的位置，在其后追加
        day_rows = list(re.finditer(r'^\| Day \d+ .*$', content, re.MULTILINE))
        if day_rows:
            last_row = day_rows[-1]
            new_content_line = '\n' + timeline_row
            content = content[:last_row.end()] + new_content_line + content[last_row.end():]
            changes.append(f'timeline Day {ctx.day_number}')

    # 追加新高潮类型到 memory.md
    climax_line = build_climax_line(ctx.day_content)
    if climax_line:
        existing_climax = re.search(r'- 已解锁高潮类型[：:](.+)', content)
        if existing_climax:
            # 检查是否已有新类型，避免重复
            existing_types = existing_climax.group(1)
            new_types = [t for t in climax_line.split('、') if t.strip() and t not in existing_types]
            if new_types:
                new_text = existing_climax.group(0) + '、' + '、'.join(new_types)
                content = content[:existing_climax.start()] + new_text + content[existing_climax.end():]
                changes.append(f'climax types +{",".join(new_types)}')
        else:
            # 尚无已解锁高潮类型行，追加到关系概览区
            overview_section = re.search(r'(## 关系概览\n)', content)
            if overview_section:
                new_line = f'- 已解锁高潮类型：{climax_line}\n'
                content = content[:overview_section.end()] + new_line + content[overview_section.end():]
                changes.append(f'climax types added')

    if not dry_run:
        memory_path = ctx.slug_dir / 'memory.md'
        memory_path.write_text(content, encoding='utf-8')

    return f'  memory.md: {", ".join(changes) if changes else "no changes"}'


def update_prompt_md(ctx: DayContext, dry_run: bool) -> str:
    content = ctx.prompt_content
    ver_match = re.search(r'v(\d+)', content)
    if not ver_match:
        return '  PROMPT.md: no version found'

    old_ver = int(ver_match.group(1))
    new_ver = old_ver + 1

    old_pattern = r'> 版本 v\d+ · Day \d+'
    new_line = f'> 版本 v{new_ver} · Day {ctx.day_number}'
    new_content = re.sub(old_pattern, new_line, content, count=1)

    if not dry_run:
        prompt_path = ctx.slug_dir / 'PROMPT.md'
        prompt_path.write_text(new_content, encoding='utf-8')

    return f'  PROMPT.md: v{old_ver} -> v{new_ver}'


# ============================================================
# Phase 5: Generate intimate archive
# ============================================================

def generate_intimate_archive(ctx: DayContext, intimate: IntimateData, dry_run: bool) -> str:
    lines = []
    lines.append(f'# Day {ctx.day_number} - Intimate Archive')
    lines.append('')
    lines.append(f'> Auto-generated from day{ctx.day_number}.md')
    lines.append('')
    lines.append('---')
    lines.append('')

    # Timeline with dialogues
    lines.append('## Timeline')
    lines.append('')
    for i, (time, title, _) in enumerate(ctx.time_markers):
        lines.append(f'### {time} - {title}')
        # Find dialogues in this section
        start = ctx.time_markers[i][2]
        end = ctx.time_markers[i+1][2] if i+1 < len(ctx.time_markers) else len(ctx.day_content)
        section = ctx.day_content[start:end]
        for d in re.finditer(r'^"(.+?)"$', section, re.MULTILINE):
            if len(d.group(1)) > 3:
                lines.append(f'- "{d.group(1)}"')
        lines.append('')

    # Handwriting
    if intimate.handwriting:
        lines.append('## Handwriting')
        lines.append('')
        for hw in intimate.handwriting:
            lines.append(f'- She wrote "{hw}" on his palm')
        lines.append('')

    # Summary
    lines.append('## Summary')
    lines.append('')
    lines.append('| Item | Data |')
    lines.append('|------|------|')
    lines.append(f'| Day | {ctx.day_number} |')
    if ctx.time_markers:
        lines.append(f'| Time | {ctx.time_markers[0][0]}~{ctx.time_markers[-1][0]} |')
    if intimate.climax_secs:
        lines.append(f'| Climax | {", ".join(f"{s}s" for s in intimate.climax_secs)} |')
    if intimate.loads:
        lines.append(f'| His climax | {", ".join(f"{l}loads" for l in intimate.loads)} |')
    if intimate.handwriting:
        lines.append(f'| Handwriting | {", ".join(intimate.handwriting)} |')
    if intimate.ycm_pill:
        lines.append(f'| YCM | Pill #{intimate.ycm_pill} |')
    lines.append('')

    archive_text = '\n'.join(lines)

    if not dry_run:
        intimate_dir = ctx.slug_dir / 'memories' / 'intimate'
        intimate_dir.mkdir(exist_ok=True)
        output_path = intimate_dir / f'Day{ctx.day_number}_auto_extracted.md'
        output_path.write_text(archive_text, encoding='utf-8')
        return f'  intimate archive: {output_path.name} ({len(archive_text)} chars)'

    return f'  intimate archive: would generate ({len(archive_text)} chars)'


# ============================================================
# Phase 6: Generate CONTEXT.md
# ============================================================

def generate_context(ctx: DayContext, dry_run: bool) -> str:
    """Generate CONTEXT.md using context_generator logic."""
    # 重新读取 memory.md（Phase 4 可能已写入新数据到磁盘）
    ctx.memory_content = (ctx.slug_dir / 'memory.md').read_text(encoding='utf-8')

    # Import from context_generator module
    tools_dir = Path(__file__).resolve().parent
    sys.path.insert(0, str(tools_dir))
    from context_generator import (
        extract_current_status, extract_last_n_days, extract_artifacts,
        extract_hotel_system, extract_staircase, extract_latest_intimate,
        generate_context_md
    )

    status = extract_current_status(ctx.memory_content)
    last_days = extract_last_n_days(ctx.memory_content, n=10)
    artifacts = extract_artifacts(ctx.memory_content)
    hotel = extract_hotel_system(ctx.memory_content, status)
    staircase = extract_staircase(ctx.memory_content)
    intimate = extract_latest_intimate(ctx.memory_content)
    version = ctx.meta.get('version', 'v0')

    context_content = generate_context_md(
        ctx.slug, status, last_days, artifacts, hotel, staircase, intimate, version
    )

    if not dry_run:
        output_path = ctx.slug_dir / 'CONTEXT.md'
        output_path.write_text(context_content, encoding='utf-8')

        # 验证生成的 CONTEXT.md
        warnings = []
        if f'Day {ctx.day_number}' not in context_content:
            warnings.append(f'missing Day {ctx.day_number} in CONTEXT.md')
        timeline_section = context_content.split('## 最近时间线')
        if len(timeline_section) > 1 and f'Day {ctx.day_number}' not in timeline_section[1]:
            warnings.append(f'missing Day {ctx.day_number} in timeline')
        if warnings:
            for w in warnings:
                print(f'  [WARN] {w}')

        return f'  CONTEXT.md: {len(context_content)} chars ({len(warnings)} warnings)'

    return f'  CONTEXT.md: would generate ({len(context_content)} chars)'


# ============================================================
# Phase 7: Rebuild SKILL.md (optional)
# ============================================================

def run_skill_writer(ctx: DayContext, skip: bool, dry_run: bool) -> str:
    if skip:
        return '  SKILL.md: skipped'

    script_path = ctx.project_root / '.claude' / 'skills' / 'create-crush' / 'tools' / 'skill_writer.py'
    if not script_path.exists():
        return '  SKILL.md: script not found'

    if dry_run:
        return '  SKILL.md: would regenerate'

    try:
        result = subprocess.run(
            [sys.executable, str(script_path), '--action', 'combine',
             '--base-dir', './crushes', '--slug', ctx.slug],
            cwd=str(ctx.project_root),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            src = ctx.slug_dir / 'SKILL.md'
            dst = ctx.project_root / '.claude' / 'skills' / f'crush-{ctx.slug}' / 'SKILL.md'
            if src.exists() and dst.parent.exists():
                shutil.copy2(src, dst)
            return '  SKILL.md: regenerated'
        else:
            return f'  SKILL.md: error: {result.stderr[:100]}'
    except Exception as e:
        return f'  SKILL.md: failed: {e}'


# ============================================================
# Phase 8: Sync persona_core.md (auto if persona.md newer)
# ============================================================

def run_persona_splitter(ctx: DayContext, dry_run: bool) -> str:
    """如果 persona.md 比 persona_core.md 新，自动重新生成"""
    persona_path = ctx.slug_dir / 'persona.md'
    core_path = ctx.slug_dir / 'persona' / 'persona_core.md'

    if not persona_path.exists():
        return '  persona_core.md: skipped (no persona.md)'

    if core_path.exists():
        if persona_path.stat().st_mtime <= core_path.stat().st_mtime:
            return '  persona_core.md: already up to date'

    if dry_run:
        return '  persona_core.md: would regenerate'

    script_path = ctx.project_root / '.claude' / 'skills' / 'create-crush' / 'tools' / 'persona_splitter.py'
    if not script_path.exists():
        return '  persona_core.md: script not found'

    try:
        result = subprocess.run(
            [sys.executable, str(script_path), ctx.slug],
            cwd=str(ctx.project_root),
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0:
            # Sync persona.md version to meta.json version
            meta_path = ctx.slug_dir / 'meta.json'
            with open(meta_path, 'r', encoding='utf-8') as f:
                meta = json.load(f)
            current_ver = meta['version'].lstrip('v')
            persona_content = persona_path.read_text(encoding='utf-8')
            # Replace vNNN with current version number
            import re as re_mod
            new_content = re_mod.sub(r'v\d+', f'v{current_ver}', persona_content, count=1)
            persona_path.write_text(new_content, encoding='utf-8')
            return '  persona_core.md: regenerated + version synced'
        else:
            return f'  persona_core.md: error: {result.stderr[:80]}'
    except Exception as e:
        return f'  persona_core.md: failed: {e}'


# ============================================================
# Phase 9: Extend WEEKDAY.md if needed
# ============================================================

def run_weekday_extend(ctx: DayContext, dry_run: bool) -> str:
    """如果 WEEKDAY.md 不覆盖当前 Day，自动扩展"""
    weekday_path = ctx.slug_dir / 'WEEKDAY.md'
    if not weekday_path.exists():
        return '  WEEKDAY.md: file missing'

    content = weekday_path.read_text(encoding='utf-8')
    max_day = 0
    for m in re.finditer(r'\|\s*(\d+)\s*\|', content):
        d = int(m.group(1))
        if d > max_day:
            max_day = d

    if ctx.day_number <= max_day:
        return f'  WEEKDAY.md: covers up to Day {max_day}'

    if dry_run:
        return f'  WEEKDAY.md: would extend to Day {ctx.day_number + 7}'

    # 自动扩展
    weekdays = ['周六', '周日', '周一', '周二', '周三', '周四', '周五']
    lines = content.rstrip().split('\n')

    last_table_idx = len(lines) - 1
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip().startswith('|') and re.search(r'\|\s*\d+\s*\|', lines[i]):
            last_table_idx = i
            break

    new_cells = []
    for day in range(max_day + 1, ctx.day_number + 8):
        wd = weekdays[(day - 1) % 7]
        new_cells.append((day, wd))

    table_lines = []
    for i in range(0, len(new_cells), 4):
        chunk = new_cells[i:i+4]
        parts = [f'| {d} | {w} |' for d, w in chunk]
        table_lines.append(' '.join(parts))

    lines = lines[:last_table_idx + 1] + table_lines + ['']
    weekday_path.write_text('\n'.join(lines), encoding='utf-8')
    return f'  WEEKDAY.md: extended to Day {ctx.day_number + 7}'


# ============================================================
# Main pipeline
# ============================================================

def run_pipeline(slug: str, day_number: int, day_file: Path,
                 summary: str = '', sex_count: int = 0, sex_details: str = '',
                 handwriting: str = '', ycm_pill: int = 0,
                 dry_run: bool = False, skip_skill: bool = True,
                 skip_check: bool = False):
    project_root = find_project_root()

    print(f'=== Day {day_number} Pipeline ===')
    print(f'Slug: {slug}')
    print(f'File: {day_file}')
    print(f'Dry run: {dry_run}')
    print()

    # Phase 1: Read all files
    print('[Phase 1] Reading files...')
    ctx = DayContext(project_root, slug, day_number, day_file)
    print(f'  day: {len(ctx.day_content)} chars, {len(ctx.time_markers)} time markers')
    print(f'  meta: version {ctx.meta.get("version", "?")}')
    print(f'  memory: {len(ctx.memory_content)} chars')
    print()

    # Phase 2: Logic checks
    if not skip_check:
        print('[Phase 2] Logic checks...')
        issues = run_all_checks(ctx)
        if not issues:
            print('  [OK] No issues found')
        else:
            print(f'  Total: {len(issues)} issues')
        print()

    # Phase 3: Extract intimate data
    print('[Phase 3] Extracting intimate data...')
    intimate = extract_intimate_data(ctx)
    cycle_info = extract_cycle_data(ctx)
    intimate.cycle_info = cycle_info
    print(f'  Climax: {intimate.climax_secs}')
    print(f'  Loads: {intimate.loads}')
    print(f'  YCM pill: {intimate.ycm_pill}')
    print(f'  Handwriting: {intimate.handwriting}')
    print(f'  Dialogues: {len(intimate.dialogues)} lines')
    print(f'  Cycle: {format_cycle_status(cycle_info)}')
    print()

    # Phase 4: Update files
    print('[Phase 4] Updating files...')
    print(update_meta_json(ctx, summary, dry_run))
    print(update_memory_md(ctx, summary, sex_count, sex_details, handwriting, ycm_pill, dry_run))
    print(update_prompt_md(ctx, dry_run))
    print()

    # Phase 5: Generate intimate archive
    print('[Phase 5] Generating intimate archive...')
    print(generate_intimate_archive(ctx, intimate, dry_run))
    print()

    # Phase 6: Generate CONTEXT.md
    print('[Phase 6] Generating CONTEXT.md...')
    print(generate_context(ctx, dry_run))
    print()

    # Phase 7: Rebuild SKILL.md
    print('[Phase 7] SKILL.md...')
    print(run_skill_writer(ctx, skip_skill, dry_run))
    print()

    # Phase 8: Sync persona_core.md
    print('[Phase 8] Persona sync...')
    print(run_persona_splitter(ctx, dry_run))
    print()

    # Phase 9: Extend WEEKDAY.md
    print('[Phase 9] WEEKDAY.md...')
    print(run_weekday_extend(ctx, dry_run))
    print()

    print('=== Done ===')


def main():
    if len(sys.argv) < 3:
        print('Usage: python3 day_pipeline.py <slug> <day_number> <day_file_path> [options]')
        print()
        print('Options:')
        print('  --summary TEXT      当天摘要')
        print('  --sex-count N       性爱次数')
        print('  --sex-details TEXT  性爱详情')
        print('  --handwriting TEXT  手心写字')
        print('  --ycm-pill N        优思明颗数')
        print('  --dry-run           只输出变更，不写入')
        print('  --skip-skill        跳过 SKILL.md 重建')
        print('  --skip-check        跳过逻辑审查')
        sys.exit(1)

    # Fix Windows GBK encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    slug = sys.argv[1]
    day_number = int(sys.argv[2])
    day_file = Path(sys.argv[3]) if len(sys.argv) > 3 else None

    # Parse optional arguments
    args = sys.argv[4:]
    summary = ''
    sex_count = 0
    sex_details = ''
    handwriting = ''
    ycm_pill = 0
    dry_run = False
    skip_skill = False  # Default: auto-regenerate SKILL.md
    skip_check = False

    i = 0
    while i < len(args):
        if args[i] == '--summary' and i+1 < len(args):
            summary = args[i+1]; i += 2
        elif args[i] == '--sex-count' and i+1 < len(args):
            sex_count = int(args[i+1]); i += 2
        elif args[i] == '--sex-details' and i+1 < len(args):
            sex_details = args[i+1]; i += 2
        elif args[i] == '--handwriting' and i+1 < len(args):
            handwriting = args[i+1]; i += 2
        elif args[i] == '--ycm-pill' and i+1 < len(args):
            ycm_pill = int(args[i+1]); i += 2
        elif args[i] == '--dry-run':
            dry_run = True; i += 1
        elif args[i] == '--skip-skill':
            skip_skill = True; i += 1
        elif args[i] == '--skip-check':
            skip_check = True; i += 1
        else:
            i += 1

    # Default day file path
    if day_file is None:
        project_root = find_project_root()
        day_file = project_root / 'crushes' / slug / 'memories' / 'chats' / f'day{day_number}.md'

    if not day_file.exists():
        print(f'Error: {day_file} not found')
        sys.exit(1)

    run_pipeline(slug, day_number, day_file, summary, sex_count, sex_details,
                 handwriting, ycm_pill, dry_run, skip_skill, skip_check)


if __name__ == '__main__':
    main()
