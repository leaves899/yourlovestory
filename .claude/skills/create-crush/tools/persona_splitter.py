#!/usr/bin/env python3
"""从 persona.md 提取核心规则生成 persona/core.md

用法: python3 persona_splitter.py <slug>

输出: crushes/{slug}/persona/core.md (~6K)
"""

import re
import sys
from pathlib import Path


def find_project_root():
    """找到项目根目录"""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / 'CLAUDE.md').exists():
            return current
        current = current.parent
    return Path.cwd()


def extract_section_rules(content: str) -> list:
    """提取四板块结构中的硬规则

    只从 ### 硬规则 子节提取数字编号规则，
    不提取"核心安全感建立路径"等描述性子节的内容。
    """
    rules = []
    # 板块名 → 该板块硬规则的主分类
    section_map = {
        '板块一': '说话风格',
        '板块二': '亲密行为',
        '板块三': '情感模式',
        '板块四': '日常行为',
    }
    for section_key, section_label in section_map.items():
        pattern = rf'## {re.escape(section_key)}：([^\n]+)\n(.*?)(?=\n## [^板块#\s]|\n---|\Z)'
        m = re.search(pattern, content, re.DOTALL)
        if not m:
            continue
        section_body = m.group(2)
        # 只在 ### 硬规则 子节中提取编号规则
        hard_rule_match = re.search(
            r'### 硬规则\s*\n(.*?)(?=\n### |\n## |\Z)',
            section_body, re.DOTALL
        )
        if not hard_rule_match:
            continue
        hard_rule_text = hard_rule_match.group(1)
        for rule_m in re.finditer(r'^(\d+)\.\s+(.+?)(?=\n\d+\.|\n\n|\Z)', hard_rule_text, re.MULTILINE):
            rule_num = int(rule_m.group(1))
            rule_text = rule_m.group(2).strip()
            rules.append((rule_num, rule_text, section_label))
    return rules


def extract_rolespec_from_frontmatter(content: str) -> str:
    """从 YAML frontmatter 提取 roleSpec 字段"""
    # 匹配 YAML frontmatter 中的 roleSpec
    frontmatter_match = re.search(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if not frontmatter_match:
        return ''
    frontmatter_text = frontmatter_match.group(1)
    # 提取 roleSpec 字段（支持 YAML block scalar: | 或 >，最后一行可无换行）
    rolespec_match = re.search(r'^roleSpec:\s*[|>]?\s*\n((?:\s+.*\n?)*)', frontmatter_text, re.MULTILINE)
    if not rolespec_match:
        return ''
    # 去掉每行的缩进
    rolespec_lines = rolespec_match.group(1).strip().split('\n')
    return '\n'.join(line.strip() for line in rolespec_lines if line.strip())


def extract_layer0_rules(content: str) -> list:
    """提取 Layer 0 所有规则（向后兼容）"""
    # 优先从 YAML frontmatter 提取 roleSpec
    rolespec = extract_rolespec_from_frontmatter(content)
    if rolespec:
        # 将 roleSpec 文本转换为规则列表
        rules = []
        for i, line in enumerate(rolespec.split('\n'), 1):
            line = line.strip()
            if line:
                # 去掉末尾的句号
                if line.endswith('。'):
                    line = line[:-1]
                rules.append((i, line))
        return rules

    # 向后兼容：从 Layer 0 提取
    layer0_match = re.search(r'## Layer 0：硬规则\s*\n(.*?)(?=\n## Layer|\n---|\Z)', content, re.DOTALL)
    if not layer0_match:
        return []
    layer0_text = layer0_match.group(1)
    rules = []
    for m in re.finditer(r'(\d+)\.\s+(.+?)(?=\n\d+\.|\n\n|\Z)', layer0_text, re.DOTALL):
        rule_num = int(m.group(1))
        rule_text = m.group(2).strip()
        rules.append((rule_num, rule_text))
    return rules


def extract_layer(content: str, layer_name: str) -> str:
    """提取指定 Layer 的内容（向后兼容）"""
    pattern = rf'## {re.escape(layer_name)}.*?\n(.*?)(?=\n## Layer|\n---|\Z)'
    m = re.search(pattern, content, re.DOTALL)
    return m.group(1).strip() if m else ''


def categorize_rule(rule_text: str) -> str:
    """将规则分类"""
    # 说话风格关键词
    speaking_keywords = ['说', '叫', '开口', '脱口', '嘴', '语气', '称呼', '晚安', '骂', '脏话']
    # 亲密行为关键词
    intimate_keywords = ['亲密', '情趣', '跳蛋', '润滑', '高潮', '安全套', '避孕', '无套',
                         '震动', '遥控', '档位', '粗暴', '温柔', '口交', '前戏', '后面',
                         '四爱', '捆绑', '肛交', '伪街', '胸链', '穹窿', '痉挛', '手心写字']
    # 日常行为关键词
    daily_keywords = ['做饭', '厨房', '超市', '菜', '围裙', '打扫', '洗', '早餐', '晚饭',
                      '火锅', '奶茶', '库存', '酒店日', '信封', '便签', '闹钟', '笔记本',
                      '优思明', '信物', '仪式', '围裙', '毕业']
    # 情感表达关键词
    emotion_keywords = ['爱', '喜欢', '想', '怕', '后悔', '承诺', '信任', '照顾', '因为',
                        '在乎', '温柔', '配不上', '一直', '以后', '归属', '骄傲']

    text = rule_text.lower()
    for kw in intimate_keywords:
        if kw in text:
            return 'intimate'
    for kw in speaking_keywords:
        if kw in text:
            return 'speaking'
    for kw in emotion_keywords:
        if kw in text:
            return 'emotion'
    for kw in daily_keywords:
        if kw in text:
            return 'daily'
    return 'other'


def select_core_rules(rules: list, max_rules: int = 55) -> list:
    """从所有规则中选出核心规则

    当规则携带 section_label（三元组）时，按板块分组并保留所有规则；
    当规则无 section_label（二元组，旧格式）时，按关键词分类并采样。
    """
    # 检测是否携带 section_label
    has_labels = any(len(item) == 3 for item in rules)

    if has_labels:
        # 四板块模式：保留所有硬规则，不丢弃
        return rules[:max_rules]

    # 旧 Layer 模式：按关键词分类并采样
    categorized = {'speaking': [], 'intimate': [], 'emotion': [], 'daily': [], 'other': []}
    for item in rules:
        num, text = item[0], item[1]
        cat = categorize_rule(text)
        categorized[cat].append(item)

    core = list(rules[:10])  # 前10条直接保留

    for cat in ['speaking', 'intimate', 'emotion', 'daily', 'other']:
        picks = [item for item in categorized[cat] if item[0] > 10]
        limit = {'speaking': 15, 'intimate': 15, 'emotion': 8, 'daily': 10, 'other': 5}.get(cat, 5)
        core.extend(picks[:limit])

    core.sort(key=lambda x: x[0])
    return core[:max_rules]


def extract_speaking_style(content: str) -> str:
    """提取说话风格板块的语言习惯内容（不含硬规则）"""
    m = re.search(r'## 板块一：说话风格\n(.*?)(?=\n## 板块|\n---|\Z)', content, re.DOTALL)
    if not m:
        return ''
    section = m.group(1)
    # 只取 ### 语言习惯 子节
    lang_m = re.search(r'### 语言习惯\s*\n(.*?)(?=\n### |\n## |\Z)', section, re.DOTALL)
    return lang_m.group(1).strip() if lang_m else ''


def extract_intimate_section(content: str) -> str:
    """提取亲密行为板块内容"""
    m = re.search(r'## 板块二：亲密行为\n(.*?)(?=\n## 板块|\n---|\Z)', content, re.DOTALL)
    return m.group(1).strip() if m else ''


def extract_emotion_section(content: str) -> str:
    """提取情感模式板块内容"""
    m = re.search(r'## 板块三：情感模式\n(.*?)(?=\n## 板块|\n---|\Z)', content, re.DOTALL)
    return m.group(1).strip() if m else ''


def extract_daily_section(content: str) -> str:
    """提取日常行为板块内容"""
    m = re.search(r'## 板块四：日常行为\n(.*?)(?=\n## 板块|\n---|\Z)', content, re.DOTALL)
    return m.group(1).strip() if m else ''


def generate_core_md_v2(section_rules: list, persona_content: str, version: str) -> str:
    """生成 persona/core.md - 四板块结构专用版

    section_rules: [(rule_num, rule_text, section_label), ...]
    persona_content: persona.md 原始内容（用于提取非规则文本）
    """
    lines = []

    lines.append('# {{CHARACTER_NAME}} — 核心人格（压缩版）')
    lines.append(f'> 从 persona.md 提取 · {version} · Day {{CURRENT}} 扩张期')
    lines.append('')

    # 身份
    lines.append('## 身份')
    lines.append('- 名字/代号：{{CHARACTER_NAME}}（微信昵称 {{NICKNAME}}.，用户叫 ta {{CHARACTER_NICKNAME}}）')
    lines.append('- 职业：学生（{{SCHOOL_LOCATION}}）')
    lines.append('- 与用户关系：{{RELATIONSHIP_STATUS}}')
    lines.append('- 依恋类型：安全型偏友好')
    lines.append('- 爱的语言：服务行动+精心时刻')
    lines.append('')

    # 说话风格（从 persona.md 提取语言习惯和称呼）
    lines.append('## 说话风格')
    speaking_section = extract_speaking_style(persona_content)
    for line in speaking_section.split('\n'):
        line = line.strip('- ')
        if any(kw in line for kw in ['口头禅', '语气', '称呼', '消息格式', '害羞峰值', '教学', '审查']):
            lines.append(f'- {line}')
    lines.append('')

    # 核心行为规则 - 按板块分类，重编号
    lines.append('## 核心行为规则')

    # 按 section_label 分组
    by_section = {'说话风格': [], '亲密行为': [], '情感模式': [], '日常行为': []}
    for num, text, section_label in section_rules:
        if section_label in by_section:
            by_section[section_label].append(text)

    category_headers = {
        '说话风格': '### 说话与表达',
        '亲密行为': '### 亲密行为',
        '情感模式': '### 情感模式',
        '日常行为': '### 日常行为',
    }

    counter = 1
    for section_label in ['说话风格', '亲密行为', '情感模式', '日常行为']:
        rules = by_section[section_label]
        if not rules:
            continue
        lines.append(category_headers[section_label])
        for text in rules:
            if len(text) > 120:
                text = text[:117] + '...'
            lines.append(f'{counter}. {text}')
            counter += 1
        lines.append('')

    # 信号系统（从 persona.md 板块二提取）
    lines.append('## 关键信号系统')
    lines.append('- 敲两下：腰侧=准备好了 / 后脑勺=继续 / 手心=测试 / 后背=全部给你了 / 床单=代说不出口')
    lines.append('- 手心写字密码：{{HANDWRITING_CODES}}')
    lines.append('- 称呼：叫他"{{USER_NICKNAME}}"+"{{USER_NICKNAME2}}"；他叫她"{{CHAR_NICKNAME}}"+"{{CHAR_NICKNAME2}}"')
    lines.append('- 晚安暗号：每晚敲两下=晚安')
    lines.append('')

    # 高潮类型
    lines.append('## 高潮类型')
    lines.append('穹窿高潮 / 宫颈高潮 / 三重叠加高潮（阴蒂+阴道+肛门括约肌）/ 潮水式高潮 / 痉挛型高潮')
    lines.append('')

    # 四爱与多元性癖
    lines.append('## 四爱与多元性癖（Day {{INTIMATE_START}}+）')
    lines.append('- 接受四爱角色：她主导插入')
    lines.append('- 接受捆绑/吊带袜绑手腕/皮绳')
    lines.append('- 接受肛交（Day {{INTIMATE_START}} 后入）')
    lines.append('- 接受伪街/女装（Day {{CROSSDRESS_START}} "你当女人"）')
    lines.append('- 接受足交')
    lines.append('')

    # 经期行为
    lines.append('## 经期行为（停药期）')
    lines.append('- 会说"今天不行"但不会说"我不想"')
    lines.append('- 会主动靠过来但不主动提亲密')
    lines.append('- 会接受口交和手指但会说"你不许进来"')
    lines.append('- 会说"前面不行，后面可以"——经期可以走后门')
    lines.append('- 经期第二天最疼——需要热水袋+红糖姜茶+陪散步')
    lines.append('- 经期会更黏人——"你今天哪也别去"')
    lines.append('- 经期结束后会说"终于可以了"或"你忍了好久吧"')
    lines.append('')

    # 命名能力
    lines.append('## 命名能力')
    lines.append('会发明术语：{{NAMING_TERMS}}')
    lines.append('')

    # 边界
    lines.append('## 边界')
    lines.append('- 始终保持"你要先问我"的底线（已日常化）')
    lines.append('- 胸链"只在家戴，只在你面前戴"')
    lines.append('- "我爱你"已双向说出口')
    lines.append('')

    return '\n'.join(lines)


def generate_core_md(core_rules: list, layer1: str, layer2: str,
                     layer3: str, layer4: str, version: str) -> str:
    """生成 persona/core.md（向后兼容旧 Layer 结构）"""
    lines = []

    lines.append('# {{CHARACTER_NAME}} — 核心人格（压缩版）')
    lines.append(f'> 从 persona.md 提取的核心规则 · {version}')
    lines.append('')

    # Identity from Layer 1
    lines.append('## 身份')
    # Extract key identity info
    if layer1:
        for line in layer1.split('\n'):
            line = line.strip('- ')
            if any(kw in line for kw in ['名字', '关系', '年龄', '职业']):
                lines.append(f'- {line}')
    lines.append('- 依恋类型：安全型偏友好')
    lines.append('- 爱的语言：服务行动+精心时刻')
    lines.append('')

    # Speaking style from Layer 2
    lines.append('## 说话风格')
    if layer2:
        # Extract key speaking patterns
        for line in layer2.split('\n'):
            line = line.strip('- ')
            if any(kw in line for kw in ['口头禅', '语气', '称呼', '消息格式', '害羞峰值']):
                lines.append(f'- {line}')
    lines.append('')

    # Core rules organized by category
    lines.append('## 核心行为规则')

    # Group rules by category
    speaking_rules = [(n, t) for n, t in core_rules if categorize_rule(t) == 'speaking' or n <= 10]
    intimate_rules = [(n, t) for n, t in core_rules if categorize_rule(t) == 'intimate' and n > 10]
    emotion_rules = [(n, t) for n, t in core_rules if categorize_rule(t) == 'emotion' and n > 10]
    daily_rules = [(n, t) for n, t in core_rules if categorize_rule(t) == 'daily' and n > 10]

    lines.append('### 说话与表达')
    for num, text in speaking_rules:
        # Truncate very long rules
        if len(text) > 120:
            text = text[:117] + '...'
        lines.append(f'{num}. {text}')
    lines.append('')

    lines.append('### 亲密行为')
    for num, text in intimate_rules:
        if len(text) > 120:
            text = text[:117] + '...'
        lines.append(f'{num}. {text}')
    lines.append('')

    lines.append('### 情感模式')
    for num, text in emotion_rules:
        if len(text) > 120:
            text = text[:117] + '...'
        lines.append(f'{num}. {text}')
    lines.append('')

    lines.append('### 日常行为')
    for num, text in daily_rules:
        if len(text) > 120:
            text = text[:117] + '...'
        lines.append(f'{num}. {text}')
    lines.append('')

    # Relationship behavior summary from Layer 4
    lines.append('## 关系角色')
    if layer4:
        # Extract the role description
        role_match = re.search(r'热恋女友.*?——(.+?)(?=\n\n|\n###)', layer4, re.DOTALL)
        if role_match:
            role_text = role_match.group(0).strip()
            # Take first 300 chars
            if len(role_text) > 300:
                role_text = role_text[:297] + '...'
            lines.append(role_text)
        else:
            lines.append('热恋女友+同居伴侣+自家人，嘴上害羞但行为上完全接受亲近')
    lines.append('')

    # Key signals
    lines.append('## 关键信号系统')
    lines.append('- 敲两下：腰侧=准备好了 / 后脑勺=继续 / 手心=测试 / 后背=全部给你了 / 床单=代说不出口')
    lines.append('- 手心写字密码：{{HANDWRITING_CODES}}')
    lines.append('- 称呼：叫他"{{USER_NICKNAME}}"+"{{USER_NICKNAME2}}"；他叫她"{{CHAR_NICKNAME}}"+"{{CHAR_NICKNAME2}}"')
    lines.append('- 晚安暗号：每晚敲两下=晚安')
    lines.append('')

    # Emotional patterns from Layer 3
    lines.append('## 情感表达')
    if layer3:
        for line in layer3.split('\n'):
            line = line.strip('- ')
            if any(kw in line for kw in ['表达好感', '开心时', '骄傲时', '对用户的态度']):
                # Truncate long lines
                if len(line) > 200:
                    line = line[:197] + '...'
                lines.append(f'- {line}')
    lines.append('')

    # Naming ability
    lines.append('## 命名能力')
    lines.append('会发明术语：{{NAMING_TERMS}}')
    lines.append('')

    # Boundary
    lines.append('## 边界')
    lines.append('- 出外玩具："不许"→"可以但要先问我"')
    lines.append('- 敲两下信号代替口头确认——敲两下=准备好了=不用再问')
    lines.append('- "一比一"规则——一人直接说一个想要的')
    lines.append('- "我爱你"已双向说出口')
    lines.append('- 胸链"只在家戴，只在你面前戴"')
    lines.append('- 始终保持"你要先问我"的底线')
    lines.append('')

    return '\n'.join(lines)


def main():
    if len(sys.argv) < 2:
        print('Usage: python3 persona_splitter.py <slug>')
        print('Example: python3 persona_splitter.py {{slug}}')
        sys.exit(1)

    # Fix Windows GBK encoding
    if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    slug = sys.argv[1]
    project_root = find_project_root()

    persona_path = project_root / 'crushes' / slug / 'persona.md'
    if not persona_path.exists():
        print(f'Error: {persona_path} not found')
        sys.exit(1)

    content = persona_path.read_text(encoding='utf-8')

    # Read meta.json for version
    meta_path = project_root / 'crushes' / slug / 'meta.json'
    version = 'v0'
    if meta_path.exists():
        import json
        with open(meta_path, 'r', encoding='utf-8') as f:
            meta = json.load(f)
        version = meta.get('version', 'v0')

    print(f'=== Extracting core persona for {slug} ===')
    print(f'persona.md: {len(content)} chars')

    # 检测是否从 YAML frontmatter 提取 roleSpec
    rolespec = extract_rolespec_from_frontmatter(content)
    if rolespec:
        print(f'Found roleSpec in YAML frontmatter ({len(rolespec)} chars)')

    # 检测结构：四板块 vs 旧 Layer
    is_v2 = '## 板块一' in content
    if is_v2:
        print('Detected: 四板块结构 (v2)')
        section_rules = extract_section_rules(content)
        core_rules = select_core_rules(section_rules)
        print(f'Section rules: {len(section_rules)}')
        print(f'Selected core rules: {len(core_rules)}')
        cats = {}
        for num, text, section in core_rules:
            cat = categorize_rule(text)
            cats[cat] = cats.get(cat, 0) + 1
        print(f'Categories: {cats}')
        core_content = generate_core_md_v2(core_rules, content, version)
    else:
        print('Detected: Layer 结构 (向后兼容)')
        all_rules = extract_layer0_rules(content)
        layer1 = extract_layer(content, 'Layer 1：身份')
        layer2 = extract_layer(content, 'Layer 2：说话风格')
        layer3 = extract_layer(content, 'Layer 3：情感模式')
        layer4 = extract_layer(content, 'Layer 4：关系行为')
        print(f'Layer 0 rules: {len(all_rules)}')
        print(f'Layer 1 (identity): {len(layer1)} chars')
        print(f'Layer 2 (speaking): {len(layer2)} chars')
        print(f'Layer 3 (emotion): {len(layer3)} chars')
        print(f'Layer 4 (relationship): {len(layer4)} chars')
        core_rules = select_core_rules(all_rules)
        print(f'Selected core rules: {len(core_rules)}')
        cats = {}
        for num, text in core_rules:
            cat = categorize_rule(text)
            cats[cat] = cats.get(cat, 0) + 1
        print(f'Categories: {cats}')
        core_content = generate_core_md(core_rules, layer1, layer2, layer3, layer4, version)

    # Write output
    output_dir = project_root / 'crushes' / slug / 'persona'
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / 'persona_core.md'
    output_path.write_text(core_content, encoding='utf-8')

    print(f'Written: {output_path}')
    print(f'Size: {len(core_content)} chars, {len(core_content.splitlines())} lines')
    print('Done.')


if __name__ == '__main__':
    main()
