/**
 * 碎片日记数据模型（TS 等价实现，取代 src/scripts/fragment/models.py）。
 *
 * 包含：枚举类型（字符串联合）、Fragment/FragmentDay 接口、常量映射。
 */
// ============================================================
// 枚举（字符串联合类型，等价 Python Enum）
// ============================================================

/** 碎片日期状态 */
export type FragmentStatus =
  | 'in_progress'
  | 'unfinished'
  | 'expired'
  | 'completed'

/** 写作模式 */
export type WritingMode = 'raw' | 'guided' | 'themed' | 'blind'

/** 来源标签 */
export type Origin = 'user' | 'crush' | 'ambient'

/** 情绪标签 */
export type Mood = 'positive' | 'negative' | 'neutral' | 'mixed'

/** 编辑状态 */
export type EditState =
  | 'editable'
  | 'readonly_regenerable'
  | 'readonly_final'

// ============================================================
// 数据接口（等价 Python @dataclass）
// ============================================================

/** 碎片卡片数据结构 */
export interface Fragment {
  id: string
  date: string
  time: string | null
  origin: string
  mood: string | null
  content: string
  env_tags: string[]
  behavior_tags: string[]
  custom_tags: string[]
  writing_mode: string
  theme: string | null
  crush_slug: string
  created_at: string
  updated_at: string
}

/** 日期级别碎片数据 */
export interface FragmentDay {
  date: string
  crush_slug: string
  fragments: Fragment[]
  completed: boolean
  direction: string | null
  writing_context: string | null
  version: number
  integration_date: string | null
  created_at: string
  updated_at: string
}

// ============================================================
// Fragment 序列化/反序列化
// ============================================================

export function fragmentToDict(f: Fragment): Record<string, unknown> {
  return {
    id: f.id,
    date: f.date,
    time: f.time,
    origin: f.origin,
    mood: f.mood,
    content: f.content,
    env_tags: f.env_tags,
    behavior_tags: f.behavior_tags,
    custom_tags: f.custom_tags,
    writing_mode: f.writing_mode,
    theme: f.theme,
    crush_slug: f.crush_slug,
    created_at: f.created_at,
    updated_at: f.updated_at,
  }
}

export function fragmentFromDict(data: Record<string, any>): Fragment {
  return {
    id: data['id'],
    date: data['date'],
    time: data['time'] ?? null,
    origin: data['origin'],
    mood: data['mood'] ?? null,
    content: data['content'] ?? '',
    env_tags: data['env_tags'] ?? [],
    behavior_tags: data['behavior_tags'] ?? [],
    custom_tags: data['custom_tags'] ?? [],
    writing_mode: data['writing_mode'],
    theme: data['theme'] ?? null,
    crush_slug: data['crush_slug'],
    created_at: data['created_at'],
    updated_at: data['updated_at'],
  }
}

// ============================================================
// FragmentDay 序列化/反序列化
// ============================================================

export function fragmentDayToDict(day: FragmentDay): Record<string, unknown> {
  return {
    date: day.date,
    crush_slug: day.crush_slug,
    fragments: day.fragments.map(fragmentToDict),
    completed: day.completed,
    direction: day.direction,
    writing_context: day.writing_context,
    version: day.version,
    integration_date: day.integration_date,
    created_at: day.created_at,
    updated_at: day.updated_at,
  }
}

export function fragmentDayFromDict(data: Record<string, any>): FragmentDay {
  return {
    date: data['date'],
    crush_slug: data['crush_slug'],
    fragments: (data['fragments'] ?? []).map((f: any) => fragmentFromDict(f)),
    completed: data['completed'] ?? false,
    direction: data['direction'] ?? null,
    writing_context: data['writing_context'] ?? null,
    version: data['version'] ?? 1,
    integration_date: data['integration_date'] ?? null,
    created_at: data['created_at'],
    updated_at: data['updated_at'],
  }
}

// ============================================================
// FragmentDay 方法（等价 Python 类方法）
// ============================================================

export function getFragmentCount(day: FragmentDay): number {
  return day.fragments.length
}

export function getNonEmptyFragments(day: FragmentDay): Fragment[] {
  return day.fragments.filter((f) => f.content && f.content.trim().length > 0)
}

export function hasContent(day: FragmentDay): boolean {
  return getNonEmptyFragments(day).length > 0
}

// ============================================================
// 常量（等价 Python 模块级常量）
// ============================================================

export const ORIGIN_DISPLAY: Record<string, string> = {
  user: '用户',
  crush: 'Crush',
  ambient: '环境',
}

export const MOOD_EMOJI: Record<string, string> = {
  positive: '😊',
  negative: '😢',
  neutral: '😐',
  mixed: '😶',
}

export const MOOD_DISPLAY: Record<string, string> = {
  positive: '开心',
  negative: '在意',
  neutral: '平静',
  mixed: '复杂',
}

export const MOOD_MODIFIERS: Record<string, string> = {
  positive: '开心',
  negative: '在意',
  neutral: '日常',
  mixed: '心情复杂',
}

export const WRITING_MODE_DISPLAY: Record<string, string> = {
  raw: 'Raw',
  guided: 'Guided',
  themed: 'Themed',
  blind: 'Blind',
}

export const DIRECTION_OPTIONS = [
  { id: 'casual', name: '轻松的', description: '记录一些日常小事' },
  { id: 'concerned', name: '有些在意的', description: '说说那些让你在意的事' },
  { id: 'deep', name: '想深入的', description: '展开聊聊这个话题' },
]

export const DIRECTION_PROMPTS: Record<string, string> = {
  '轻松的': '记录一些日常小事',
  '有些在意的': '说说那些让你在意的事',
  '想深入的': '展开聊聊这个话题',
}

export const DIRECTION_MOOD_MAP: Record<string, string> = {
  '轻松的': 'positive',
  '有些在意的': 'negative',
  '想深入的': 'mixed',
}

export const THEME_OPTIONS = [
  { id: 'work_study', name: '工作/学习', description: '与工作、学习相关的互动' },
  { id: 'daily_life', name: '生活日常', description: '日常生活中的小事' },
  { id: 'date_outing', name: '约会/出行', description: '约会、外出相关的场景' },
  { id: 'emotional', name: '情感交流', description: '深入的情感对话' },
  { id: 'hobby', name: '兴趣爱好', description: '与兴趣、爱好相关' },
  { id: 'holiday', name: '节日/纪念日', description: '节日、纪念日相关' },
  { id: 'conflict', name: '争吵/误会', description: '冲突、误会相关' },
  { id: 'reconcile', name: '和好/道歉', description: '和好、道歉相关' },
]

export const THEME_PROMPTS: Record<string, string> = {
  '工作/学习': '与工作、学习相关的互动',
  '生活日常': '日常生活中的小事',
  '约会/出行': '约会、外出相关的场景',
  '情感交流': '深入的情感对话',
  '兴趣爱好': '与兴趣、爱好相关',
  '节日/纪念日': '节日、纪念日相关',
  '争吵/误会': '冲突、误会相关',
  '和好/道歉': '和好、道歉相关',
}
