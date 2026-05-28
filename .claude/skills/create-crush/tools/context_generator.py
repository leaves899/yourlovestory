#!/usr/bin/env python3
"""从 memory.md + meta.json 生成压缩上下文 CONTEXT.md

用法: python3 context_generator.py <slug>

输出: crushes/{slug}/CONTEXT.md (~5K)
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

# 高潮类型关键词映射（新增高潮类型时在此追加）
# 格式：memory.md中包含的关键词 → CONTEXT.md中显示的名称
CLIMAX_KEYWORDS = [
    ('{{CLIMAX_TYPE_1}}', '{{CLIMAX_TYPE_1_DISPLAY}}'),
    ('{{CLIMAX_TYPE_2}}', '{{CLIMAX_TYPE_2_DISPLAY}}'),
    ('{{CLIMAX_TYPE_3}}', '{{CLIMAX_TYPE_3_DISPLAY}}'),
    ('{{CLIMAX_TYPE_4}}', '{{CLIMAX_TYPE_4_DISPLAY}}'),
    ('{{CLIMAX_TYPE_5}}', '{{CLIMAX_TYPE_5_DISPLAY}}'),
    ('{{CLIMAX_TYPE_6}}', '{{CLIMAX_TYPE_6_DISPLAY}}'),
    ('{{CLIMAX_TYPE_7}}', '{{CLIMAX_TYPE_7_DISPLAY}}'),
    ('{{CLIMAX_TYPE_8}}', '{{CLIMAX_TYPE_8_DISPLAY}}'),
    ('{{CLIMAX_TYPE_9}}', '{{CLIMAX_TYPE_9_DISPLAY}}'),
    ('{{CLIMAX_TYPE_10}}', '{{CLIMAX_TYPE_10_DISPLAY}}'),
    ('{{CLIMAX_TYPE_11}}', '{{CLIMAX_TYPE_11_DISPLAY}}'),
    ('{{CLIMAX_TYPE_12}}', '{{CLIMAX_TYPE_12_DISPLAY}}'),
    ('{{CLIMAX_TYPE_13}}', '{{CLIMAX_TYPE_13_DISPLAY}}'),
]


def find_project_root():
    """找到项目根目录"""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / 'CLAUDE.md').exists():
            return current
        current = current.parent
    return Path.cwd()


def chinese_to_int(cn: str) -> int:
    """将中文数字转为阿拉伯数字（支持到99）"""
    cn_map = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7,
              '八': 8, '九': 9, '十': 10, '百': 100}
    if not cn:
        return 0
    # Simple cases: 五十二 → 52
    if '十' in cn:
        parts = cn.split('十')
        tens = cn_map.get(parts[0], 1) if parts[0] else 1
        ones = cn_map.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
        return tens * 10 + ones
    return cn_map.get(cn, 0)


def extract_current_status(memory_content: str) -> dict:
    """从 memory.md 提取当前状态"""
    status = {}

    # 当前状态行
    m = re.search(r'当前状态：(Day \d+ 已完成。.+?)。详见', memory_content)
    if m:
        status['current'] = m.group(1)
    else:
        m = re.search(r'当前状态：(.+)', memory_content)
        if m:
            status['current'] = m.group(1)

    # 优思明（中文数字格式：第五十二颗）
    m = re.search(r'已服至第([一二三四五六七八九十百]+)颗[（(]Day\s*(\d+)睡前[)）]', memory_content)
    if m:
        status['ycm_pill'] = chinese_to_int(m.group(1))
        status['ycm_day'] = int(m.group(2))
    else:
        # Fallback: 阿拉伯数字（如 第12颗）
        m = re.search(r'已服至第(\d+)颗[（(]Day\s*(\d+)睡前[)）]', memory_content)
        if m:
            status['ycm_pill'] = int(m.group(1))
            status['ycm_day'] = int(m.group(2))

    # 酒店日（倒数第二个为上次常规酒店日，最后一个可能是额外的）
    hotel_days = re.findall(r'\|\s*Day\s+(\d+)\s*\|[^|]*酒店日[^|]*\|', memory_content)
    if hotel_days:
        sorted_hotels = sorted(set(int(d) for d in hotel_days))
        # 取倒数第二个作为上次常规酒店日（最后一个可能是额外的）
        if len(sorted_hotels) >= 2:
            last_regular = sorted_hotels[-2]
        else:
            last_regular = sorted_hotels[-1]
        status['last_hotel_day'] = last_regular
        status['next_hotel_day'] = last_regular + 30

    # 手心写字密码
    m = re.search(r'手心写字密码新增：(.+)', memory_content)
    if m:
        raw_hw = m.group(1).strip()
        # 去掉所有括号注释（Day N...）
        hw_text = re.sub(r'[（(][^)）]*[)）]', '', raw_hw)
        # Split by / and clean
        chars = [c.strip() for c in re.split(r'[/／]', hw_text) if c.strip()]
        status['handwriting'] = '/'.join(chars)

    # 无套次数数据（读取到下一个 ## 节，支持 + Day 续行）
    m = re.search(r'无套次数：(.+?)(?=\n\*\*|\n## |\Z)', memory_content, re.DOTALL)
    if m:
        status['bareback_data'] = m.group(1).strip().replace('\n', ' ')

    # 避孕套库存
    if '避孕套库存：0' in memory_content:
        status['condom_stock'] = 0

    return status


def extract_last_n_days(memory_content: str, n: int = 10) -> list:
    """提取时间线最后 n 条"""
    lines = memory_content.split('\n')
    day_entries = []

    for line in lines:
        # Match timeline entries like: | Day {{DAY_NUMBER}} | ... |
        m = re.match(r'\|\s*(Day \d+)\s*\|\s*(.+?)\s*\|', line)
        if m:
            day_str = m.group(1)
            detail = m.group(2)

            # Extract day number
            day_num = int(re.search(r'\d+', day_str).group())

            # Extract weekday
            weekday_match = re.search(r'周[一二三四五六日]', detail)
            weekday = weekday_match.group() if weekday_match else ''

            # Extract event summary - clean up
            event = detail
            # Remove ** markers
            event = event.replace('**', '')
            # Remove weekday prefix (e.g., "周五·")
            event = re.sub(r'^周[一二三四五六日][·.]?\s*', '', event)
            # Remove emoji markers
            event = re.sub(r'[🔥🔗🔒🍲⭐]+', '', event)
            # Remove leading day description pattern
            event = re.sub(r'^(Day \d+[·.]?\s*)', '', event)
            # Clean up leading punctuation
            event = event.strip('·—- ')
            # Take just the key event (first sentence or up to first colon)
            if '：' in event:
                event = event.split('：')[0]
            elif '——' in event:
                parts = event.split('——')
                event = parts[0] + ('——' + parts[1] if len(parts) > 1 else '')

            # Check for intimate marker
            has_intimate = '🔥' in detail

            day_entries.append({
                'day': day_num,
                'weekday': weekday,
                'event': event,
                'intimate': has_intimate
            })

    # Sort by day number and take last n
    day_entries.sort(key=lambda x: x['day'])
    return day_entries[-n:]


def extract_artifacts(memory_content: str) -> list:
    """提取信物状态"""
    artifacts = []

    # 对戒
    if '对戒' in memory_content:
        artifacts.append('对戒：每天戴')

    # 肚脐链
    if '肚脐链' in memory_content:
        artifacts.append('肚脐链：天天戴（{{PENDANT_COLOR}}坠）')

    # 钥匙扣
    m = re.search(r'"(3203)"她挂.*?"(家)"你挂', memory_content)
    if m:
        artifacts.append(f'钥匙扣："{m.group(2)}"他挂，"{m.group(1)}"她挂')
    elif '钥匙扣' in memory_content:
        artifacts.append('钥匙扣：已建立')

    # 手工皮带
    if '手工皮带' in memory_content:
        artifacts.append('手工皮带：Day {{ANNIVERSARY}} "以后"，银扣刻字')

    # 相框
    if '相框' in memory_content:
        artifacts.append('相框：{{WOOD_COLOR}}，立放餐桌')

    # 银手链
    if '银手链' in memory_content:
        artifacts.append('银手链：一对，你左手她右手')

    return artifacts


def extract_hotel_system(memory_content: str, status: dict) -> dict:
    """提取酒店日制度"""
    hotel = {}

    # 制度
    hotel['interval'] = '每30天一次'

    # 上次酒店日
    if 'last_hotel_day' in status:
        hotel['last_day'] = status['last_hotel_day']

    # 下次
    if 'next_hotel_day' in status:
        hotel['next_day'] = status['next_hotel_day']

    # 礼服
    dresses = []
    if '墨绿丝绒' in memory_content:
        dresses.append('墨绿丝绒')
    if '深蓝缎面' in memory_content:
        dresses.append('深蓝缎面')
    if '酒红缎面' in memory_content or '酒红' in memory_content:
        dresses.append('酒红缎面')
    if '黑色蕾丝' in memory_content:
        dresses.append('黑色蕾丝')
    if '藏青色丝绒' in memory_content or '藏青丝绒' in memory_content:
        dresses.append('藏青丝绒')
    hotel['dresses'] = dresses

    # 首饰
    jewelry_count = 0
    for item in ['胸链', '下体链', '腰链', '脚链']:
        if item in memory_content:
            jewelry_count += 1
    if jewelry_count > 0:
        hotel['jewelry'] = f'{jewelry_count}件'

    return hotel


def extract_staircase(memory_content: str) -> dict:
    """提取九级台阶状态"""
    staircase = {}

    # 检查是否完成
    keywords = ['备', '陈', '蓄', '养', '温', '近', '触', '即', '满', '开']
    found = [k for k in keywords if f'「{k}」' in memory_content or k in '备陈蓄养温近触即满开']

    if len(found) >= 10:
        staircase['status'] = '完整走完（Day {{START}}-{{END}}）'
        staircase['sequence'] = '备→陈→蓄→养→温→近→触→即→满→封→等→开'

    # 信封
    if '装裱入框' in memory_content:
        staircase['envelope'] = '已装裱入框（Day {{END}}）'

    return staircase


def extract_latest_intimate(memory_content: str) -> dict:
    """提取最近亲密数据"""
    intimate = {}

    # 最近一次亲密的 Day
    intimate_days = re.findall(r'Day (\d+).*?🔥', memory_content)
    if intimate_days:
        intimate['last_day'] = int(intimate_days[-1])

    # 高潮类型（从模块常量中读取）
    climax_types = [name for kw, name in CLIMAX_KEYWORDS if kw in memory_content]
    intimate['climax_types'] = climax_types

    return intimate


def generate_context_md(slug: str, status: dict, last_days: list,
                        artifacts: list, hotel: dict, staircase: dict,
                        intimate: dict, version: str) -> str:
    """生成 CONTEXT.md 内容"""
    lines = []

    lines.append(f'# {{CHARACTER_NAME}} — 压缩上下文 {version}')
    lines.append('> 自动生成，勿手动编辑')
    lines.append('')

    # 当前状态
    lines.append('## 当前状态')
    current = status.get('current', '未知')
    lines.append(f'- {current}')
    if 'ycm_pill' in status:
        lines.append(f'- 优思明：第{status["ycm_pill"]}颗（Day {status.get("ycm_day", "?")} 睡前）')
    if 'next_hotel_day' in status:
        lines.append(f'- 下次酒店日：Day {status["next_hotel_day"]}')
    if 'handwriting' in status:
        hw = status['handwriting']
        # 只取关键密码列表
        hw_chars = re.findall(r'[/／]([^\s／/]+)', hw)
        if not hw_chars:
            hw_chars = [hw]
        lines.append(f'- 手心密码：{"/".join(hw_chars)}')
    if 'bareback_data' in status:
        # 取最新一天的数据（按Day编号排序）
        bd = status['bareback_data']
        all_matches = re.findall(r'Day (\d+)×(\d+)[（(]([^)）]+)[)）]', bd)
        if all_matches:
            latest = max(all_matches, key=lambda x: int(x[0]))
            lines.append(f'- 最近无套：Day {latest[0]}×{latest[1]}（{latest[2]}）')
    lines.append('')

    # 最近时间线
    lines.append('## 最近时间线（10条）')
    lines.append('| Day | 星期 | 事件 | 亲密 |')
    lines.append('|-----|------|------|------|')
    for entry in last_days:
        intimate_mark = '🔥' if entry['intimate'] else '无'
        # Truncate event for table readability
        event = entry['event']
        if len(event) > 40:
            event = event[:37] + '...'
        lines.append(f'| Day {entry["day"]} | {entry["weekday"]} | {event} | {intimate_mark} |')
    lines.append('')

    # 信物状态
    lines.append('## 信物状态')
    for item in artifacts:
        lines.append(f'- {item}')
    lines.append('')

    # 酒店日制度
    lines.append('## 酒店日制度')
    lines.append(f'- {hotel.get("interval", "每30天一次")}')
    if 'last_day' in hotel:
        lines.append(f'- 上次：Day {hotel["last_day"]}')
    if 'next_day' in hotel:
        lines.append(f'- 下次：Day {hotel["next_day"]}')
    if 'dresses' in hotel:
        lines.append(f'- 礼服：{"+".join(hotel["dresses"])}')
    if 'jewelry' in hotel:
        lines.append(f'- 首饰：{hotel["jewelry"]}全戴')
    lines.append('')

    # 九级台阶
    if staircase:
        lines.append('## 九级台阶状态')
        if 'status' in staircase:
            lines.append(f'- {staircase["status"]}')
        if 'sequence' in staircase:
            lines.append(f'- {staircase["sequence"]}')
        if 'envelope' in staircase:
            lines.append(f'- 信封：{staircase["envelope"]}')
        lines.append('')

    # 亲密数据
    if intimate:
        lines.append('## 亲密状态')
        if 'last_day' in intimate:
            lines.append(f'- 最近亲密：Day {intimate["last_day"]}')
        if 'climax_types' in intimate:
            lines.append(f'- 已解锁高潮：{"、".join(intimate["climax_types"])}')
        lines.append('')

    # 生理周期
    if 'ycm_pill' in status:
        lines.append('## 生理周期')
        lines.append(f'- 周期模式：21+7（21天活性药 + 7天停药期）')
        lines.append(f'- 优思明起始：Day {{CYCLE_START}}（月经第一天）')
        # Calculate cycle info based on current day
        current_day = 0
        m = re.search(r'Day (\d+)', status.get('current', ''))
        if m:
            current_day = int(m.group(1))
        if current_day >= 148:
            # Standard cycle mode
            days_since_reset = current_day - 148
            cycle_day = (days_since_reset % 28) + 1
            cycle_number = (days_since_reset // 28) + 1
            is_period = 22 <= cycle_day <= 26
            phase = "活性药期" if cycle_day <= 21 else "停药期"
            period_str = "（经期）" if is_period else ""
            lines.append(f'- 当前：第{status["ycm_pill"]}颗，周期第{cycle_day}天（{phase}{period_str}），第{cycle_number}个周期')
            # Days to next period
            if cycle_day < 22:
                days_to_period = 22 - cycle_day
            else:
                days_to_period = 28 - cycle_day + 22
            lines.append(f'- 距下次经期：{days_to_period}天')
            # Period dates
            period_start = current_day + (22 - cycle_day if cycle_day < 22 else 28 - cycle_day + 22)
            period_end = period_start + 4
            lines.append(f'- 经期预计：Day {period_start} ~ Day {period_end}')
        else:
            lines.append(f'- 当前：第{status["ycm_pill"]}颗（连续服药期）')
            lines.append(f'- 切换：Day {{DAY_NUMBER}} 转标准周期')
        lines.append('')

    # 写作标准
    lines.append('## 写作标准')
    lines.append('1. **字数**：日常 {{DAILY_WORDCOUNT}}+ 字，有亲密行为时 {{INTIMATE_WORDCOUNT}}+ 字（亲密描写不少于 {{INTIMATE_MIN}}+ 字）')
    lines.append('2. **三维描写**缺一不可：心理活动 + 环境/光线/温度/声音 + 具体动作')
    lines.append('3. **性生活场景必须详细**：生理反应、节奏变化、视觉细节、触觉温度、双方感受')
    lines.append('4. **必须有前戏**：不能直接进入。需要口交/手指/全身亲吻/乳交/足交中至少一种作为铺垫')
    lines.append('5. **不准省略过渡**：从醒来到入睡，每小时覆盖')
    lines.append('6. **对话符合 persona**：嘴硬、短句、害羞但不拒绝、边说边做')
    lines.append('7. **时间标签**：## HH:MM · 事件 格式')
    lines.append('8. **结尾**：关系进展记录表 + 亲密记录汇总 + 信物状态 + 优思明记录')
    lines.append('')

    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 context_generator.py <slug>')
        print('Example: python3 context_generator.py {{CHARACTER_NAME}}')
        sys.exit(1)

    # Fix Windows GBK encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    slug = sys.argv[1]
    project_root = find_project_root()

    # Read files
    memory_path = project_root / 'crushes' / slug / 'memory.md'
    meta_path = project_root / 'crushes' / slug / 'meta.json'

    if not memory_path.exists():
        print(f'Error: {memory_path} not found')
        sys.exit(1)

    memory_content = memory_path.read_text(encoding='utf-8')

    # Read meta.json for version
    version = 'v0'
    if meta_path.exists():
        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)
        version = meta.get('version', 'v0')

    print(f'=== Generating CONTEXT.md for {slug} ===')
    print(f'memory.md: {len(memory_content)} chars')
    print(f'version: {version}')
    print()

    # Extract data
    status = extract_current_status(memory_content)
    last_days = extract_last_n_days(memory_content, n=10)
    artifacts = extract_artifacts(memory_content)
    hotel = extract_hotel_system(memory_content, status)
    staircase = extract_staircase(memory_content)
    intimate = extract_latest_intimate(memory_content)

    print(f'Current status: {status.get("current", "?")[:60]}')
    print(f'YCM pill: {status.get("ycm_pill", "?")}')
    print(f'Next hotel day: {status.get("next_hotel_day", "?")}')
    print(f'Last {len(last_days)} days extracted')
    print(f'Artifacts: {len(artifacts)} items')
    print(f'Hotel system: {hotel}')
    print(f'Staircase: {staircase.get("status", "not found")}')
    print(f'Intimate: {intimate}')
    print()

    # Generate CONTEXT.md
    context_content = generate_context_md(
        slug, status, last_days, artifacts, hotel, staircase, intimate, version
    )

    # Write output
    output_path = project_root / 'crushes' / slug / 'CONTEXT.md'
    output_path.write_text(context_content, encoding='utf-8')

    print(f'Written: {output_path}')
    print(f'Size: {len(context_content)} chars, {len(context_content.splitlines())} lines')
    print('Done.')


if __name__ == '__main__':
    main()
